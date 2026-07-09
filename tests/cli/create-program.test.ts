import stripAnsi from "strip-ansi";
import { describe, expect, test, vi } from "vitest";
import { createProgram } from "../../src/cli/create-program.js";

describe("createProgram", () => {
  test("passes review flags to review command handler", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runReviewCommand = vi.fn().mockImplementation((_options, deps) => {
      deps.onProgress("开始进行代码 review...");
      return Promise.resolve({ exitCode: 0, output: "ok" });
    });
    const program = createProgram({ runReviewCommand });

    await program.parseAsync(
      [
        "review",
        "--base",
        "main",
        "--fail-on",
        "medium",
        "--format",
        "json",
        "--output",
        "review.json",
        "--color",
        "--allow-secrets",
      ],
      { from: "user" },
    );

    expect(runReviewCommand).toHaveBeenCalledWith({
      staged: undefined,
      base: "main",
      path: undefined,
      failOn: "medium",
      format: "json",
      output: "review.json",
      color: true,
      allowSecrets: true,
    }, expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(process.exitCode).toBe(0);
    write.mockRestore();
    stderrWrite.mockRestore();
  });

  test("writes emoji progress with foreground colors to stderr and final output to stdout", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runReviewCommand = vi.fn().mockImplementation((_options, deps) => {
      deps.onProgress("开始进行代码 review...");
      deps.onProgress("调用 DeepSeek 审查分块 1/1...");
      return Promise.resolve({ exitCode: 0, output: "AI 代码审查报告" });
    });
    const program = createProgram({ runReviewCommand });

    await program.parseAsync(["review"], { from: "user" });

    const firstProgress = stderrWrite.mock.calls[0]?.[0]?.toString() ?? "";
    const secondProgress = stderrWrite.mock.calls[1]?.[0]?.toString() ?? "";
    expect(firstProgress).toContain("\u001B[");
    expect(secondProgress).toContain("\u001B[");
    expect(firstProgress).not.toContain("\u001B[46m");
    expect(secondProgress).not.toContain("\u001B[46m");
    expect(stripAnsi(firstProgress)).toBe("🚀 开始进行代码 review...\n");
    expect(stripAnsi(secondProgress)).toBe("🤖 调用 DeepSeek 审查分块 1/1...\n");
    expect(stdoutWrite).toHaveBeenCalledWith("AI 代码审查报告\n");
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("passes repeated review --path values to review command handler", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runReviewCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
    const program = createProgram({ runReviewCommand });

    await program.parseAsync(
      [
        "review",
        "--path",
        "E:\\code\\demo\\src\\a.ts",
        "--path",
        "E:\\code\\demo\\src\\b.ts",
      ],
      { from: "user" },
    );

    expect(runReviewCommand).toHaveBeenCalledWith({
      staged: undefined,
      base: undefined,
      path: ["E:\\code\\demo\\src\\a.ts", "E:\\code\\demo\\src\\b.ts"],
      failOn: undefined,
      format: undefined,
      output: undefined,
      color: undefined,
      allowSecrets: undefined,
    }, expect.objectContaining({ onProgress: expect.any(Function) }));
    write.mockRestore();
    stderrWrite.mockRestore();
  });

  test("runs push command handler", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runPushCommand = vi.fn().mockImplementation((_options, deps) => {
      deps.onProgress("检查 Git 状态...");
      deps.onProgress("生成中文提交信息...");
      return Promise.resolve({ exitCode: 0, output: "提交和推送完成。" });
    });
    const program = createProgram({ runPushCommand });

    await program.parseAsync(["push"], { from: "user" });

    expect(runPushCommand).toHaveBeenCalledWith({}, expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(stripAnsi(stderrWrite.mock.calls[0]?.[0]?.toString() ?? "")).toBe("🔍 检查 Git 状态...\n");
    expect(stripAnsi(stderrWrite.mock.calls[1]?.[0]?.toString() ?? "")).toBe("🧠 生成中文提交信息...\n");
    expect(stdoutWrite).toHaveBeenCalledWith("提交和推送完成。\n");
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("passes push --non-interactive to push command handler", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runPushCommand = vi.fn().mockResolvedValue({ exitCode: 2, output: "no staged diff" });
    const program = createProgram({ runPushCommand });

    await program.parseAsync(["push", "--non-interactive"], { from: "user" });

    expect(runPushCommand).toHaveBeenCalledWith(
      { nonInteractive: true },
      expect.objectContaining({ onProgress: expect.any(Function), isInteractive: expect.any(Boolean) }),
    );
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("passes init --force to init command handler", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const runInitCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "created" });
    const program = createProgram({ runInitCommand });

    await program.parseAsync(["init", "--force"], { from: "user" });

    expect(runInitCommand).toHaveBeenCalledWith({ force: true });
    expect(process.exitCode).toBe(0);
    write.mockRestore();
  });
});
