import { describe, expect, test, vi } from "vitest";
import {
  collectGitDiff,
  commitStagedChanges,
  getHeadSha,
  hasUnstagedChanges,
  pushCurrentBranch,
  stageAllChanges,
} from "../../src/git/git-client.js";

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

    expect(run).toHaveBeenCalledWith("git", [
      "-c", "core.quotepath=false",
      "-c", "diff.renames=false",
      "diff", "--staged",
    ]);
  });

  test("uses HEAD diff when mode is changed", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "diff --git a/a.ts b/a.ts" });

    await collectGitDiff({ mode: "changed", run });

    expect(run).toHaveBeenCalledWith("git", [
      "-c", "core.quotepath=false",
      "-c", "diff.renames=false",
      "diff", "HEAD",
    ]);
  });

  test("uses merge-base diff when base branch is provided", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "diff --git a/a.ts b/a.ts" });

    await collectGitDiff({ mode: "base", base: "main", run });

    expect(run).toHaveBeenCalledWith("git", [
      "-c", "core.quotepath=false",
      "-c", "diff.renames=false",
      "diff", "main...HEAD",
    ]);
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

describe("hasUnstagedChanges", () => {
  test("returns false when working tree has no unstaged diff", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "" });

    await expect(hasUnstagedChanges({ run })).resolves.toBe(false);

    expect(run).toHaveBeenCalledWith("git", ["diff", "--quiet"]);
  });

  test("returns true when git diff --quiet exits with code 1", async () => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error("diff"), { exitCode: 1 }));

    await expect(hasUnstagedChanges({ run })).resolves.toBe(true);
  });

  test("maps git diff execution failure to GIT_STATUS_FAILED", async () => {
    const run = vi.fn().mockRejectedValue({ exitCode: 128 });

    await expect(hasUnstagedChanges({ run })).rejects.toMatchObject({
      code: "GIT_STATUS_FAILED",
      exitCode: 2,
    });
  });

  test("maps missing git executable to GIT_NOT_FOUND", async () => {
    const run = vi.fn().mockRejectedValue({ code: "ENOENT" });

    await expect(hasUnstagedChanges({ run })).rejects.toMatchObject({
      code: "GIT_NOT_FOUND",
      exitCode: 2,
    });
  });

  test("maps missing git executable from nested cause to GIT_NOT_FOUND", async () => {
    const run = vi.fn().mockRejectedValue({ cause: { code: "ENOENT" } });

    await expect(hasUnstagedChanges({ run })).rejects.toMatchObject({
      code: "GIT_NOT_FOUND",
      exitCode: 2,
    });
  });
});

describe("stageAllChanges", () => {
  test("stages all working tree changes", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "" });

    await stageAllChanges({ run });

    expect(run).toHaveBeenCalledWith("git", ["add", "-A"]);
  });

  test("maps staging failure to GIT_ADD_FAILED", async () => {
    const run = vi.fn().mockRejectedValue(new Error("add failed"));

    await expect(stageAllChanges({ run })).rejects.toMatchObject({
      code: "GIT_ADD_FAILED",
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

  test("falls back to git push -u origin <branch> when initial push fails", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("no upstream"))
      .mockResolvedValueOnce({ stdout: "feature" })
      .mockResolvedValueOnce({ stdout: "" });

    await pushCurrentBranch({ run });

    expect(run).toHaveBeenNthCalledWith(3, "git", ["push", "-u", "origin", "feature"]);
  });

  test("maps push failure with no upstream fallback to PUSH_NO_UPSTREAM", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("no upstream"))
      .mockResolvedValueOnce({ stdout: "feature" })
      .mockRejectedValueOnce(new Error("origin rejected"));

    await expect(pushCurrentBranch({ run })).rejects.toMatchObject({
      code: "PUSH_NO_UPSTREAM",
      exitCode: 2,
    });
  });

  test("maps missing git executable to GIT_NOT_FOUND", async () => {
    const run = vi.fn().mockRejectedValue({ code: "ENOENT" });

    await expect(pushCurrentBranch({ run })).rejects.toMatchObject({
      code: "GIT_NOT_FOUND",
      exitCode: 2,
    });
  });
});

describe("getHeadSha", () => {
  test("returns trimmed HEAD sha", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "abc123def456\n" });

    await expect(getHeadSha({ run })).resolves.toBe("abc123def456");
    expect(run).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"]);
  });

  test("maps failure to GIT_STATUS_FAILED", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(getHeadSha({ run })).rejects.toMatchObject({
      code: "GIT_STATUS_FAILED",
      exitCode: 2,
    });
  });
});
