import { describe, expect, test } from "vitest";
import stripAnsi from "strip-ansi";
import { renderJsonReport } from "../../src/report/json-report.js";
import { renderMarkdownReport } from "../../src/report/markdown-report.js";
import { renderSummaryReport } from "../../src/report/summary-report.js";
import { renderTextReport } from "../../src/report/text-report.js";
import type { ReviewReport } from "../../src/review/review-schema.js";

const report: ReviewReport = {
  risk: "high",
  status: "fail",
  summary: "发现一个高风险问题。",
  findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
  findings: [
    {
      id: "ACV-0001",
      severity: "high",
      confidence: "medium",
      category: "bug",
      file: "src/auth.ts",
      line: 12,
      title: "过期会话可能被错误接受",
      reason: "过期时间比较忽略了具体时间。",
      suggestion: "改为比较时间戳。",
      learningNote: "时间比较应统一使用同一种单位。",
    },
  ],
};

describe("report renderers", () => {
  test("renders parseable JSON without ANSI", () => {
    const output = renderJsonReport(report);

    expect(JSON.parse(output).summary).toBe("发现一个高风险问题。");
    expect(stripAnsi(output)).toBe(output);
  });

  test("renders Markdown sections", () => {
    const output = renderMarkdownReport(report);

    expect(output).toContain("# AI 代码审查报告");
    expect(output).toContain("## 问题列表");
    expect(output).toContain("过期会话可能被错误接受");
  });

  test("renders text report with content that remains readable without ANSI", () => {
    const output = stripAnsi(renderTextReport(report, { color: true }));

    expect(output).toContain("AI 代码审查报告");
    expect(output).toContain("HIGH");
    expect(output).toContain("src/auth.ts:12");
  });
  test("renders compact summary without detailed reason and suggestion", () => {
    const output = renderSummaryReport(report);

    expect(output).toContain("AI Codeview Summary");
    expect(output).toContain("risk: high");
    expect(output).toContain("ACV-0001");
    expect(output).toContain("src/auth.ts:12");
    expect(output).toContain(report.findings[0]?.title);
    expect(output).not.toContain(report.findings[0]?.reason);
    expect(output).not.toContain(report.findings[0]?.suggestion);
  });
});
