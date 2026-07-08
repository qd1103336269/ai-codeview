import { describe, expect, test } from "vitest";
import { buildCommitMessagePrompt, sanitizeCommitMessage } from "../../src/review/commit-message.js";

describe("commit-message", () => {
  test("builds a Chinese commit message prompt from staged diff", () => {
    const prompt = buildCommitMessagePrompt({
      diff: "diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;",
    });

    expect(prompt).toContain("中文");
    expect(prompt).toContain("Conventional Commits");
    expect(prompt).toContain("diff --git");
  });

  test("sanitizes markdown fenced output", () => {
    expect(sanitizeCommitMessage("```text\nfeat: 增加推送前审查\n```")).toBe("feat: 增加推送前审查");
  });
});
