import { describe, expect, test } from "vitest";
import { resolveExitCode } from "../../src/report/exit-code.js";
import { filterByConfidence } from "../../src/report/filter-by-confidence.js";
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

  test("filterByConfidence drops low-confidence findings and recounts", () => {
    const report: ReviewReport = {
      ...baseReport,
      findings: [
        {
          id: "ACV-1",
          severity: "high",
          confidence: "high",
          category: "bug",
          file: "a.ts",
          title: "x",
          reason: "y",
          suggestion: "z",
        },
        {
          id: "ACV-2",
          severity: "critical",
          confidence: "low",
          category: "bug",
          file: "a.ts",
          title: "x",
          reason: "y",
          suggestion: "z",
        },
      ],
      findingCounts: { critical: 1, high: 1, medium: 0, low: 0 },
      risk: "critical",
    };

    const { report: visible, filteredOut } = filterByConfidence(report, "medium");

    expect(filteredOut).toBe(1);
    expect(visible.findings).toHaveLength(1);
    expect(visible.findingCounts.critical).toBe(0);
    expect(visible.findingCounts.high).toBe(1);
    expect(visible.risk).toBe("high");
  });

  test("filterByConfidence keeps all findings when floor is low", () => {
    const report: ReviewReport = {
      ...baseReport,
      findings: [
        {
          id: "ACV-1",
          severity: "low",
          confidence: "low",
          category: "bug",
          file: "a.ts",
          title: "x",
          reason: "y",
          suggestion: "z",
        },
      ],
    };

    const { report: visible, filteredOut } = filterByConfidence(report, "low");

    expect(filteredOut).toBe(0);
    expect(visible.findings).toHaveLength(1);
  });
});
