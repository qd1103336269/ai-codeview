import { describe, expect, test, vi } from "vitest";
import { collectGitDiff } from "../../src/git/git-client.js";

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
