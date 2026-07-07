import type { Severity } from "../config/config-schema.js";
import type { Confidence, ReviewReport } from "../review/review-schema.js";

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const confidenceRank: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function resolveExitCode(
  report: ReviewReport,
  failOn: Severity,
  confidenceFloor: Confidence,
): 0 | 1 {
  const shouldFail = report.findings.some((finding) => {
    return (
      severityRank[finding.severity] >= severityRank[failOn] &&
      confidenceRank[finding.confidence] >= confidenceRank[confidenceFloor]
    );
  });

  return shouldFail ? 1 : 0;
}
