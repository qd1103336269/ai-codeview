import type { ReviewReport } from "../review/review-schema.js";

export function renderMarkdownReport(report: ReviewReport): string {
  const findings =
    report.findings
      .map((finding) => {
        const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
        return [
          `### ${finding.severity.toUpperCase()}：${finding.title}`,
          "",
          `- ID：${finding.id}`,
          `- 置信度：${finding.confidence}`,
          `- 分类：${finding.category}`,
          `- 位置：${location}`,
          `- 原因：${finding.reason}`,
          `- 建议：${finding.suggestion}`,
          finding.learningNote ? `- 学习说明：${finding.learningNote}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n") || "未发现问题。";

  return [
    "# AI 代码审查报告",
    "",
    `状态：${report.status}`,
    `风险：${report.risk}`,
    "",
    "## 摘要",
    "",
    report.summary,
    "",
    "## 问题列表",
    "",
    findings,
  ].join("\n");
}
