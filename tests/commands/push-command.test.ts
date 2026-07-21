import { describe, expect, test, vi } from "vitest";
import { runPushCommand } from "../../src/commands/push-command.js";
import { AppError } from "../../src/errors/app-error.js";
import type { ReviewReport } from "../../src/review/review-schema.js";

describe("runPushCommand", () => {
  test("does not commit or push when there is no staged diff", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        hasUnstagedChanges: vi.fn().mockResolvedValue(false),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("没有可提交变更");
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("stages unstaged changes after confirmation and continues push flow", async () => {
    const collectGitDiff = vi
      .fn()
      .mockRejectedValueOnce(
        new AppError({
          code: "NO_DIFF",
          message: "没有发现可审查的 diff。",
          exitCode: 0,
          recoverable: false,
        }),
      )
      .mockResolvedValueOnce(stagedDiff());
    const stageAllChanges = vi.fn().mockResolvedValue(undefined);
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 自动暂存后推送");

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff,
        hasUnstagedChanges: vi.fn().mockResolvedValue(true),
        confirmStageChanges: vi.fn().mockResolvedValue(true),
        stageAllChanges,
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(stageAllChanges).toHaveBeenCalledTimes(1);
    expect(collectGitDiff).toHaveBeenCalledTimes(2);
    expect(provider.review).toHaveBeenCalledTimes(1);
    expect(commitStagedChanges).toHaveBeenCalledWith({ message: "feat: 自动暂存后推送" });
    expect(pushCurrentBranch).toHaveBeenCalledTimes(1);
  });

  test("does not commit or push when staging unstaged changes is rejected", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        hasUnstagedChanges: vi.fn().mockResolvedValue(true),
        confirmStageChanges: vi.fn().mockResolvedValue(false),
        stageAllChanges: vi.fn(),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("已取消");
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("does not prompt or stage unstaged changes in non-interactive mode", async () => {
    const confirmStageChanges = vi.fn();
    const stageAllChanges = vi.fn();
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      { nonInteractive: true },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        hasUnstagedChanges: vi.fn().mockResolvedValue(true),
        confirmStageChanges,
        stageAllChanges,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("当前环境不可交互");
    expect(confirmStageChanges).not.toHaveBeenCalled();
    expect(stageAllChanges).not.toHaveBeenCalled();
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("does not prompt or stage unstaged changes when the terminal is not interactive", async () => {
    const confirmStageChanges = vi.fn();
    const stageAllChanges = vi.fn();
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        isInteractive: false,
        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        hasUnstagedChanges: vi.fn().mockResolvedValue(true),
        confirmStageChanges,
        stageAllChanges,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("当前环境不可交互");
    expect(confirmStageChanges).not.toHaveBeenCalled();
    expect(stageAllChanges).not.toHaveBeenCalled();
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("does not prompt for risk confirmation in non-interactive mode", async () => {
    const confirmRisk = vi.fn();
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      { nonInteractive: true },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(failReport(), "fix: x"),
        confirmRisk,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("达到阈值");
    expect(confirmRisk).not.toHaveBeenCalled();
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("returns USER_CANCELLED with exit code 0 when staging confirmation is rejected", async () => {
    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        hasUnstagedChanges: vi.fn().mockResolvedValue(true),
        confirmStageChanges: vi.fn().mockResolvedValue(false),
        stageAllChanges: vi.fn(),
        commitStagedChanges: vi.fn(),
        pushCurrentBranch: vi.fn(),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("已取消");
  });

  test("returns USER_CANCELLED with exit code 0 when risk confirmation is rejected", async () => {
    const commitStagedChanges = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(failReport(), "fix: x"),
        confirmRisk: vi.fn().mockResolvedValue(false),
        commitStagedChanges,
        pushCurrentBranch: vi.fn(),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("已取消");
    expect(commitStagedChanges).not.toHaveBeenCalled();
  });

  test("returns an error when stage confirmation fails with a non-cancellation error", async () => {
    const stageAllChanges = vi.fn();
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        hasUnstagedChanges: vi.fn().mockResolvedValue(true),
        confirmStageChanges: vi.fn().mockRejectedValue(new Error("stdin unavailable")),
        stageAllChanges,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(stageAllChanges).not.toHaveBeenCalled();
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("returns git status error when checking unstaged changes fails", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        hasUnstagedChanges: vi.fn().mockRejectedValue(
          new AppError({
            code: "GIT_STATUS_FAILED",
            message: "Git status 执行失败。",
            exitCode: 2,
            recoverable: false,
          }),
        ),
        confirmStageChanges: vi.fn(),
        stageAllChanges: vi.fn(),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("Git status 执行失败");
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("commits and pushes after passing staged review and confirmed message", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 增加推送前审查");

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(provider.review).toHaveBeenCalledTimes(1);
    expect(provider.generateCommitMessage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining("中文") }),
    );
    expect(commitStagedChanges).toHaveBeenCalledWith({ message: "feat: 增加推送前审查" });
    expect(pushCurrentBranch).toHaveBeenCalledWith();
  });

  test("uses provided commit message without asking AI to generate one", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 不应使用这个提交信息");

    const result = await runPushCommand(
      { message: "feat: 使用用户指定提交信息" },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn(),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(provider.review).toHaveBeenCalledTimes(1);
    expect(provider.generateCommitMessage).not.toHaveBeenCalled();
    expect(commitStagedChanges).toHaveBeenCalledWith({ message: "feat: 使用用户指定提交信息" });
    expect(pushCurrentBranch).toHaveBeenCalledTimes(1);
  });

  test("uses generated commit message without confirmation in non-interactive mode", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockResolvedValue(undefined);
    const confirmCommitMessage = vi.fn();
    const provider = providerReturning(passReport(), "feat: 自动使用生成信息");

    const result = await runPushCommand(
      { nonInteractive: true },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(provider.generateCommitMessage).toHaveBeenCalledTimes(1);
    expect(confirmCommitMessage).not.toHaveBeenCalled();
    expect(commitStagedChanges).toHaveBeenCalledWith({ message: "feat: 自动使用生成信息" });
    expect(pushCurrentBranch).toHaveBeenCalledTimes(1);
  });

  test("does not commit or push in dry-run mode", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();
    const confirmCommitMessage = vi.fn();
    const provider = providerReturning(passReport(), "feat: 预演提交信息");

    const result = await runPushCommand(
      { dryRun: true },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("dry-run");
    expect(result.output).toContain("feat: 预演提交信息");
    expect(confirmCommitMessage).not.toHaveBeenCalled();
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("does not prompt for risk confirmation in dry-run mode", async () => {
    const confirmRisk = vi.fn();
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      { dryRun: true },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(failReport(), "fix: x"),
        confirmRisk,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("dry-run 审查结果达到阈值");
    expect(confirmRisk).not.toHaveBeenCalled();
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("commits but does not push in no-push mode", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn();
    const provider = providerReturning(passReport(), "feat: 只提交不推送");

    const result = await runPushCommand(
      { noPush: true },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("提交完成，未推送");
    expect(commitStagedChanges).toHaveBeenCalledWith({ message: "feat: 只提交不推送" });
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("uses edited commit message", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 初始提交信息");

    await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({
          action: "edit",
          message: "feat: 使用编辑后的中文提交信息",
        }),
        commitStagedChanges,
        pushCurrentBranch: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(commitStagedChanges).toHaveBeenCalledWith({ message: "feat: 使用编辑后的中文提交信息" });
  });

  test("blocks staged push before provider review when diff contains a likely secret", async () => {
    const provider = providerReturning(passReport(), "feat: x");
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiffWithSecret()),
        provider,
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("疑似密钥");
    expect(provider.review).not.toHaveBeenCalled();
    expect(provider.generateCommitMessage).not.toHaveBeenCalled();
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("skips ignored staged files before push review", async () => {
    const provider = providerReturning(passReport(), "feat: 更新锁文件");

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedIgnoredDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges: vi.fn().mockResolvedValue(undefined),
        pushCurrentBranch: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(provider.review).not.toHaveBeenCalled();
    expect(provider.generateCommitMessage).toHaveBeenCalledTimes(1);
  });

  test("does not commit when commit message editing is cancelled", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(passReport(), "feat: x"),
        confirmCommitMessage: vi.fn().mockRejectedValue(
          Object.assign(new Error("User force closed the prompt"), { name: "ExitPromptError" }),
        ),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("已取消");
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
  });

  test("throws EMPTY_COMMIT_MESSAGE when commit message resolves to empty string", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      { message: "   " },
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(passReport(), "feat: x"),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("提交信息为空");
    expect(commitStagedChanges).not.toHaveBeenCalled();
  });

  test("throws PUSH_FAILED_ALREADY_COMMITTED with rollback hint when push fails after commit", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockRejectedValue(new Error("network down"));
    const getHeadSha = vi.fn().mockResolvedValue("abcdef1234567890");

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(passReport(), "feat: x"),
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
        getHeadSha,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("已创建");
    expect(result.output).toContain("push 失败");
    expect(result.output).toContain("git reset --soft");
    expect(commitStagedChanges).toHaveBeenCalled();
  });

  test("propagates PUSH_NO_UPSTREAM without wrapping as already committed", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockRejectedValue(
      new AppError({
        code: "PUSH_NO_UPSTREAM",
        message: "no upstream",
        exitCode: 2,
        recoverable: false,
      }),
    );

    const result = await runPushCommand(
      {},
      {
        isFirstPushUse: async () => false,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,

        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(passReport(), "feat: x"),
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
        getHeadSha: vi.fn().mockResolvedValue("abcdef1234567890"),
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("no upstream");
    expect(result.output).not.toContain("已创建");
  });
});

function providerReturning(report: ReviewReport, message: string) {
  return {
    review: vi.fn().mockResolvedValue(report),
    generateCommitMessage: vi.fn().mockResolvedValue(message),
  };
}

function stagedDiff(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,1 +1,1 @@",
    "-const a = 1;",
    "+const a = 2;",
  ].join("\n");
}

function stagedDiffWithSecret(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,1 +1,1 @@",
    "-const token = \"old\";",
    `+const token = "${deepseekLikeApiKey()}";`,
  ].join("\n");
}

function stagedIgnoredDiff(): string {
  return [
    "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
    "--- a/pnpm-lock.yaml",
    "+++ b/pnpm-lock.yaml",
    "@@ -1,1 +1,1 @@",
    "-lockfileVersion: '9.0'",
    "+lockfileVersion: '9.1'",
  ].join("\n");
}

function deepseekLikeApiKey(): string {
  return ["sk", "1234567890abcdef1234567890abcdef"].join("-");
}

function passReport(): ReviewReport {
  return {
    risk: "low",
    status: "pass",
    summary: "未发现问题。",
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    findings: [],
  };
}

function failReport(): ReviewReport {
  return {
    risk: "high",
    status: "fail",
    summary: "发现高风险问题。",
    findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
    findings: [
      {
        id: "ACV-0001",
        severity: "high",
        confidence: "high",
        category: "bug",
        file: "src/a.ts",
        title: "高风险问题",
        reason: "原因。",
        suggestion: "建议。",
      },
    ],
  };
}

describe("runPushCommand first-use behavior", () => {
  test("first push auto dry-runs and hints to run again", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();
    const markPushUsed = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 预演");

    const result = await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn(),
        commitStagedChanges,
        pushCurrentBranch,
        isFirstPushUse: async () => true,
        markPushUsed,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("第一次使用 push");
    expect(result.output).toContain("再次运行");
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
    expect(markPushUsed).toHaveBeenCalledTimes(1);
  });

  test("first push with --force skips dry-run", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockResolvedValue(undefined);
    const markPushUsed = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: force");

    const result = await runPushCommand(
      { force: true },
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
        isFirstPushUse: async () => true,
        markPushUsed,
        confirmCommitPreview: async () => true,
        confirmPushPreview: async () => true,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(commitStagedChanges).toHaveBeenCalledTimes(1);
    expect(pushCurrentBranch).toHaveBeenCalledTimes(1);
  });

  test("subsequent push shows commit preview and asks confirmation", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: preview");
    const confirmCommitPreview = vi.fn().mockResolvedValue(true);
    const confirmPushPreview = vi.fn().mockResolvedValue(true);

    await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
        isFirstPushUse: async () => false,
        markPushUsed: vi.fn().mockResolvedValue(undefined),
        confirmCommitPreview,
        confirmPushPreview,
      },
    );

    expect(confirmCommitPreview).toHaveBeenCalledTimes(1);
    expect(confirmPushPreview).toHaveBeenCalledTimes(1);
  });

  test("subsequent push cancels when commit preview rejected", async () => {
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();
    const provider = providerReturning(passReport(), "feat: x");

    const result = await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges,
        pushCurrentBranch,
        isFirstPushUse: async () => false,
        markPushUsed: vi.fn().mockResolvedValue(undefined),
        confirmCommitPreview: async () => false,
        confirmPushPreview: async () => true,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("已取消");
    expect(commitStagedChanges).not.toHaveBeenCalled();
  });

  test("non-interactive push shows preview without waiting", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const pushCurrentBranch = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: non-interactive");
    const confirmCommitPreview = vi.fn();
    const confirmPushPreview = vi.fn();

    const result = await runPushCommand(
      { nonInteractive: true, message: "feat: auto" },
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        commitStagedChanges,
        pushCurrentBranch,
        isFirstPushUse: async () => false,
        markPushUsed: vi.fn().mockResolvedValue(undefined),
        confirmCommitPreview,
        confirmPushPreview,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(confirmCommitPreview).not.toHaveBeenCalled();
    expect(confirmPushPreview).not.toHaveBeenCalled();
  });
});
