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
        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("请先执行 git add");
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

  test("uses edited commit message", async () => {
    const commitStagedChanges = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 初始提交信息");

    await runPushCommand(
      {},
      {
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

  test("does not commit when risk confirmation is rejected", async () => {
    const commitStagedChanges = vi.fn();

    const result = await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(failReport(), "fix: x"),
        confirmRisk: vi.fn().mockResolvedValue(false),
        commitStagedChanges,
        pushCurrentBranch: vi.fn(),
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("已取消");
    expect(commitStagedChanges).not.toHaveBeenCalled();
  });

  test("blocks staged push before provider review when diff contains a likely secret", async () => {
    const provider = providerReturning(passReport(), "feat: x");
    const commitStagedChanges = vi.fn();
    const pushCurrentBranch = vi.fn();

    const result = await runPushCommand(
      {},
      {
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
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(passReport(), "feat: x"),
        confirmCommitMessage: vi.fn().mockRejectedValue(new Error("User force closed the prompt")),
        commitStagedChanges,
        pushCurrentBranch,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("已取消");
    expect(commitStagedChanges).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
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
