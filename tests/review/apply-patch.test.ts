import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { applyPatch } from "../../src/review/apply-patch.js";

describe("applyPatch", () => {
  test("applies single hunk patch successfully", async () => {
    const cwd = await makeTempDir();
    const file = join(cwd, "a.ts");
    await writeFile(file, "const a = 1;\nconst b = 2;\n", "utf8");

    const patch = [
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-const a = 1;",
      "+const a = 2;",
    ].join("\n");

    const result = await applyPatch("a.ts", patch, cwd);
    expect(result.success).toBe(true);
    expect(await readFile(file, "utf8")).toBe("const a = 2;\nconst b = 2;\n");
    await rm(cwd, { recursive: true, force: true });
  });

  test("returns error when file does not exist", async () => {
    const cwd = await makeTempDir();
    const result = await applyPatch("missing.ts", "--- a/missing.ts\n+++ b/missing.ts\n@@ -1,1 +1,1 @@\n-a\n+b", cwd);
    expect(result.success).toBe(false);
    expect(result.error).toContain("文件不存在");
    await rm(cwd, { recursive: true, force: true });
  });

  test("returns error when hunk context does not match", async () => {
    const cwd = await makeTempDir();
    const file = join(cwd, "a.ts");
    await writeFile(file, "const a = 999;\n", "utf8");

    const patch = [
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-const a = 1;",
      "+const a = 2;",
    ].join("\n");

    const result = await applyPatch("a.ts", patch, cwd);
    expect(result.success).toBe(false);
    expect(result.error).toContain("不匹配");
    await rm(cwd, { recursive: true, force: true });
  });

  test("returns error for empty patch", async () => {
    const cwd = await makeTempDir();
    const file = join(cwd, "a.ts");
    await writeFile(file, "const a = 1;\n", "utf8");

    const result = await applyPatch("a.ts", "no diff here", cwd);
    expect(result.success).toBe(false);
    expect(result.error).toContain("解析失败");
    await rm(cwd, { recursive: true, force: true });
  });
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `acv-patch-${randomUUID()}`), { recursive: true });
}
