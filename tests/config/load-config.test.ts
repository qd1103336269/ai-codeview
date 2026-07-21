import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { loadConfig, loadConfigFromObject, resolveConfig } from "../../src/config/load-config.js";

describe("config loading", () => {
  test("uses DeepSeek defaults", () => {
    const config = loadConfigFromObject({});

    expect(config.provider).toBe("deepseek");
    expect(config.model).toBe("deepseek-v4-pro");
    expect(config.baseUrl).toBe("https://api.deepseek.com");
    expect(config.failOn).toBe("high");
    expect(config.apiKeyEnv).toBe("DEEPSEEK_API_KEY");
    expect(config.reportLanguage).toBe("zh-CN");
    expect(config.review.security).toBe(true);
    expect(config.security.allowSecrets).toBe(false);
    expect(config.output.format).toBe("markdown");
    expect(config.output.file).toBeNull();
    expect(config.providerOptions).toEqual({});
  });

  test("rejects invalid severity threshold", () => {
    expect(() => loadConfigFromObject({ failOn: "urgent" })).toThrow("配置无效");
  });

  test("accepts providerOptions for DeepSeek thinking config", () => {
    const config = loadConfigFromObject({
      providerOptions: { thinking: false, reasoningEffort: "max" },
    });

    expect(config.providerOptions).toEqual({ thinking: false, reasoningEffort: "max" });
  });

  test("rejects unsupported provider", () => {
    expect(() => loadConfigFromObject({ provider: "claude" })).toThrow("配置无效");
  });

  test("accepts openai as provider", () => {
    const config = loadConfigFromObject({ provider: "openai", model: "gpt-4o" });

    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o");
  });

  test("accepts supported report languages", () => {
    expect(loadConfigFromObject({ reportLanguage: "en-US" }).reportLanguage).toBe("en-US");
    expect(loadConfigFromObject({ reportLanguage: "zh-CN" }).reportLanguage).toBe("zh-CN");
  });

  test("rejects unsupported report language values", () => {
    expect(() => loadConfigFromObject({ reportLanguage: "fr-FR" })).toThrow("配置无效");
  });

  test("CLI flags override object config", () => {
    const config = resolveConfig(
      { failOn: "medium", output: { format: "text" }, security: { allowSecrets: false } },
      { failOn: "critical", format: "json", allowSecrets: true },
    );

    expect(config.failOn).toBe("critical");
    expect(config.output.format).toBe("json");
    expect(config.security.allowSecrets).toBe(true);
  });

  test("loads .ai-codeview.json from cwd and merges defaults", async () => {
    const cwd = await makeTempDir();
    await writeFile(
      join(cwd, ".ai-codeview.json"),
      JSON.stringify({
        model: "deepseek-v4-flash",
        failOn: "medium",
        security: { allowSecrets: true },
        output: { format: "markdown" },
      }),
    );

    const config = await loadConfig({ cwd });

    expect(config.model).toBe("deepseek-v4-flash");
    expect(config.failOn).toBe("medium");
    expect(config.output.format).toBe("markdown");
    expect(config.output.file).toBeNull();
    expect(config.apiKeyEnv).toBe("DEEPSEEK_API_KEY");
    expect(config.security.allowSecrets).toBe(true);
  });

  test("CLI overrides take precedence over discovered config", async () => {
    const cwd = await makeTempDir();
    await writeFile(
      join(cwd, ".ai-codeview.json"),
      JSON.stringify({
        failOn: "medium",
        security: { allowSecrets: false },
        output: { format: "markdown", file: "review.md" },
      }),
    );

    const config = await loadConfig({
      cwd,
      overrides: { failOn: "critical", format: "json", output: "ci-report.json", allowSecrets: true },
    });

    expect(config.failOn).toBe("critical");
    expect(config.output.format).toBe("json");
    expect(config.output.file).toBe("ci-report.json");
    expect(config.security.allowSecrets).toBe(true);
  });

  test("rejects unknown top-level key as strict schema", () => {
    expect(() => loadConfigFromObject({ failon: "high" })).toThrow("配置无效");
  });

  test("lists all invalid fields in a single error", () => {
    let caught: unknown;
    try {
      loadConfigFromObject({ failOn: "urgent", baseUrl: "not-a-url", reportLanguage: "fr-FR" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "INVALID_CONFIG" });
    const message = (caught as { message: string }).message;
    expect(message).toContain("failOn");
    expect(message).toContain("baseUrl");
    expect(message).toContain("reportLanguage");
  });

  test("gives friendly error on corrupted JSON config file", async () => {
    const cwd = await makeTempDir();
    await writeFile(join(cwd, ".ai-codeview.json"), "{not json");

    await expect(loadConfig({ cwd })).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      exitCode: 2,
    });
  });

  test("does not leak secret-like value in zod issue details", () => {
    let caught: unknown;
    try {
      loadConfigFromObject({ failOn: "sk-1234567890abcdef1234567890abcdef" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "INVALID_CONFIG" });
    const message = (caught as { message: string }).message;
    expect(message).not.toContain("sk-1234567890abcdef1234567890abcdef");
    const details = (caught as { details: unknown }).details;
    const text = JSON.stringify(details);
    expect(text).not.toContain("sk-1234567890abcdef1234567890abcdef");
  });

  test("exposes runtime tuning defaults", () => {
    const config = loadConfigFromObject({});
    expect(config.timeoutMs).toBe(60_000);
    expect(config.maxRetries).toBe(2);
    expect(config.input.maxFileBytes).toBe(1_048_576);
    expect(config.input.allowExternalPath).toBe(false);
    expect(config.review.continueOnError).toBe(true);
  });

  test("default ignore list prunes node_modules and .git", () => {
    const config = loadConfigFromObject({});
    expect(config.ignore).toContain("node_modules/**");
    expect(config.ignore).toContain(".git/**");
  });
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `ai-codeview-${randomUUID()}`), { recursive: true });
}
