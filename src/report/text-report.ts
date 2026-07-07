import { Chalk } from "chalk";
import type { ReviewFinding, ReviewReport } from "../review/review-schema.js";

export interface TextReportOptions {
  color: boolean;
}

const forcedColor = new Chalk({ level: 1 });

function severityLabel(finding: ReviewFinding, color: boolean): string {
  const label = finding.severity.toUpperCase();
  if (!color) return label;
  if (finding.severity === "critical") return forcedColor.bold.red(label);
  if (finding.severity === "high") return forcedColor.red(label);
  if (finding.severity === "medium") return forcedColor.yellow(label);
  return forcedColor.blue(label);
}

export function renderTextReport(report: ReviewReport, options: TextReportOptions): string {
  const title = options.color ? forcedColor.bold("AI 代码审查报告") : "AI 代码审查报告";
  const findings =
    report.findings
      .map((finding) => {
        const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
        return [
          `${severityLabel(finding, options.color)} ${finding.title}`,
          `  ${location}`,
          `  原因：${finding.reason}`,
          `  建议：${finding.suggestion}`,
          finding.learningNote ? `  学习说明：${finding.learningNote}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n") || "未发现问题。";

  return [
    title,
    `状态：${report.status}`,
    `风险：${report.risk}`,
    `摘要：${report.summary}`,
    "",
    findings,
  ].join("\n");
}
