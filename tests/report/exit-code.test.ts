import { describe, expect, test } from "vitest";
import { resolveExitCode } from "../../src/report/exit-code.js";
import type { ReviewReport } from "../../src/review/review-schema.js";

const baseReport: ReviewReport = {
  risk: "medium",
  status: "pass",
  summary: "ok",
  findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
  findings: [],
};

describe("resolveExitCode", () => {
  test("returns 0 when findings are below threshold", () => {
    const report: ReviewReport = {
      ...baseReport,
      findings: [
        {
          id: "ACV-1",
          severity: "medium",
          confidence: "high",
          category: "bug",
          file: "a.ts",
          title: "x",
          reason: "y",
          suggestion: "z",
        },
      ],
    };

    expect(resolveExitCode(report, "high", "medium")).toBe(0);
  });

  test("returns 1 when finding meets severity and confidence threshold", () => {
    const report: ReviewReport = {
      ...baseReport,
      findings: [
        {
          id: "ACV-1",
          severity: "high",
          confidence: "medium",
          category: "bug",
          file: "a.ts",
          title: "x",
          reason: "y",
          suggestion: "z",
        },
      ],
    };

    expect(resolveExitCode(report, "high", "medium")).toBe(1);
  });

  test("does not fail gate for low confidence by default", () => {
    const report: ReviewReport = {
      ...baseReport,
      findings: [
        {
          id: "ACV-1",
          severity: "critical",
          confidence: "low",
          category: "bug",
          file: "a.ts",
          title: "x",
          reason: "y",
          suggestion: "z",
        },
      ],
    };

    expect(resolveExitCode(report, "high", "medium")).toBe(0);
  });
});
