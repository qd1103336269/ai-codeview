import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AiCodeviewConfig, OutputFormat, Severity } from "../config/config-schema.js";
import { loadConfig } from "../config/load-config.js";
import { chunkReviewInput } from "../diff/chunk-review-input.js";
import { filterReviewFiles } from "../diff/filter-review-files.js";
import { parseGitDiff } from "../diff/parse-git-diff.js";
import { AppError, toAppError } from "../errors/app-error.js";
import { collectGitDiff as defaultCollectGitDiff } from "../git/git-client.js";
import { collectPathReviewFiles } from "../input/path-input.js";
import type { PathReviewFile } from "../input/path-input.js";
import type { AiProvider } from "../providers/ai-provider.js";
import { DeepSeekProvider } from "../providers/deepseek-provider.js";
import { resolveExitCode } from "../report/exit-code.js";
import { renderJsonReport } from "../report/json-report.js";
import { renderMarkdownReport } from "../report/markdown-report.js";
import { renderSummaryReport } from "../report/summary-report.js";
import { renderTextReport } from "../report/text-report.js";
import { reviewChunks } from "../review/review-orchestrator.js";
import type { ReviewReport } from "../review/review-schema.js";
import { detectSecretsInDiffFiles, detectSecretsInTextFiles } from "../security/detect-secrets.js";

export interface ReviewCommandOptions {
  staged?: boolean;
  base?: string;
  changed?: boolean;
  path?: string[];
  summary?: boolean;
  format?: OutputFormat;
  failOn?: Severity;
  output?: string;
  color?: boolean;
  allowSecrets?: boolean;
}

export interface ReviewCommandDeps {
  collectGitDiff?: typeof defaultCollectGitDiff;
  provider?: AiProvider;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  onProgress?: (message: string) => void;
}

export interface CommandResult {
  exitCode: 0 | 1 | 2;
  output: string;
}

export async function runReviewCommand(
  options: ReviewCommandOptions,
  deps: ReviewCommandDeps = {},
): Promise<CommandResult> {
  const collectGitDiff = deps.collectGitDiff ?? defaultCollectGitDiff;
  const requestedFormat = options.format ?? "text";

  try {
    const cwd = deps.cwd ?? process.cwd();
    const progress = deps.onProgress ?? noopProgress;
    progress("开始进行代码 review...");
    progress("读取配置...");
    if (options.path?.length && (options.staged || options.base)) {
      throw new AppError({
        code: "INVALID_PATH_INPUT",
        message: "不能同时使用 --path 与 --staged 或 --base。",
        exitCode: 2,
        recoverable: false,
      });
    }
    if (options.changed && (options.staged || options.base || options.path?.length)) {
      throw new AppError({
        code: "INVALID_CONFIG",
        message: "不能同时使用 --changed 与 --staged、--base 或 --path。",
        exitCode: 2,
        recoverable: false,
      });
    }
    const outputOverride = options.output ?? (options.format ? null : undefined);
    const config = await loadConfig({
      cwd,
      overrides: {
        failOn: options.failOn,
        format: options.format,
        output: outputOverride,
        allowSecrets: options.allowSecrets,
      },
    });
    const pathMode = Boolean(options.path?.length);
    let pathFiles: PathReviewFile[] = [];
    let parsed: ReturnType<typeof parseGitDiff> = [];
    if (pathMode) {
      progress("校验输入路径...");
      progress("读取代码文件...");
      pathFiles = await collectPathReviewFiles({ paths: options.path ?? [], ignore: config.ignore, cwd });
      parsed = pathFiles;
    } else {
      progress("收集 Git diff...");
      const rawDiff = await collectGitDiff(getGitDiffInput(options));
      progress("解析 diff...");
      parsed = parseGitDiff(rawDiff);
    }
    if (!config.security.allowSecrets) {
      progress("检查敏感信息...");
      if (pathMode) {
        assertNoTextSecrets(pathFiles);
      } else {
        assertNoSecrets(parsed);
      }
    } else {
      progress("跳过敏感信息检查。");
    }
    progress("过滤无需审查的文件...");
    const filtered = filterReviewFiles(parsed, config.ignore);
    progress("准备审查分块...");
    const chunks = chunkReviewInput(filtered.reviewable, 40_000);
    const provider = deps.provider ?? createDeepSeekProvider(config, deps.env ?? process.env);
    const report =
      chunks.length > 0
        ? await reviewChunks({
            chunks,
            provider,
            reportLanguage: config.reportLanguage,
            onChunkStart: (_chunk, index, total) => {
              progress(`调用 DeepSeek 审查分块 ${index}/${total}...`);
            },
            onChunkComplete: (_chunk, index, total) => {
              progress(`DeepSeek 分块 ${index}/${total} 审查完成。`);
            },
          })
        : emptyReport();
    progress("生成审查报告...");
    const exitCode = resolveExitCode(report, config.failOn, config.confidenceFloor);
    const rendered = renderReport(report, config.output.format, options.color ?? false, options.summary ?? false);

    if (config.output.file) {
      const outputPath = resolve(cwd, config.output.file);
      progress("写入审查报告...");
      try {
        await writeFile(outputPath, rendered, "utf8");
      } catch (error) {
        throw new AppError({
          code: "OUTPUT_WRITE_FAILED",
          message: `无法写入审查报告：${outputPath}。`,
          exitCode: 2,
          recoverable: false,
          details: error,
        });
      }
      progress("代码 review 完成。");
      return {
        exitCode,
        output: `审查报告已写入：${outputPath}。`,
      };
    }

    progress("代码 review 完成。");
    return {
      exitCode,
      output: rendered,
    };
  } catch (error) {
    const appError = toAppError(error);
    return {
      exitCode: appError.exitCode,
      output: renderError(appError, requestedFormat),
    };
  }
}

