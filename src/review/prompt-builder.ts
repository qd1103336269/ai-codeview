import type { ReportLanguage } from "../config/config-schema.js";

export interface BuildReviewPromptInput {
  chunkId: string;
  diff: string;
  files: string[];
  reportLanguage?: ReportLanguage;
}

export function buildReviewPrompt(input: BuildReviewPromptInput): string {
  const reportLanguage = input.reportLanguage ?? "zh-CN";
  return [
    "你是一名服务于本地 CLI 代码审查工具的资深代码审查者。",
    "请审查下面的 Git diff，重点关注 bug、安全风险、破坏性变更、测试缺失和可维护性问题。",
    "严重等级规则：critical 表示很可能造成安全事故、数据丢失或服务中断；high 表示很可能是 bug 或严重回归；medium 表示有合理可能的问题；low 表示轻微改进建议。",
    "置信度规则：high 表示问题直接由 diff 支撑；medium 表示可能依赖上下文；low 表示弱信号。",
    "只返回 JSON，字段必须使用：risk, status, summary, findingCounts, findings。",
    buildLanguageInstruction(reportLanguage),
    "每个 finding 必须包含：id, severity, confidence, category, file, title, reason, suggestion，并可选包含 line 和 learningNote。",
    "严格使用下面的 JSON 结构：",
    JSON.stringify(
      {
        risk: "low",
        status: "pass",
        summary: "简短审查摘要。",
        findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        findings: [
          {
            id: "TEMP-1",
            severity: "medium",
            confidence: "high",
            category: "bug",
            file: "src/example.ts",
            line: 1,
            title: "问题标题。",
            reason: "说明为什么这里有风险。",
            suggestion: "说明如何修复。",
            learningNote: "可选学习说明。",
          },
        ],
      },
      null,
      2,
    ),
    `分块：${input.chunkId}`,
    `文件：${input.files.join(", ")}`,
    "Diff：",
    input.diff,
  ].join("\n\n");
}

function buildLanguageInstruction(reportLanguage: ReportLanguage): string {
  if (reportLanguage === "en-US") {
    return "User-facing text must use en-US, including summary, title, reason, suggestion, and learningNote.";
  }

  return "面向用户的文字必须使用中文，包括 summary、title、reason、suggestion、learningNote。";
}
