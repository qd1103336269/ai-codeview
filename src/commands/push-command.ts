import { confirm, editor, select } from "@inquirer/prompts";
import { loadConfig } from "../config/load-config.js";
import { chunkReviewInput } from "../diff/chunk-review-input.js";
import { filterReviewFiles } from "../diff/filter-review-files.js";
import { parseGitDiff } from "../diff/parse-git-diff.js";
import { AppError, toAppError } from "../errors/app-error.js";
import {
  collectGitDiff as defaultCollectGitDiff,
  commitStagedChanges as defaultCommitStagedChanges,
  pushCurrentBranch as defaultPushCurrentBranch,
} from "../git/git-client.js";
import type { AiProvider } from "../providers/ai-provider.js";
import { DeepSeekProvider } from "../providers/deepseek-provider.js";
import { resolveExitCode } from "../report/exit-code.js";
import { renderMarkdownReport } from "../report/markdown-report.js";
import { buildCommitMessagePrompt, sanitizeCommitMessage } from "../review/commit-message.js";
import { reviewChunks } from "../review/review-orchestrator.js";
import type { ReviewReport } from "../review/review-schema.js";
import { detectSecretsInDiffFiles } from "../security/detect-secrets.js";
import type { CommandResult } from "./review-command.js";

export type PushCommandOptions = Record<string, never>;

export interface CommitMessageDecision {
  action: "confirm" | "edit" | "cancel";
  message?: string;
}

export interface PushCommandDeps {
  collectGitDiff?: typeof defaultCollectGitDiff;
  commitStagedChanges?: typeof defaultCommitStagedChanges;
  pushCurrentBranch?: typeof defaultPushCurrentBranch;
  provider?: AiProvider;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  onProgress?: (message: string) => void;
  confirmRisk?: (reportMarkdown: string) => Promise<boolean>;
  confirmCommitMessage?: (message: string) => Promise<CommitMessageDecision>;
}

export async function runPushCommand(
  _options: PushCommandOptions,
  deps: PushCommandDeps = {},
): Promise<CommandResult> {
  const progress = deps.onProgress ?? noopProgress;

  try {
    progress("检查 Git 状态...");
    progress("收集已暂存变更...");
    const rawDiff = await collectStagedDiff(deps);
    const config = await loadConfig({ cwd: deps.cwd ?? process.cwd(), overrides: { format: "markdown" } });
    const provider = deps.provider ?? createDeepSeekProvider(config, deps.env ?? process.env);

    progress("调用 DeepSeek 审查已暂存代码...");
    const parsed = parseGitDiff(rawDiff);
    if (!config.security.allowSecrets) {
      assertNoSecrets(parsed);
    }
    const filtered = filterReviewFiles(parsed, config.ignore);
    const chunks = chunkReviewInput(filtered.reviewable, 40_000);
    const report = chunks.length > 0 ? await reviewChunks({ chunks, provider }) : emptyReport();
    const reportMarkdown = renderMarkdownReport(report);
    const gateExitCode = resolveExitCode(report, config.failOn, config.confidenceFloor);

    if (gateExitCode === 1) {
      progress("审查发现达到阈值的问题，等待用户确认...");
      const shouldContinue = await (deps.confirmRisk ?? defaultConfirmRisk)(reportMarkdown);
      if (!shouldContinue) {
        return { exitCode: 1, output: "已取消提交和推送。" };
      }
    }

    progress("生成中文提交信息...");
    const generatedMessage = sanitizeCommitMessage(
      await provider.generateCommitMessage({
        prompt: buildCommitMessagePrompt({ diff: rawDiff }),
      }),
    );
    const decision = await confirmCommitMessageSafely(deps, generatedMessage);
    if (decision.action === "cancel") {
      return { exitCode: 1, output: "已取消提交和推送。" };
    }

    const message = (decision.action === "edit" ? decision.message : generatedMessage)?.trim();
    if (!message) {
      throw new AppError({
        code: "INVALID_CONFIG",
        message: "提交信息不能为空。",
        exitCode: 2,
        recoverable: false,
      });
    }

    progress("创建 Git commit...");
    await (deps.commitStagedChanges ?? defaultCommitStagedChanges)({ message });
    progress("推送到远程分支...");
    await (deps.pushCurrentBranch ?? defaultPushCurrentBranch)();
    progress("push 流程完成。");

    return { exitCode: 0, output: "提交和推送完成。" };
  } catch (error) {
    const appError = toAppError(error);
    return { exitCode: appError.exitCode, output: appError.message };
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
    message: `检测到疑似密钥：${location}。已在发送 staged diff 到 DeepSeek 前中止 push。`,
    exitCode: 2,
    recoverable: false,
    suggestion: "请从 staged diff 中移除密钥；如果它是真实密钥，请先轮换密钥，然后重新暂存并运行 ai-codeview push。",
    details: findings,
  });
}

async function confirmCommitMessageSafely(
  deps: PushCommandDeps,
  message: string,
): Promise<CommitMessageDecision> {
  try {
    return await (deps.confirmCommitMessage ?? defaultConfirmCommitMessage)(message);
  } catch (error) {
    if (isPromptCancellation(error)) {
      return { action: "cancel" };
    }
    throw error;
  }
}

function isPromptCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const signal = `${name} ${message} ${code}`.toLowerCase();
  return (
    signal.includes("cancel") ||
    signal.includes("force closed") ||
    signal.includes("exitprompt") ||
    signal.includes("sigint")
  );
}

async function collectStagedDiff(deps: PushCommandDeps): Promise<string> {
  try {
    return await (deps.collectGitDiff ?? defaultCollectGitDiff)({ mode: "staged" });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.code === "NO_DIFF") {
      throw new AppError({
        code: "NO_DIFF",
        message: "没有已暂存变更，请先执行 git add。",
        exitCode: 2,
        recoverable: false,
      });
    }
    throw appError;
  }
}

function createDeepSeekProvider(
  config: Awaited<ReturnType<typeof loadConfig>>,
  env: NodeJS.ProcessEnv,
): AiProvider {
  const apiKey = env[config.apiKeyEnv];
  if (!apiKey) {
    throw new AppError({
      code: "MISSING_API_KEY",
      message: `缺少 ${config.apiKeyEnv}。`,
      exitCode: 2,
      recoverable: false,
      suggestion: `请先设置 ${config.apiKeyEnv}，再运行 push。`,
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

function emptyReport(): ReviewReport {
  return {
    risk: "low",
    status: "pass",
    summary: "过滤后没有可审查的文件。",
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    findings: [],
  };
}

async function defaultConfirmRisk(reportMarkdown: string): Promise<boolean> {
  process.stdout.write(`${reportMarkdown}\n`);
  return confirm({
    message: "审查发现达到阈值的问题，仍然继续提交和推送吗？",
    default: false,
  });
}

async function defaultConfirmCommitMessage(message: string): Promise<CommitMessageDecision> {
  process.stdout.write(`\nAI 生成的提交信息：\n\n${message}\n\n`);
  const action = await select({
    message: "请选择提交信息处理方式",
    choices: [
      { name: "使用并继续", value: "confirm" as const },
      { name: "编辑后继续", value: "edit" as const },
      { name: "取消提交", value: "cancel" as const },
    ],
  });

  if (action === "edit") {
    const edited = await editor({
      message: "编辑提交信息",
      default: message,
    });
    return { action, message: edited };
  }

  return { action };
}

function noopProgress(): void {
  // Command logic can emit progress without forcing CLI output in tests.
}
