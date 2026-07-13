import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { collectPathReviewFiles } from "../../src/input/path-input.js";

describe("collectPathReviewFiles", () => {
  test("resolves relative paths from cwd", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");

    const result = await collectPathReviewFiles({ paths: ["src/index.ts"], ignore: [], cwd: root });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "src/index.ts",
      binary: false,
      content: "export const value = 1;\n",
    });
  });

  test("rejects missing absolute paths", async () => {
    const root = await makeTempDir();
    const missing = join(root, `missing-${randomUUID()}.ts`);

    await expect(collectPathReviewFiles({ paths: [missing], ignore: [], cwd: root })).rejects.toMatchObject({
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

  test("throws PATH_OUTSIDE_CWD when path points to cwd parent", async () => {
    const root = await makeTempDir();
    const sibling = await makeTempDir();
    const outside = resolve(sibling, "secret.txt");
    await writeFile(outside, "private", "utf8");

    await expect(
      collectPathReviewFiles({ paths: [outside], ignore: [], cwd: root }),
    ).rejects.toMatchObject({ code: "PATH_OUTSIDE_CWD", exitCode: 2 });
  });

  test("rejects UNC-style path", async () => {
    await expect(
      collectPathReviewFiles({ paths: ["\\\\server\\share\\file.txt"], ignore: [] }),
    ).rejects.toMatchObject({ code: "PATH_OUTSIDE_CWD" });
  });

  test("allows external path when allowExternalPath=true", async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    const file = join(outside, "external.ts");
    await writeFile(file, "export const z = 1;\n", "utf8");

    const result = await collectPathReviewFiles({
      paths: [file],
      ignore: [],
      cwd: root,
      allowExternalPath: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toContain("export const z = 1;");
  });

  test("skips file larger than maxFileBytes as binary", async () => {
    const root = await makeTempDir();
    const file = join(root, "big.log");
    await writeFile(file, "x".repeat(2000));

    const result = await collectPathReviewFiles({
      paths: [file],
      ignore: [],
      cwd: root,
      maxFileBytes: 1024,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.binary).toBe(true);
    expect(result[0]?.content).toBe("");
  });

  test("reads file equal to maxFileBytes", async () => {
    const root = await makeTempDir();
    const file = join(root, "ok.txt");
    await writeFile(file, "y".repeat(512));

    const result = await collectPathReviewFiles({
      paths: [file],
      ignore: [],
      cwd: root,
      maxFileBytes: 512,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.binary).toBe(false);
    expect(result[0]?.content?.length).toBe(512);
  });

  test("prunes ignored directories during recursion", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "node_modules", "dep"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "node_modules", "dep", "index.js"), "module.exports = 1;\n");
    await writeFile(join(root, "node_modules", "dep", "deep.js"), "module.exports = 2;\n");
    await writeFile(join(root, "src", "app.ts"), "export const a = 1;\n");

    const result = await collectPathReviewFiles({
      paths: [root],
      ignore: ["node_modules/**"],
      cwd: root,
    });

    expect(result.map((f) => f.path)).toEqual(["src/app.ts"]);
  });

  test("always skips .git directory even when ignore is empty", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n");

    const result = await collectPathReviewFiles({ paths: [root], ignore: [], cwd: root });

    expect(result.map((f) => f.path)).toEqual(["src/a.ts"]);
  });
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `ai-codeview-path-${randomUUID()}`), { recursive: true });
}
