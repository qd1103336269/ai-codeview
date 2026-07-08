import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import ignore from "ignore";
import type { ReviewFileDiff } from "../diff/parse-git-diff.js";
import { AppError } from "../errors/app-error.js";

export interface PathReviewFile extends ReviewFileDiff {
  content: string;
}

export interface CollectPathReviewFilesInput {
  paths: string[];
  ignore: string[];
  cwd?: string;
}

export async function collectPathReviewFiles(input: CollectPathReviewFilesInput): Promise<PathReviewFile[]> {
  const cwd = input.cwd ?? process.cwd();
  const matcher = ignore().add(input.ignore);
  const files: PathReviewFile[] = [];

  for (const path of input.paths) {
    if (!isAbsolute(path)) {
      throw new AppError({
        code: "INVALID_PATH_INPUT",
        message: `路径审查只接受绝对路径：${path}`,
        exitCode: 2,
        recoverable: false,
        suggestion: "请传入完整绝对路径，例如 E:\\code\\demo\\src\\index.ts。",
      });
    }

    const pathStat = await safeStat(path);
    if (!pathStat) {
      throw new AppError({
        code: "PATH_NOT_FOUND",
        message: `路径不存在：${path}`,
        exitCode: 2,
        recoverable: false,
      });
    }

    const absoluteFiles = pathStat.isDirectory() ? await listFiles(path) : [path];
    for (const absoluteFile of absoluteFiles) {
      const reviewPath = toReviewPath(cwd, absoluteFile);
      if (matcher.ignores(reviewPath)) {
        continue;
      }

      const buffer = await readFile(absoluteFile);
      if (isBinaryBuffer(buffer)) {
        files.push({
          path: reviewPath,
          additions: 0,
          deletions: 0,
          raw: "",
          binary: true,
          content: "",
        });
        continue;
      }

      const content = buffer.toString("utf8");
      files.push({
        path: reviewPath,
        additions: content.split(/\r?\n/).filter(Boolean).length,
        deletions: 0,
        raw: toPseudoDiff(reviewPath, content),
        binary: false,
        content,
      });
    }
  }

  return files;
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = `${root}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function toReviewPath(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).replace(/\\/g, "/") || absolutePath.replace(/\\/g, "/");
}

function toPseudoDiff(path: string, content: string): string {
  return [`文件内容审查：${path}`, "```", content, "```"].join("\n");
}
