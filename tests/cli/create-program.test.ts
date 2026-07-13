import stripAnsi from "strip-ansi";
import { describe, expect, test, vi } from "vitest";
import { createProgram } from "../../src/cli/create-program.js";
import { version as pkgVersion } from "../../package.json";

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
      changed: undefined,
      summary: undefined,
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
      changed: undefined,
      summary: undefined,
    }, expect.objectContaining({ onProgress: expect.any(Function) }));
    write.mockRestore();
    stderrWrite.mockRestore();
  });

  test("passes review --changed and --summary to review command handler", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runReviewCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "summary ok" });
    const program = createProgram({ runReviewCommand });

    await program.parseAsync(["review", "--changed", "--summary"], { from: "user" });

    expect(runReviewCommand).toHaveBeenCalledWith({
      staged: undefined,
      base: undefined,
      path: undefined,
      failOn: undefined,
      format: undefined,
      output: undefined,
      color: undefined,
      allowSecrets: undefined,
      changed: true,
      summary: true,
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

  test("passes push execution options to push command handler", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runPushCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "dry run ok" });
    const program = createProgram({ runPushCommand });

    await program.parseAsync(
      ["push", "--dry-run", "--no-push", "--message", "feat: 用户指定提交信息"],
      { from: "user" },
    );

    expect(runPushCommand).toHaveBeenCalledWith(
      {
        dryRun: true,
        noPush: true,
        message: "feat: 用户指定提交信息",
      },
      expect.objectContaining({ onProgress: expect.any(Function), isInteractive: expect.any(Boolean) }),
    );
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("passes empty push message to handler for validation", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runPushCommand = vi.fn().mockResolvedValue({ exitCode: 2, output: "提交信息不能为空。" });
    const program = createProgram({ runPushCommand });

    await program.parseAsync(["push", "--message", ""], { from: "user" });

    expect(runPushCommand).toHaveBeenCalledWith(
      { message: "" },
      expect.objectContaining({ onProgress: expect.any(Function), isInteractive: expect.any(Boolean) }),
    );
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("passes short push message option to handler", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runPushCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
    const program = createProgram({ runPushCommand });

    await program.parseAsync(["push", "-m", "feat: 短参数提交信息"], { from: "user" });

    expect(runPushCommand).toHaveBeenCalledWith(
      { message: "feat: 短参数提交信息" },
      expect.objectContaining({ onProgress: expect.any(Function), isInteractive: expect.any(Boolean) }),
    );
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("runs doctor command handler", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const runDoctorCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "doctor ok" });
    const program = createProgram({ runDoctorCommand });

    await program.parseAsync(["doctor"], { from: "user" });

    expect(runDoctorCommand).toHaveBeenCalledWith();
    expect(stdoutWrite).toHaveBeenCalledWith("doctor ok\n");
    stdoutWrite.mockRestore();
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

  test("rejects --fail-on with invalid value at CLI layer", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runReviewCommand = vi.fn();
    const program = createProgram({ runReviewCommand });

    await expect(program.parseAsync(["review", "--fail-on", "urgent"], { from: "user" })).rejects.toMatchObject({
      code: "commander.invalidArgument",
    });

    expect(runReviewCommand).not.toHaveBeenCalled();
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("rejects --format with invalid value at CLI layer", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runReviewCommand = vi.fn();
    const program = createProgram({ runReviewCommand });

    await expect(program.parseAsync(["review", "--format", "xml"], { from: "user" })).rejects.toMatchObject({
      code: "commander.invalidArgument",
    });

    expect(runReviewCommand).not.toHaveBeenCalled();
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  test("--version outputs package.json version", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const program = createProgram();

    await expect(program.parseAsync(["--version"], { from: "user" })).rejects.toMatchObject({
      code: "commander.version",
    });

    const output = stdoutWrite.mock.calls.map((c) => c[0]?.toString() ?? "").join("");
    expect(output.trim()).toBe(pkgVersion);
    stdoutWrite.mockRestore();
  });

  test("maps config command throw to exitCode 2", async () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const runConfigCommand = vi.fn().mockRejectedValue(new Error("boom"));
    const program = createProgram({ runConfigCommand });

    await program.parseAsync(["config"], { from: "user" });

    expect(process.exitCode).toBe(2);
    const stderrText = stderrWrite.mock.calls.map((c) => c[0]?.toString() ?? "").join("");
    expect(stderrText).toContain("boom");
    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
  });

  test("maps doctor command throw to exitCode 2", async () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const runDoctorCommand = vi.fn().mockRejectedValue(new Error("doctor failed"));
    const program = createProgram({ runDoctorCommand });

    await program.parseAsync(["doctor"], { from: "user" });

    expect(process.exitCode).toBe(2);
    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
  });
});
