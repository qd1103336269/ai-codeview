import type { ReportLanguage } from "../config/config-schema.js";

export interface ReportStrings {
  title: string;
  statusLabel: string;
  riskLabel: string;
  summaryHeading: string;
  findingsHeading: string;
  noFindings: string;
  idLabel: string;
  confidenceLabel: string;
  categoryLabel: string;
  locationLabel: string;
  reasonLabel: string;
  suggestionLabel: string;
  learningNoteLabel: string;
  summaryLabel: string;
  filteredOutHint: (count: number) => string;
}

const zhCN: ReportStrings = {
  title: "AI 代码审查报告",
  statusLabel: "状态",
  riskLabel: "风险",
  summaryHeading: "摘要",
  findingsHeading: "问题列表",
  noFindings: "未发现问题。",
  idLabel: "ID",
  confidenceLabel: "置信度",
  categoryLabel: "分类",
  locationLabel: "位置",
  reasonLabel: "原因",
  suggestionLabel: "建议",
  learningNoteLabel: "学习说明",
  summaryLabel: "摘要",
  filteredOutHint: (count) => `（已过滤 ${count} 条低置信度 finding）`,
};

const enUS: ReportStrings = {
  title: "AI Code Review Report",
  statusLabel: "Status",
  riskLabel: "Risk",
  summaryHeading: "Summary",
  findingsHeading: "Findings",
  noFindings: "No issues found.",
  idLabel: "ID",
  confidenceLabel: "Confidence",
  categoryLabel: "Category",
  locationLabel: "Location",
  reasonLabel: "Reason",
  suggestionLabel: "Suggestion",
  learningNoteLabel: "Learning note",
  summaryLabel: "summary",
  filteredOutHint: (count) => `(${count} low-confidence finding(s) filtered out)`,
};

export function reportStrings(reportLanguage: ReportLanguage | undefined): ReportStrings {
  return reportLanguage === "en-US" ? enUS : zhCN;
}
