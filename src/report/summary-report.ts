import type { ReviewReport } from "../review/review-schema.js";

export function renderSummaryReport(report: ReviewReport): string {
  const findings =
    report.findings
      .map((finding) => {
        const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
        return `- ${finding.id} [${finding.severity}/${finding.confidence}] ${location} ${finding.title}`;
      })
      .join("\n") || "- no findings";

  return [
    "AI Codeview Summary",
    `status: ${report.status}`,
    `risk: ${report.risk}`,
    `summary: ${report.summary}`,
    `findings: critical=${report.findingCounts.critical}, high=${report.findingCounts.high}, medium=${report.findingCounts.medium}, low=${report.findingCounts.low}`,
    "",
    findings,
  ].join("\n");
}