function assertNoSecrets(files: ReturnType<typeof parseGitDiff>): void {
  const findings = detectSecretsInDiffFiles(files);
  if (findings.length === 0) {
    return;
  }

  const first = findings[0];
  const location = first.line ? `${first.file}:${first.line}` : first.file;
  throw new AppError({
    code: "SECRET_DETECTED",
    message: `检测到疑似密钥：${location}。已在发送 diff 到 DeepSeek 前中止审查。`,
    exitCode: 2,
    recoverable: false,
    suggestion: "请从 diff 中移除密钥；如果它是真实密钥，请先轮换密钥，然后再运行 ai-codeview。",
    details: findings,
  });
}

function assertNoTextSecrets(files: PathReviewFile[]): void {
  const findings = detectSecretsInTextFiles(files.map((file) => ({ path: file.path, content: file.content })));
  if (findings.length === 0) {
    return;
  }

  const first = findings[0];
  const location = first.line ? `${first.file}:${first.line}` : first.file;
  throw new AppError({
    code: "SECRET_DETECTED",
    message: `检测到疑似密钥：${location}。已在发送文件内容到 DeepSeek 前中止审查。`,
    exitCode: 2,
    recoverable: false,
    suggestion: "请从文件中移除密钥；如果它是真实密钥，请先轮换密钥，然后再运行 ai-codeview。",
    details: findings,
  });
}

function createDeepSeekProvider(config: AiCodeviewConfig, env: NodeJS.ProcessEnv): AiProvider {
  const apiKey = env[config.apiKeyEnv];
  if (!apiKey) {
    throw new AppError({
      code: "MISSING_API_KEY",
      message: `缺少 ${config.apiKeyEnv}。`,
      exitCode: 2,
      recoverable: false,
      suggestion: `请先设置 ${config.apiKeyEnv}，再运行 review。`,
    });
  }

  return new DeepSeekProvider({
    apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    thinking: config.thinking,
    reasoningEffort: config.reasoningEffort,
  });
}

function renderReport(report: ReviewReport, format: OutputFormat, color: boolean, summary: boolean): string {
  if (summary) return renderSummaryReport(report);
  if (format === "json") return renderJsonReport(report);
  if (format === "markdown") return renderMarkdownReport(report);
  return renderTextReport(report, { color });
}

function renderError(error: AppError, format: OutputFormat): string {
  if (format !== "json") {
    return error.message;
  }

  return JSON.stringify(
    {
      status: "error",
      error: {
        code: error.code,
        message: error.message,
        suggestion: error.suggestion,
      },
    },
    null,
    2,
  );
}

function getGitDiffInput(options: ReviewCommandOptions) {
  if (options.base) {
    return { mode: "base" as const, base: options.base };
  }
  if (options.changed) {
    return { mode: "changed" as const };
  }
  return { mode: options.staged ? ("staged" as const) : ("working-tree" as const) };
}

function emptyReport(): ReviewReport {
  return {
    risk: "low" as const,
    status: "pass" as const,
    summary: "过滤后没有可审查的文件。",
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    findings: [],
  };
}

function noopProgress(): void {
  // Intentionally empty: command logic can emit progress without forcing CLI output in tests.
}
