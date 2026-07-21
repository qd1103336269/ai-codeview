import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";
import stripAnsi from "strip-ansi";
import { AppError } from "../../src/errors/app-error.js";
import { runReviewCommand } from "../../src/commands/review-command.js";
import type { ReviewReport } from "../../src/review/review-schema.js";

describe("runReviewCommand", () => {
  test("returns no-diff message and exit code 0", async () => {
    const collectGitDiff = vi.fn().mockRejectedValue(
      new AppError({
        code: "NO_DIFF",
        exitCode: 0,
        message: "没有发现可审查的 diff。",
      }),
    );

    const result = await runReviewCommand({ staged: false, format: "text" }, { collectGitDiff });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("没有发现可审查的 diff。");
  });

  test("runs the review pipeline and returns rendered text", async () => {
    const collectGitDiff = vi.fn().mockResolvedValue(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,1 +1,1 @@",
        "-const a = 1;",
        "+const a = 2;",
      ].join("\n"),
    );

    const provider = {
      review: vi.fn().mockResolvedValue({
        risk: "low",
        status: "pass",
        summary: "No issues.",
        findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        findings: [],
      }),
    };

    const result = await runReviewCommand({ staged: false, format: "text" }, { collectGitDiff, provider });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("AI 代码审查报告");
  });

  test("emits progress events for the review pipeline", async () => {
    const progress: string[] = [];
    const provider = providerReturningPass();

    const result = await runReviewCommand(
      { staged: false, format: "text" },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider,
        onProgress: (message) => progress.push(message),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(progress).toEqual([
      "开始进行代码 review...",
      "读取配置...",
      "收集 Git diff...",
      "解析 diff...",
      "检查敏感信息...",
      "过滤无需审查的文件...",
      "准备审查分块...",
      "调用 DeepSeek 审查分块 1/1...",
      "DeepSeek 分块 1/1 审查完成。",
      "生成审查报告...",
      "代码 review 完成。",
    ]);
  });

  test("uses failOn option when resolving the gate exit code", async () => {
    const provider = providerReturning({
      risk: "medium",
      status: "fail",
      summary: "One medium risk issue.",
      findingCounts: { critical: 0, high: 0, medium: 1, low: 0 },
      findings: [
        {
          id: "raw-id",
          severity: "medium",
          confidence: "medium",
          category: "bug",
          file: "src/a.ts",
          line: 1,
          title: "Medium issue",
          reason: "Reason.",
          suggestion: "Suggestion.",
        },
      ],
    });

    const result = await runReviewCommand(
      { staged: false, format: "text", failOn: "medium" },
      { collectGitDiff: collectGitDiffWithChange(), provider },
    );

    expect(result.exitCode).toBe(1);
  });

  test("writes rendered report to output file", async () => {
    const cwd = await makeTempDir();
    const outputPath = join(cwd, "review.md");

    const result = await runReviewCommand(
      { staged: false, format: "markdown", output: outputPath },
      { collectGitDiff: collectGitDiffWithChange(), provider: providerReturningPass(), cwd },
    );

    const written = await readFile(outputPath, "utf8");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("审查报告已写入");
    expect(written).toContain("# AI 代码审查报告");
  });

  test("returns default markdown report to stdout without writing a file", async () => {
    const cwd = await makeTempDir();
    const outputPath = join(cwd, "ai-codeview-report.md");

    const result = await runReviewCommand(
      { staged: false },
      { collectGitDiff: collectGitDiffWithChange(), provider: providerReturningPass(), cwd },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("# AI 代码审查报告");
    await expect(access(outputPath)).rejects.toThrow();
  });

  test("emits completion progress when report is written to a file", async () => {
    const cwd = await makeTempDir();
    const progress: string[] = [];

    const result = await runReviewCommand(
      { staged: false, format: "markdown", output: "review.md" },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider: providerReturningPass(),
        cwd,
        onProgress: (message) => progress.push(message),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(progress.at(-1)).toBe("代码 review 完成。");
  });

  test("renders AppError as JSON when format is json", async () => {
    const collectGitDiff = vi.fn().mockRejectedValue(
      new AppError({
        code: "MISSING_API_KEY",
        exitCode: 2,
        message: "缺少 DEEPSEEK_API_KEY。",
        suggestion: "请先设置 DEEPSEEK_API_KEY，再运行 review。",
      }),
    );

    const result = await runReviewCommand({ staged: false, format: "json" }, { collectGitDiff });

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "error",
      error: {
        code: "MISSING_API_KEY",
        message: "缺少 DEEPSEEK_API_KEY。",
      },
    });
    expect(stripAnsi(result.output)).toBe(result.output);
  });

  test("forces ANSI colors when color option is true", async () => {
    const result = await runReviewCommand(
      { staged: false, format: "text", color: true },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider: providerReturning({
          risk: "high",
          status: "fail",
          summary: "One high risk issue.",
          findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
          findings: [
            {
              id: "raw-id",
              severity: "high",
              confidence: "high",
              category: "bug",
              file: "src/a.ts",
              line: 1,
              title: "High issue",
              reason: "Reason.",
              suggestion: "Suggestion.",
            },
          ],
        }),
      },
    );

    expect(result.output).toContain("\u001B[");
    expect(stripAnsi(result.output)).toContain("HIGH");
  });

  test("passes base option to diff collector", async () => {
    const collectGitDiff = collectGitDiffWithChange();

    await runReviewCommand(
      { base: "main", format: "text" },
      { collectGitDiff, provider: providerReturningPass() },
    );

    expect(collectGitDiff).toHaveBeenCalledWith({ mode: "base", base: "main" });
  });

  test("passes changed option to diff collector as combined local diff", async () => {
    const collectGitDiff = collectGitDiffWithChange();

    await runReviewCommand(
      { changed: true, format: "text" },
      { collectGitDiff, provider: providerReturningPass() },
    );

    expect(collectGitDiff).toHaveBeenCalledWith({ mode: "changed" });
  });

  test("rejects changed option combined with staged or base mode", async () => {
    const stagedResult = await runReviewCommand(
      { changed: true, staged: true, format: "text" },
      { provider: providerReturningPass() },
    );
    const baseResult = await runReviewCommand(
      { changed: true, base: "main", format: "text" },
      { provider: providerReturningPass() },
    );

    expect(stagedResult.exitCode).toBe(2);
    expect(baseResult.exitCode).toBe(2);
  });

  test("renders compact summary when summary option is true", async () => {
    const result = await runReviewCommand(
      { staged: false, summary: true },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider: providerReturning({
          risk: "high",
          status: "fail",
          summary: "One high risk issue.",
          findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
          findings: [
            {
              id: "raw-id",
              severity: "high",
              confidence: "high",
              category: "bug",
              file: "src/a.ts",
              line: 1,
              title: "High issue",
              reason: "Detailed reason should stay out of summary.",
              suggestion: "Detailed suggestion should stay out of summary.",
            },
          ],
        }),
      },
    );

    expect(result.output).toContain("AI 代码审查报告");
    expect(result.output).toContain("ACV-0001");
    expect(result.output).toContain("src/a.ts:1");
    expect(result.output).not.toContain("Detailed reason should stay out of summary.");
    expect(result.output).not.toContain("Detailed suggestion should stay out of summary.");
  });

  test("blocks review before provider call when added diff contains a likely secret", async () => {
    const provider = providerReturningPass();

    const result = await runReviewCommand(
      { staged: false, format: "text" },
      { collectGitDiff: collectGitDiffWithSecret(), provider },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("检测到疑似密钥");
    expect(result.output).toContain("src/config.ts");
    expect(provider.review).not.toHaveBeenCalled();
  });

  test("renders secret guard failure as JSON when format is json", async () => {
    const result = await runReviewCommand(
      { staged: false, format: "json" },
      { collectGitDiff: collectGitDiffWithSecret(), provider: providerReturningPass() },
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "error",
      error: {
        code: "SECRET_DETECTED",
      },
    });
  });

  test("allows review when allowSecrets option is true", async () => {
    const provider = providerReturningPass();

    const result = await runReviewCommand(
      { staged: false, format: "text", allowSecrets: true },
      { collectGitDiff: collectGitDiffWithSecret(), provider },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("AI 代码审查报告");
    expect(provider.review).toHaveBeenCalledTimes(1);
  });

  test("allows review when config enables security.allowSecrets", async () => {
    const cwd = await makeTempDir();
    await writeFile(
      join(cwd, ".ai-codeview.json"),
      JSON.stringify({ security: { allowSecrets: true } }),
    );
    const provider = providerReturningPass();

    const result = await runReviewCommand(
      { staged: false, format: "text" },
      { collectGitDiff: collectGitDiffWithSecret(), provider, cwd },
    );

    expect(result.exitCode).toBe(0);
    expect(provider.review).toHaveBeenCalledTimes(1);
  });

  test("rejects path mode combined with staged mode", async () => {
    const result = await runReviewCommand(
      { staged: true, path: ["E:\\code\\demo\\src\\a.ts"], format: "text" },
      { provider: providerReturningPass() },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("不能同时使用");
  });

  test("reviews absolute path input without collecting git diff", async () => {
    const cwd = await makeTempDir();
    const sourceDir = join(cwd, "src");
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, "a.ts");
    await writeFile(sourceFile, "export const a = 1;\n", "utf8");
    const collectGitDiff = vi.fn();
    const provider = providerReturningPass();

    const result = await runReviewCommand(
      { path: [sourceFile], format: "text" },
      { collectGitDiff, provider, cwd },
    );

    expect(result.exitCode).toBe(0);
    expect(collectGitDiff).not.toHaveBeenCalled();
    expect(provider.review).toHaveBeenCalledTimes(1);
  });

  test("keeps config output.file when only --format is passed", async () => {
    const cwd = await makeTempDir();
    await writeFile(
      join(cwd, ".ai-codeview.json"),
      JSON.stringify({ output: { format: "markdown", file: "review.md" } }),
    );

    const result = await runReviewCommand(
      { format: "markdown" },
      { collectGitDiff: collectGitDiffWithChange(), provider: providerReturningPass(), cwd },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("审查报告已写入");
    const written = await readFile(join(cwd, "review.md"), "utf8");
    expect(written).toContain("# AI 代码审查报告");
  });

  test("forces stdout with noOutputFile and ignores config output.file", async () => {
    const cwd = await makeTempDir();
    await writeFile(
      join(cwd, ".ai-codeview.json"),
      JSON.stringify({ output: { format: "markdown", file: "review.md" } }),
    );

    const result = await runReviewCommand(
      { format: "markdown", noOutputFile: true },
      { collectGitDiff: collectGitDiffWithChange(), provider: providerReturningPass(), cwd },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("# AI 代码审查报告");
    await expect(access(join(cwd, "review.md"))).rejects.toThrow();
  });

  test("throws INVALID_CLI_INPUT when --fix is combined with --output", async () => {
    const result = await runReviewCommand(
      { fix: true, output: "report.md", format: "text" },
      { collectGitDiff: collectGitDiffWithChange(), provider: providerReturningPass() },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("不能同时使用 --fix");
  });

  test("throws INVALID_CLI_INPUT when --fix is combined with --format json", async () => {
    const result = await runReviewCommand(
      { fix: true, format: "json" },
      { collectGitDiff: collectGitDiffWithChange(), provider: providerReturningPass() },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("不能同时使用 --fix");
  });

  test("--fix applies patch when user confirms", async () => {
    const cwd = await makeTempDir();
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src", "a.ts"), "const a = 1;\n", "utf8");

    const provider = providerReturning({
      risk: "medium",
      status: "fail",
      summary: "One issue.",
      findingCounts: { critical: 0, high: 0, medium: 1, low: 0 },
      findings: [
        {
          id: "ACV-1",
          severity: "medium",
          confidence: "high",
          category: "bug",
          file: "src/a.ts",
          line: 1,
          title: "问题",
          reason: "原因",
          suggestion: "建议",
          patch: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 2;",
        },
      ],
    });

    const result = await runReviewCommand(
      { fix: true, format: "text" },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider,
        cwd,
        confirmFix: async () => "apply" as const,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("已应用 1 个修复");
    const updated = await readFile(join(cwd, "src", "a.ts"), "utf8");
    expect(updated).toContain("const a = 2;");
  });

  test("--fix skips when user says skip", async () => {
    const provider = providerReturning({
      risk: "medium",
      status: "fail",
      summary: "One issue.",
      findingCounts: { critical: 0, high: 0, medium: 1, low: 0 },
      findings: [
        {
          id: "ACV-1",
          severity: "medium",
          confidence: "high",
          category: "bug",
          file: "src/a.ts",
          line: 1,
          title: "问题",
          reason: "原因",
          suggestion: "建议",
          patch: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b",
        },
      ],
    });

    const result = await runReviewCommand(
      { fix: true, format: "text" },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider,
        confirmFix: async () => "skip" as const,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("1 个跳过");
  });

  test("--fix skip-all exits remaining findings", async () => {
    const provider = providerReturning({
      risk: "high",
      status: "fail",
      summary: "Two issues.",
      findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
      findings: [
        {
          id: "ACV-1",
          severity: "high",
          confidence: "high",
          category: "bug",
          file: "src/a.ts",
          line: 1,
          title: "问题1",
          reason: "原因",
          suggestion: "建议",
          patch: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b",
        },
        {
          id: "ACV-2",
          severity: "medium",
          confidence: "high",
          category: "bug",
          file: "src/b.ts",
          line: 1,
          title: "问题2",
          reason: "原因",
          suggestion: "建议",
          patch: "--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n-c\n+d",
        },
      ],
    });

    const result = await runReviewCommand(
      { fix: true, format: "text" },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider,
        confirmFix: async () => "skip-all" as const,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("2 个跳过");
  });

  test("--fix reports no fixable findings when AI returns no patch", async () => {
    const provider = providerReturningPass();
    const result = await runReviewCommand(
      { fix: true, format: "text" },
      {
        collectGitDiff: collectGitDiffWithChange(),
        provider,
        confirmFix: async () => "apply" as const,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("没有可自动修复的 finding");
  });
});

function collectGitDiffWithChange() {
  return vi.fn().mockResolvedValue(
    [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,1 +1,1 @@",
      "-const a = 1;",
      "+const a = 2;",
    ].join("\n"),
  );
}

function collectGitDiffWithSecret() {
  return vi.fn().mockResolvedValue(
    [
      "diff --git a/src/config.ts b/src/config.ts",
      "--- a/src/config.ts",
      "+++ b/src/config.ts",
      "@@ -1,1 +1,1 @@",
      `+const deepseekApiKey = "${deepseekLikeApiKey()}";`,
    ].join("\n"),
  );
}

function providerReturningPass() {
  return providerReturning({
    risk: "low",
    status: "pass",
    summary: "No issues.",
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    findings: [],
  });
}

function deepseekLikeApiKey(): string {
  return ["sk", "1234567890abcdef1234567890abcdef"].join("-");
}

function providerReturning(report: ReviewReport) {
  return {
    review: vi.fn().mockResolvedValue(report),
  };
}

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `ai-codeview-${randomUUID()}`), { recursive: true });
}
