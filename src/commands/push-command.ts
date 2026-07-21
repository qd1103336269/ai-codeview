import { confirm, editor, select } from "@inquirer/prompts";
import { loadConfig } from "../config/load-config.js";
import { chunkReviewInput } from "../diff/chunk-review-input.js";
import { filterReviewFiles } from "../diff/filter-review-files.js";
import { parseGitDiff } from "../diff/parse-git-diff.js";
import { AppError, isAppError, toAppError } from "../errors/app-error.js";
import {
  collectGitDiff as defaultCollectGitDiff,
  commitStagedChanges as defaultCommitStagedChanges,
  getHeadSha as defaultGetHeadSha,
  hasUnstagedChanges as defaultHasUnstagedChanges,
  pushCurrentBranch as defaultPushCurrentBranch,
  stageAllChanges as defaultStageAllChanges,
} from "../git/git-client.js";
import type { AiProvider } from "../providers/ai-provider.js";
import "../providers/index.js";
import { createProvider } from "../providers/registry.js";
import { resolveExitCode } from "../report/exit-code.js";
import { filterByConfidence } from "../report/filter-by-confidence.js";
import { renderMarkdownReport } from "../report/markdown-report.js";
import { buildCommitMessagePrompt, sanitizeCommitMessage } from "../review/commit-message.js";
import { reviewChunks } from "../review/review-orchestrator.js";
import type { ReviewReport } from "../review/review-schema.js";
import { detectSecretsInDiffFiles } from "../security/detect-secrets.js";
import { isFirstPushUse as defaultIsFirstPushUse, markPushUsed as defaultMarkPushUsed } from "../utils/first-use-marker.js";
import type { CommandResult } from "./review-command.js";

export interface PushCommandOptions {
  nonInteractive?: boolean;
  dryRun?: boolean;
  noPush?: boolean;
  message?: string;
  force?: boolean;
}

export interface CommitMessageDecision {
  action: "confirm" | "edit" | "cancel";
  message?: string;
}

export interface PushCommandDeps {
  collectGitDiff?: typeof defaultCollectGitDiff;
  commitStagedChanges?: typeof defaultCommitStagedChanges;
  getHeadSha?: typeof defaultGetHeadSha;
  hasUnstagedChanges?: typeof defaultHasUnstagedChanges;
  pushCurrentBranch?: typeof defaultPushCurrentBranch;
  stageAllChanges?: typeof defaultStageAllChanges;
  provider?: AiProvider;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  isInteractive?: boolean;
  onProgress?: (message: string) => void;
  confirmStageChanges?: () => Promise<boolean>;
  confirmRisk?: (reportMarkdown: string) => Promise<boolean>;
  confirmCommitMessage?: (message: string) => Promise<CommitMessageDecision>;
  confirmCommitPreview?: (message: string) => Promise<boolean>;
  confirmPushPreview?: () => Promise<boolean>;
  isFirstPushUse?: () => Promise<boolean>;
  markPushUsed?: () => Promise<void>;
}

