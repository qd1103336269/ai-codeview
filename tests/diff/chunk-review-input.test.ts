import { describe, expect, test } from "vitest";
import { chunkReviewInput } from "../../src/diff/chunk-review-input.js";
import type { ReviewFileDiff } from "../../src/diff/parse-git-diff.js";

const file = (path: string, raw: string): ReviewFileDiff => ({
  path,
  additions: 1,
  deletions: 0,
  raw,
  binary: false,
});

describe("chunkReviewInput", () => {
  test("groups files without exceeding max characters", () => {
    const chunks = chunkReviewInput(
      [file("a.ts", "a".repeat(10)), file("b.ts", "b".repeat(10))],
      15,
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.files.map((item) => item.path)).toEqual(["a.ts"]);
  });
});
