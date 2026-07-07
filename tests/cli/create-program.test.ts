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
