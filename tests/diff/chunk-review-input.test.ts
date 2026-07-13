import { describe, expect, test } from "vitest";
import { chunkReviewInput } from "../../src/diff/chunk-review-input.js";
import type { ReviewFileDiff } from "../../src/diff/parse-git-diff.js";

const file = (path: string, raw: string): ReviewFileDiff => ({
  path,
  additions: 1,
  deletions: 0,
  raw,
  binary: false,
  noContentChange: false,
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

  test("splits single file larger than max characters by lines", () => {
    const raw = ["line1", "line2", "line3", "line4", "line5"].join("\n");
    const chunks = chunkReviewInput([file("big.ts", raw)], 12);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.raw.length).toBeLessThanOrEqual(30);
    }
    const combinedLines = chunks.flatMap((c) => c.files.map((f) => f.raw)).join("\n").split(/\r?\n/);
    expect(combinedLines).toContain("line1");
    expect(combinedLines).toContain("line5");
  });

  test("never truncates a single line when splitting a large file", () => {
    const longLine = "x".repeat(20);
    const chunks = chunkReviewInput([file("single.ts", longLine)], 10);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.raw).toBe(longLine);
  });
});
