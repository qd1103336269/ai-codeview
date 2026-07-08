import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { collectPathReviewFiles } from "../../src/input/path-input.js";

describe("collectPathReviewFiles", () => {
  test("rejects relative paths", async () => {
    await expect(collectPathReviewFiles({ paths: ["src/index.ts"], ignore: [] })).rejects.toMatchObject({
      code: "INVALID_PATH_INPUT",
      exitCode: 2,
    });
  });

  test("rejects missing absolute paths", async () => {
    const missing = resolve(tmpdir(), `missing-${randomUUID()}.ts`);

    await expect(collectPathReviewFiles({ paths: [missing], ignore: [] })).rejects.toMatchObject({
      code: "PATH_NOT_FOUND",
      exitCode: 2,
    });
  });

  test("reads one absolute file as reviewable pseudo diff", async () => {
    const root = await makeTempDir();
    const file = join(root, "src", "a.ts");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(file, "export const a = 1;\n", "utf8");

    const result = await collectPathReviewFiles({ paths: [file], ignore: [], cwd: root });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "src/a.ts",
      additions: 1,
      deletions: 0,
      binary: false,
    });
    expect(result[0]?.raw).toContain("文件内容审查");
    expect(result[0]?.raw).toContain("export const a = 1;");
  });

  test("recursively reads directories and applies ignore patterns", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(join(root, "dist", "bundle.js"), "const bundled = true;\n", "utf8");

    const result = await collectPathReviewFiles({
      paths: [join(root, "src"), join(root, "dist")],
      ignore: ["dist/**"],
      cwd: root,
    });

    expect(result.map((file) => file.path)).toEqual(["src/a.ts"]);
  });

  test("marks binary path files as non-reviewable", async () => {
    const root = await makeTempDir();
    const file = join(root, "image.bin");
    await writeFile(file, Buffer.from([0, 1, 2, 3, 0]));

    const result = await collectPathReviewFiles({ paths: [file], ignore: [], cwd: root });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "image.bin",
      additions: 0,
      deletions: 0,
      binary: true,
      raw: "",
      content: "",
    });
  });
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `ai-codeview-path-${randomUUID()}`), { recursive: true });
}
