import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { runInitCommand } from "../../src/commands/init-command.js";

describe("runInitCommand", () => {
  test("writes .ai-codeview.json with default config", async () => {
    const cwd = await makeTempDir();

    const result = await runInitCommand({ cwd });

    const configPath = join(cwd, ".ai-codeview.json");
    const written = JSON.parse(await readFile(configPath, "utf8"));
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("配置文件已写入");
    expect(written.provider).toBe("deepseek");
    expect(written.reportLanguage).toBe("zh-CN");
    expect(written.security.allowSecrets).toBe(false);
    expect(written.output.format).toBe("markdown");
    expect(written.output.file).toBeNull();
  });

  test("does not overwrite an existing config by default", async () => {
    const cwd = await makeTempDir();
    const configPath = join(cwd, ".ai-codeview.json");
    await writeFile(configPath, "{\"custom\":true}", "utf8");

    const result = await runInitCommand({ cwd });

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("配置文件已存在");
    expect(await readFile(configPath, "utf8")).toBe("{\"custom\":true}");
  });

  test("overwrites an existing config when force is true", async () => {
    const cwd = await makeTempDir();
    const configPath = join(cwd, ".ai-codeview.json");
    await writeFile(configPath, "{\"custom\":true}", "utf8");

    const result = await runInitCommand({ cwd, force: true });

    const written = JSON.parse(await readFile(configPath, "utf8"));
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("配置文件已写入");
    expect(written.provider).toBe("deepseek");
  });
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `ai-codeview-${randomUUID()}`), { recursive: true });
}
