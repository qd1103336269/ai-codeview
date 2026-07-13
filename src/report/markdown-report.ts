import type { ReportLanguage } from "../config/config-schema.js";
import type { ReviewReport } from "../review/review-schema.js";
import { collapseToSingleLine, escapeMarkdown, truncate } from "./escape.js";
import { reportStrings, type ReportStrings } from "./i18n.js";

export function renderMarkdownReport(
  report: ReviewReport,
  options: { reportLanguage?: ReportLanguage; filteredOut?: number } = {},
): string {
  const strings = reportStrings(options.reportLanguage);
  const findings =
    report.findings
      .map((finding) => renderMarkdownFinding(finding, strings))
      .join("\n\n") || strings.noFindings;

  const summaryLine = options.filteredOut && options.filteredOut > 0
    ? `${report.summary} ${strings.filteredOutHint(options.filteredOut)}`
    : report.summary;

  return [
    `# ${strings.title}`,
    "",
    `${strings.statusLabel}：${report.status}`,
    `${strings.riskLabel}：${report.risk}`,
    "",
    `## ${strings.summaryHeading}`,
    "",
    escapeMarkdown(summaryLine),
    "",
    `## ${strings.findingsHeading}`,
    "",
    findings,
  ].join("\n");
}

function renderMarkdownFinding(finding: ReviewReport["findings"][number], strings: ReportStrings): string {
  const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  return [
    `### ${finding.severity.toUpperCase()}：${escapeMarkdown(collapseToSingleLine(finding.title))}`,
    "",
    `- ${strings.idLabel}：${escapeMarkdown(finding.id)}`,
    `- ${strings.confidenceLabel}：${finding.confidence}`,
    `- ${strings.categoryLabel}：${escapeMarkdown(collapseToSingleLine(finding.category))}`,
    `- ${strings.locationLabel}：${escapeMarkdown(location)}`,
    `- ${strings.reasonLabel}：${escapeMarkdown(truncate(finding.reason))}`,
    `- ${strings.suggestionLabel}：${escapeMarkdown(truncate(finding.suggestion))}`,
    finding.learningNote ? `- ${strings.learningNoteLabel}：${escapeMarkdown(truncate(finding.learningNote))}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
