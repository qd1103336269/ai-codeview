import type { Confidence, ReviewReport } from "../review/review-schema.js";

const confidenceRank: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export interface FilterByConfidenceResult {
  report: ReviewReport;
  filteredOut: number;
}

export function filterByConfidence(report: ReviewReport, floor: Confidence): FilterByConfidenceResult {
  const floorRank = confidenceRank[floor];
  const visible = report.findings.filter(
    (finding) => confidenceRank[finding.confidence] >= floorRank,
  );
  const filteredOut = report.findings.length - visible.length;

  if (filteredOut === 0) {
    return { report, filteredOut: 0 };
  }

  const findingCounts = {
    critical: visible.filter((f) => f.severity === "critical").length,
    high: visible.filter((f) => f.severity === "high").length,
    medium: visible.filter((f) => f.severity === "medium").length,
    low: visible.filter((f) => f.severity === "low").length,
  };

  const risk =
    findingCounts.critical > 0
      ? ("critical" as const)
      : findingCounts.high > 0
        ? ("high" as const)
        : findingCounts.medium > 0
          ? ("medium" as const)
          : ("low" as const);

  return {
    report: {
      ...report,
      findings: visible,
      findingCounts,
      risk,
    },
    filteredOut,
  };
}
