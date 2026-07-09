import { describe, expect, test, vi } from "vitest";
import { reviewChunks } from "../../src/review/review-orchestrator.js";

describe("reviewChunks", () => {
  test("merges findings and counts severities", async () => {
    const provider = {
      review: vi.fn().mockResolvedValue({
        risk: "high",
        status: "fail",
        summary: "分块存在风险。",
        findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
        findings: [
          {
            id: "x",
            severity: "high",
            confidence: "medium",
            category: "bug",
            file: "a.ts",
            title: "存在 bug",
            reason: "原因",
            suggestion: "修复建议",
          },
        ],
      }),
    };

    const report = await reviewChunks({
      chunks: [
        {
          id: "chunk-1",
          raw: "diff",
          files: [{ path: "a.ts", additions: 1, deletions: 0, raw: "diff", binary: false }],
        },
      ],
      provider,
    });

    expect(report.findingCounts.high).toBe(1);
    expect(report.status).toBe("fail");
    expect(report.summary).toBe("发现 1 个审查问题。");
    expect(report.findings[0]?.id).toBe("ACV-0001");
  });
  test("passes report language into provider prompt", async () => {
    const provider = {
      review: vi.fn().mockResolvedValue({
        risk: "low",
        status: "pass",
        summary: "No issues.",
        findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        findings: [],
      }),
    };

    await reviewChunks({
      chunks: [
        {
          id: "chunk-1",
          raw: "diff",
          files: [{ path: "a.ts", additions: 1, deletions: 0, raw: "diff", binary: false }],
        },
      ],
      provider,
      reportLanguage: "en-US",
    });

    expect(provider.review).toHaveBeenCalledWith({
      prompt: expect.stringContaining("en-US"),
    });
  });
});
