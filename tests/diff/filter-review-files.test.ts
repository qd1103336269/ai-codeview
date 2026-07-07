import { describe, expect, test } from "vitest";
import { filterReviewFiles } from "../../src/diff/filter-review-files.js";
import type { ReviewFileDiff } from "../../src/diff/parse-git-diff.js";

const file = (path: string): ReviewFileDiff => ({
  path,
  additions: 1,
  deletions: 0,
  raw: "diff",
  binary: false,
});

describe("filterReviewFiles", () => {
  test("skips lock, dist, minified, and binary files", () => {
    const result = filterReviewFiles(
      [
        file("src/a.ts"),
        file("pnpm-lock.yaml"),
        file("dist/app.js"),
        file("public/app.min.js"),
        { ...file("image.png"), binary: true },
      ],
      ["dist/**", "*.min.js", "pnpm-lock.yaml"],
    );

    expect(result.reviewable.map((item) => item.path)).toEqual(["src/a.ts"]);
    expect(result.skipped).toHaveLength(4);
  });
});
