import { Chalk } from "chalk";
import type { ReportLanguage } from "../config/config-schema.js";
import type { ReviewFinding, ReviewReport } from "../review/review-schema.js";
import { collapseToSingleLine, truncate } from "./escape.js";
import { reportStrings, type ReportStrings } from "./i18n.js";

export interface TextReportOptions {
  color: boolean;
  reportLanguage?: ReportLanguage;
  filteredOut?: number;
}

const forcedColor = new Chalk({ level: 1 });

function severityLabel(finding: ReviewFinding, color: boolean): string {
  const label = finding.severity.toUpperCase();
  if (!color) return label;
  if (finding.severity === "critical") return forcedColor.bold.red(label);
  if (finding.severity === "high") return forcedColor.red(label);
  if (finding.severity === "medium") return forcedColor.yellow(label);
  return forcedColor.green(label);
}

function indentMultiline(value: string): string {
  return value.replace(/\r?\n/g, "\n  ");
}

export function renderTextReport(report: ReviewReport, options: TextReportOptions): string {
  const strings = reportStrings(options.reportLanguage);
  const title = options.color ? forcedColor.bold(strings.title) : strings.title;
  const findings =
    report.findings
      .map((finding) => renderTextFinding(finding, options.color, strings))
      .join("\n\n") || strings.noFindings;

  const summaryLine = options.filteredOut && options.filteredOut > 0
    ? `${report.summary} ${strings.filteredOutHint(options.filteredOut)}`
    : report.summary;

  return [
    title,
    `${strings.statusLabel}：${report.status}`,
    `${strings.riskLabel}：${report.risk}`,
    `${strings.summaryLabel}：${summaryLine}`,
    "",
    findings,
  ].join("\n");
}

function renderTextFinding(finding: ReviewFinding, color: boolean, strings: ReportStrings): string {
  const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  return [
    `${severityLabel(finding, color)} ${collapseToSingleLine(finding.title)}`,
    `  ${location}`,
    `  ${strings.reasonLabel}：${indentMultiline(truncate(finding.reason))}`,
    `  ${strings.suggestionLabel}：${indentMultiline(truncate(finding.suggestion))}`,
    finding.learningNote ? `  ${strings.learningNoteLabel}：${indentMultiline(truncate(finding.learningNote))}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
