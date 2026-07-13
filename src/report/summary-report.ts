import type { ReportLanguage } from "../config/config-schema.js";
import type { ReviewReport } from "../review/review-schema.js";
import { collapseToSingleLine } from "./escape.js";
import { reportStrings } from "./i18n.js";

export function renderSummaryReport(
  report: ReviewReport,
  options: { reportLanguage?: ReportLanguage; filteredOut?: number } = {},
): string {
  const strings = reportStrings(options.reportLanguage);
  const findings =
    report.findings
      .map((finding) => {
        const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
        return `- ${finding.id} [${finding.severity}/${finding.confidence}] ${location} ${collapseToSingleLine(finding.title)}`;
      })
      .join("\n") || strings.noFindings;

  const summaryLine = options.filteredOut && options.filteredOut > 0
    ? `${report.summary} ${strings.filteredOutHint(options.filteredOut)}`
    : report.summary;

  return [
    strings.title,
    `${strings.statusLabel}: ${report.status}`,
    `${strings.riskLabel}: ${report.risk}`,
    `${strings.summaryLabel}: ${summaryLine}`,
    `findings: critical=${report.findingCounts.critical}, high=${report.findingCounts.high}, medium=${report.findingCounts.medium}, low=${report.findingCounts.low}`,
    "",
    findings,
  ].join("\n");
}
