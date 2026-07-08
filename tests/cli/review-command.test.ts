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
        recoverable: false,
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
        recoverable: false,
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
