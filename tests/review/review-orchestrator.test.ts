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
    expect(report.chunkErrors).toEqual([]);
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

  test("returns partial findings when a chunk fails and continueOnError is true", async () => {
    const provider = {
      review: vi
        .fn()
        .mockResolvedValueOnce({
          risk: "low",
          status: "pass",
          summary: "ok",
          findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
          findings: [
            {
              id: "y",
              severity: "medium",
              confidence: "high",
              category: "quality",
              file: "a.ts",
              title: "t",
              reason: "r",
              suggestion: "s",
            },
          ],
        })
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce({
          risk: "low",
          status: "pass",
          summary: "ok",
          findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
          findings: [
            {
              id: "z",
              severity: "low",
              confidence: "high",
              category: "quality",
              file: "c.ts",
              title: "t2",
              reason: "r2",
              suggestion: "s2",
            },
          ],
        }),
    };
    const onChunkComplete = vi.fn();

    const report = await reviewChunks({
      chunks: [
        chunkOf("chunk-1", "a.ts"),
        chunkOf("chunk-2", "b.ts"),
        chunkOf("chunk-3", "c.ts"),
      ],
      provider,
      continueOnError: true,
      onChunkComplete,
    });

    expect(report.findings).toHaveLength(2);
    expect(report.chunkErrors).toEqual([{ chunkId: "chunk-2", message: "network down" }]);
    expect(onChunkComplete).toHaveBeenCalledTimes(3);
    expect(report.summary).toContain("1 个分块审查失败");
  });

  test("rethrows when continueOnError is false", async () => {
    const provider = {
      review: vi.fn().mockRejectedValueOnce(new Error("fatal")),
    };

    await expect(
      reviewChunks({
        chunks: [chunkOf("chunk-1", "a.ts")],
        provider,
        continueOnError: false,
      }),
    ).rejects.toThrow("fatal");
  });

  test("deduplicates findings with same file+line+title across chunks", async () => {
    const duplicateFinding = {
      id: "x",
      severity: "high" as const,
      confidence: "medium" as const,
      category: "bug",
      file: "a.ts",
      line: 10,
      title: "重复问题",
      reason: "原因",
      suggestion: "建议",
    };
    const provider = {
      review: vi.fn().mockResolvedValue({
        risk: "high",
        status: "fail",
        summary: "ok",
        findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
        findings: [duplicateFinding],
      }),
    };

    const report = await reviewChunks({
      chunks: [chunkOf("chunk-1", "a.ts"), chunkOf("chunk-2", "a.ts")],
      provider,
    });

    expect(report.findings).toHaveLength(1);
    expect(report.findingCounts.high).toBe(1);
  });
});

function chunkOf(id: string, path: string) {
  return {
    id,
    raw: "diff",
    files: [{ path, additions: 1, deletions: 0, raw: "diff", binary: false }],
  };
}
