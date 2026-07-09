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
    expect(config.thinking).toBe(true);
    expect(config.reasoningEffort).toBe("high");
    expect(config.reportLanguage).toBe("zh-CN");
    expect(config.review.security).toBe(true);
    expect(config.security.allowSecrets).toBe(false);
    expect(config.output.format).toBe("markdown");
    expect(config.output.file).toBeNull();
  });

  test("rejects invalid severity threshold", () => {
    expect(() => loadConfigFromObject({ failOn: "urgent" })).toThrow("Invalid configuration");
  });

  test("accepts official DeepSeek max reasoning effort", () => {
    const config = loadConfigFromObject({ reasoningEffort: "max" });

    expect(config.reasoningEffort).toBe("max");
  });

  test("rejects unsupported DeepSeek reasoning effort values", () => {
    expect(() => loadConfigFromObject({ reasoningEffort: "medium" })).toThrow("Invalid configuration");
  });

  test("accepts supported report languages", () => {
    expect(loadConfigFromObject({ reportLanguage: "en-US" }).reportLanguage).toBe("en-US");
    expect(loadConfigFromObject({ reportLanguage: "zh-CN" }).reportLanguage).toBe("zh-CN");
  });

  test("rejects unsupported report language values", () => {
    expect(() => loadConfigFromObject({ reportLanguage: "fr-FR" })).toThrow("Invalid configuration");
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
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `ai-codeview-${randomUUID()}`), { recursive: true });
}