export async function runPushCommand(
  options: PushCommandOptions,
  deps: PushCommandDeps = {},
): Promise<CommandResult> {
  const progress = deps.onProgress ?? noopProgress;
  const isFirstPushUse = deps.isFirstPushUse ?? defaultIsFirstPushUse;
  const markPushUsed = deps.markPushUsed ?? defaultMarkPushUsed;

  try {
    if (!options.dryRun && !options.force) {
      const isFirst = await isFirstPushUse();
      if (isFirst) {
        progress("检测到首次使用 push，自动预演...");
        const dryRunResult = await runPushCommand(
          { ...options, dryRun: true, force: true },
          { ...deps, isFirstPushUse: async () => false, markPushUsed },
        );
        if (dryRunResult.exitCode !== 0) {
          return dryRunResult;
        }
        await markPushUsed();
        return {
          exitCode: 0,
          output: [
            "这是第一次使用 push，已自动预演。",
            "",
            dryRunResult.output,
            "",
            "确认无误后再次运行 acv push 真正提交推送。",
            "如需跳过首次预演，使用 acv push --force。",
          ].join("\n"),
        };
      }
    }

    progress("检查 Git 状态...");
    progress("收集已暂存变更...");
    const stagedDiffResult = await collectStagedDiff(options, deps, progress);
    if (stagedDiffResult.cancelled) {
      return { exitCode: 0, output: "已取消提交和推送。" };
    }
    const rawDiff = stagedDiffResult.diff;
    const config = await loadConfig({ cwd: deps.cwd ?? process.cwd(), overrides: { format: "markdown" } });
    const provider = deps.provider ?? createProviderFromConfig(config, deps.env ?? process.env);

    progress("调用 DeepSeek 审查已暂存代码...");
    const parsed = parseGitDiff(rawDiff);
    if (!config.security.allowSecrets) {
      assertNoSecrets(parsed);
    }
    const filtered = filterReviewFiles(parsed, config.ignore);
    const chunks = chunkReviewInput(filtered.reviewable, 40_000);
    const commitMessageDiff = buildCommitMessageDiff(filtered.reviewable);
    const report = chunks.length > 0 ? await reviewChunks({ chunks, provider, reportLanguage: config.reportLanguage, learningNotes: config.review.learningNotes }) : emptyReport();
    const { report: visibleReport, filteredOut } = filterByConfidence(report, config.confidenceFloor);
    const reportMarkdown = renderMarkdownReport(visibleReport, { reportLanguage: config.reportLanguage, filteredOut });
    const gateExitCode = resolveExitCode(visibleReport, config.failOn, config.confidenceFloor);

    if (gateExitCode === 1) {
      progress("审查发现达到阈值的问题，等待用户确认...");
      if (options.dryRun) {
        return {
          exitCode: 1,
          output: ["dry-run 审查结果达到阈值，未创建 commit，未执行 push。", "", reportMarkdown].join("\n"),
        };
      }
      if (options.nonInteractive) {
        return {
          exitCode: 1,
          output: ["审查结果达到阈值，非交互式模式已中止提交和推送。", "", reportMarkdown].join("\n"),
        };
      }
      const shouldContinue = await (deps.confirmRisk ?? defaultConfirmRisk)(reportMarkdown);
      if (!shouldContinue) {
        return { exitCode: 0, output: "已取消提交和推送。" };
      }
    }

    const message = await resolveCommitMessage(options, deps, provider, commitMessageDiff, progress);
    if (!message) {
      throw new AppError({
        code: "EMPTY_COMMIT_MESSAGE",
        message: "提交信息为空，已取消提交。",
        exitCode: 2,
        suggestion: "请重新运行并填写有效提交信息，或使用 --message 指定。",
      });
    }

    if (options.dryRun) {
      return {
        exitCode: 0,
        output: [`dry-run 完成，未创建 commit，未执行 push。`, "", `提交信息：${message}`].join("\n"),
      };
    }

    if (!options.nonInteractive) {
      const confirmCommit = await (deps.confirmCommitPreview ?? defaultConfirmCommitPreview)(message);
      if (!confirmCommit) {
        return { exitCode: 0, output: "已取消提交和推送。" };
      }
    } else {
      progress(`即将创建 commit：${message}`);
    }

    progress("创建 Git commit...");
    await (deps.commitStagedChanges ?? defaultCommitStagedChanges)({ message });
    if (options.noPush) {
      progress("已跳过 git push。");
      await markPushUsed();
      return { exitCode: 0, output: "提交完成，未推送。" };
    }

    if (!options.nonInteractive) {
      const confirmPush = await (deps.confirmPushPreview ?? defaultConfirmPushPreview)();
      if (!confirmPush) {
        progress("已创建 commit，但用户取消了 push。可执行 git reset --soft HEAD~1 回退。");
        return { exitCode: 0, output: "已创建 commit，但取消了 push。可执行 git reset --soft HEAD~1 回退。" };
      }
    } else {
      progress("即将推送到远程分支...");
    }

    progress("推送到远程分支...");
    let headSha: string | undefined;
    try {
      headSha = await (deps.getHeadSha ?? defaultGetHeadSha)();
    } catch {
      headSha = undefined;
    }
    try {
      await (deps.pushCurrentBranch ?? defaultPushCurrentBranch)();
    } catch (error) {
      if (isAppError(error) && error.code === "PUSH_NO_UPSTREAM") {
        throw error;
      }
      const shaHint = headSha ? `（HEAD=${headSha.slice(0, 12)}）` : "";
      throw new AppError({
        code: "PUSH_FAILED_ALREADY_COMMITTED",
        message: `Git commit 已创建${shaHint}，但 push 失败。`,
        exitCode: 2,
        suggestion: headSha
          ? `可执行 git reset --soft ${headSha}~1 回退此次提交后重试。`
          : "可执行 git reset --soft HEAD~1 回退此次提交后重试。",
        cause: error,
      });
    }
    progress("push 流程完成。");
    await markPushUsed();

    return { exitCode: 0, output: "提交和推送完成。" };
  } catch (error) {
    const appError = toAppError(error);
    const suggestion = appError.suggestion ? `\n${appError.suggestion}` : "";
    return { exitCode: appError.exitCode, output: `${appError.message}${suggestion}` };
  }
}

