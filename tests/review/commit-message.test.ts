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
    expect(prompt).toContain("<diff>");
    expect(prompt).toContain("</diff>");
  });

  test("sanitizes markdown fenced output", () => {
    expect(sanitizeCommitMessage("```text\nfeat: 增加推送前审查\n```")).toBe("feat: 增加推送前审查");
  });

  test("sanitizes markdown fenced output with json language tag", () => {
    expect(sanitizeCommitMessage("```json\nfeat: 更新配置\n```")).toBe("feat: 更新配置");
  });

  test("sanitizes markdown fenced output without language tag", () => {
    expect(sanitizeCommitMessage("```\nfeat: 修复 bug\n```")).toBe("feat: 修复 bug");
  });

  test("sanitizes markdown fenced output with trailing whitespace after fence", () => {
    expect(sanitizeCommitMessage("```text\nfeat: 添加测试\n```  ")).toBe("feat: 添加测试");
  });
});
