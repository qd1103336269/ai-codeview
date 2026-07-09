import { describe, expect, test, vi } from "vitest";
import { runDoctorCommand } from "../../src/commands/doctor-command.js";

describe("runDoctorCommand", () => {
  test("returns success when local environment checks pass", async () => {
    const run = vi.fn().mockImplementation(async (_file: string, args: string[]) => {
      if (args.join(" ") === "--version") return { stdout: "git version 2.50.0" };
      if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true" };
      if (args.join(" ") === "remote get-url origin") return { stdout: "https://example.com/repo.git" };
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });

    const result = await runDoctorCommand({
      env: { DEEPSEEK_API_KEY: "set" },
      nodeVersion: "20.0.0",
      run,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("✓ Node.js");
    expect(result.output).toContain("✓ Git");
    expect(result.output).toContain("✓ DeepSeek API Key");
  });

  test("returns failure when required environment checks fail", async () => {
    const run = vi.fn().mockImplementation(async (_file: string, args: string[]) => {
      if (args.join(" ") === "--version") return { stdout: "git version 2.50.0" };
      if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true" };
      if (args.join(" ") === "remote get-url origin") throw new Error("missing remote");
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });

    const result = await runDoctorCommand({
      env: {},
      nodeVersion: "18.0.0",
      run,
    });

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("✗ Node.js");
    expect(result.output).toContain("✗ DeepSeek API Key");
    expect(result.output).toContain("! Git remote");
  });

  test("does not fail when only push-related remote check is missing", async () => {
    const run = vi.fn().mockImplementation(async (_file: string, args: string[]) => {
      if (args.join(" ") === "--version") return { stdout: "git version 2.50.0" };
      if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true" };
      if (args.join(" ") === "remote get-url origin") throw new Error("missing remote");
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });

    const result = await runDoctorCommand({
      env: { DEEPSEEK_API_KEY: "set" },
      nodeVersion: "20.0.0",
      run,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("! Git remote");
  });
});