async function resolveCommitMessage(
  options: PushCommandOptions,
  deps: PushCommandDeps,
  provider: AiProvider,
  rawDiff: string,
  progress: (message: string) => void,
): Promise<string> {
  if (options.message !== undefined) {
    return sanitizeCommitMessage(options.message).trim();
  }

  progress("生成中文提交信息...");
  const generatedMessage = sanitizeCommitMessage(
    await provider.generateCommitMessage({
      prompt: buildCommitMessagePrompt({ diff: rawDiff }),
    }),
  );
  if (options.nonInteractive || options.dryRun) {
    return generatedMessage.trim();
  }

  const decision = await confirmCommitMessageSafely(deps, generatedMessage);
  if (decision.action === "cancel") {
    throw new AppError({
      code: "USER_CANCELLED",
      message: "已取消提交和推送。",
      exitCode: 0,
    });
  }

  return (decision.action === "edit" ? decision.message : generatedMessage)?.trim() ?? "";
}

function buildCommitMessageDiff(files: ReturnType<typeof parseGitDiff>): string {
  const MAX_CHARS = 40_000;
  const parts: string[] = [];
  let size = 0;
  for (const file of files) {
    if (size + file.raw.length > MAX_CHARS) {
      parts.push(`（已截断，共 ${files.length} 个文件变更）`);
      break;
    }
    parts.push(file.raw);
    size += file.raw.length;
  }
  return parts.length > 0 ? parts.join("\n\n") : "";
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

  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (name === "CancelPromptError") return true;
  if (name === "ExitPromptError") return true;
  return message === "canceled" || message === "Prompt canceled";
}

type StagedDiffResult =
  | { cancelled: false; diff: string }
  | { cancelled: true };

async function collectStagedDiff(
  options: PushCommandOptions,
  deps: PushCommandDeps,
  progress: (message: string) => void,
): Promise<StagedDiffResult> {
  try {
    return {
      cancelled: false,
      diff: await (deps.collectGitDiff ?? defaultCollectGitDiff)({ mode: "staged" }),
    };
  } catch (error) {
    const appError = toAppError(error);
    if (appError.code === "NO_DIFF") {
      const hasUnstaged = await (deps.hasUnstagedChanges ?? defaultHasUnstagedChanges)();
      if (hasUnstaged) {
        if (!canPromptForStageChanges(options, deps)) {
          throw new AppError({
            code: "NO_DIFF",
            message: "没有已暂存变更，当前环境不可交互，无法确认是否执行 git add -A。请先执行 git add 后重新运行 push。",
            exitCode: 2,
          });
        }

        progress("发现未暂存变更，等待用户确认是否加入暂存区...");
        const shouldStage = await confirmStageChangesSafely(deps);
        if (!shouldStage) {
          return { cancelled: true };
        }

        progress("将工作区变更加入暂存区...");
        await (deps.stageAllChanges ?? defaultStageAllChanges)();
        progress("重新收集已暂存变更...");
        return {
          cancelled: false,
          diff: await (deps.collectGitDiff ?? defaultCollectGitDiff)({ mode: "staged" }),
        };
      }

      throw new AppError({
        code: "NO_DIFF",
        message: "没有可提交变更，请先修改文件或执行 git add。",
        exitCode: 2,
      });
    }
    throw appError;
  }
}

async function confirmStageChangesSafely(deps: PushCommandDeps): Promise<boolean> {
  try {
    return await (deps.confirmStageChanges ?? defaultConfirmStageChanges)();
  } catch (error) {
    if (isPromptCancellation(error)) {
      return false;
    }
    throw new AppError({
      code: "INTERACTION_FAILED",
      message: "无法读取暂存确认输入。",
      exitCode: 2,
      details: error,
    });
  }
}

function canPromptForStageChanges(options: PushCommandOptions, deps: PushCommandDeps): boolean {
  if (options.nonInteractive) {
    return false;
  }
  if (typeof deps.isInteractive === "boolean") {
    return deps.isInteractive;
  }
  if (deps.confirmStageChanges) {
    return true;
  }
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function createProviderFromConfig(
  config: Awaited<ReturnType<typeof loadConfig>>,
  env: NodeJS.ProcessEnv,
): AiProvider {
  const apiKey = env[config.apiKeyEnv];
  if (!apiKey) {
    throw new AppError({
      code: "MISSING_API_KEY",
      message: `缺少 ${config.apiKeyEnv}。`,
      exitCode: 2,
      suggestion: `请先设置 ${config.apiKeyEnv}，再运行 push。`,
    });
  }

  return createProvider(config, apiKey);
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

async function defaultConfirmStageChanges(): Promise<boolean> {
  return confirm({
    message: "发现有修改尚未加入暂存区，是否执行 git add -A 后继续？",
    default: true,
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

async function defaultConfirmCommitPreview(message: string): Promise<boolean> {
  process.stdout.write(`\n即将创建 commit：\n  ${message}\n\n`);
  return confirm({
    message: "确认创建此 commit？",
    default: true,
  });
}

async function defaultConfirmPushPreview(): Promise<boolean> {
  return confirm({
    message: "确认推送到远程分支？",
    default: true,
  });
}

function noopProgress(): void {
  // Command logic can emit progress without forcing CLI output in tests.
}
