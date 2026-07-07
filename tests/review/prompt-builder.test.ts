import { describe, expect, test } from "vitest";
import { buildReviewPrompt } from "../../src/review/prompt-builder.js";

describe("buildReviewPrompt", () => {
  test("includes severity rules and diff content", () => {
    const prompt = buildReviewPrompt({
      chunkId: "chunk-1",
      diff: "+const token = input;",
      files: ["src/auth.ts"],
    });

    expect(prompt).toContain("资深代码审查者");
    expect(prompt).toContain("critical");
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("+const token = input;");
    expect(prompt).toContain("只返回 JSON");
    expect(prompt).toContain("面向用户的文字必须使用中文");
    expect(prompt).toContain('"risk"');
    expect(prompt).toContain('"findingCounts"');
    expect(prompt).toContain('"findings"');
  });
});
