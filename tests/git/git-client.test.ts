import { describe, expect, test, vi } from "vitest";
import { collectGitDiff, commitStagedChanges, pushCurrentBranch } from "../../src/git/git-client.js";

describe("collectGitDiff", () => {
  test("throws AppError when git diff returns empty output", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "" });

    await expect(collectGitDiff({ mode: "working-tree", run })).rejects.toMatchObject({
      code: "NO_DIFF",
      exitCode: 0,
    });
  });

  test("uses staged diff when mode is staged", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "diff --git a/a.ts b/a.ts" });

    await collectGitDiff({ mode: "staged", run });

    expect(run).toHaveBeenCalledWith("git", ["diff", "--staged"]);
  });

  test("uses merge-base diff when base branch is provided", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "diff --git a/a.ts b/a.ts" });

    await collectGitDiff({ mode: "base", base: "main", run });

    expect(run).toHaveBeenCalledWith("git", ["diff", "main...HEAD"]);
  });
});

describe("commitStagedChanges", () => {
  test("commits staged changes with provided message", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "" });

    await commitStagedChanges({ message: "feat: 增加推送前审查", run });

    expect(run).toHaveBeenCalledWith("git", ["commit", "-m", "feat: 增加推送前审查"]);
  });

  test("maps commit failure to GIT_COMMIT_FAILED", async () => {
    const run = vi.fn().mockRejectedValue(new Error("commit failed"));

    await expect(commitStagedChanges({ message: "feat: x", run })).rejects.toMatchObject({
      code: "GIT_COMMIT_FAILED",
      exitCode: 2,
    });
  });
});

describe("pushCurrentBranch", () => {
  test("pushes current branch using git push", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "" });

    await pushCurrentBranch({ run });

    expect(run).toHaveBeenCalledWith("git", ["push"]);
  });

  test("maps push failure to GIT_PUSH_FAILED", async () => {
    const run = vi.fn().mockRejectedValue(new Error("push failed"));

    await expect(pushCurrentBranch({ run })).rejects.toMatchObject({
      code: "GIT_PUSH_FAILED",
      exitCode: 2,
    });
  });
});
