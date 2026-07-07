import type { ReviewReport } from "../review/review-schema.js";

export function renderJsonReport(report: ReviewReport): string {
  return JSON.stringify(report, null, 2);
}
