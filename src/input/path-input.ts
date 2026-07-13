import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
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
  allowExternalPath?: boolean;
  maxFileBytes?: number;
}

const DEFAULT_MAX_FILE_BYTES = 1_048_576;
const ALWAYS_SKIP_DIRS = new Set([".git"]);

export async function collectPathReviewFiles(input: CollectPathReviewFilesInput): Promise<PathReviewFile[]> {
  const cwd = input.cwd ?? process.cwd();
  const matcher = ignore().add(input.ignore);
  const allowExternalPath = input.allowExternalPath ?? false;
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const files: PathReviewFile[] = [];

  for (const path of input.paths) {
    assertNotUncPath(path);
    const absolutePath = isAbsolute(path) ? path : resolve(cwd, path);
    assertWithinCwd(cwd, absolutePath, allowExternalPath, path);

    const pathStat = await safeStat(absolutePath);
    if (!pathStat) {
      throw new AppError({
        code: "PATH_NOT_FOUND",
        message: `路径不存在：${path}`,
        exitCode: 2,
        recoverable: false,
      });
    }

    const absoluteFiles = pathStat.isDirectory()
      ? await listFiles(absolutePath, { matcher, rootCwd: cwd })
      : [absolutePath];

    for (const absoluteFile of absoluteFiles) {
      const reviewPath = toReviewPath(cwd, absoluteFile);
      const isExternal = reviewPath.startsWith("..") || isAbsolute(reviewPath);
      if (!isExternal && matcher.ignores(reviewPath)) {
        continue;
      }

      const fileStat = await safeStat(absoluteFile);
      if (!fileStat) {
        continue;
      }
      if (fileStat.size > maxFileBytes) {
        files.push({
          path: reviewPath,
          additions: 0,
          deletions: 0,
          raw: "",
          binary: true,
          noContentChange: false,
          content: "",
        });
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
          noContentChange: false,
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
        noContentChange: false,
        content,
      });
    }
  }

  return files;
}

function assertNotUncPath(path: string): void {
  if (path.startsWith("\\\\") || path.startsWith("//")) {
    throw new AppError({
      code: "PATH_OUTSIDE_CWD",
      message: `不允许使用 UNC 路径：${path}`,
      exitCode: 2,
      recoverable: false,
      suggestion: "请使用相对路径或在当前工作目录内的绝对路径。",
    });
  }
}

function assertWithinCwd(cwd: string, absolutePath: string, allowExternal: boolean, original: string): void {
  if (allowExternal) {
    return;
  }
  const rel = relative(cwd, absolutePath);
  const outside = rel.startsWith("..") || isAbsolute(rel);
  if (outside) {
    throw new AppError({
      code: "PATH_OUTSIDE_CWD",
      message: `路径超出当前工作目录：${original}`,
      exitCode: 2,
      recoverable: false,
      suggestion: "在当前工作目录内指定路径；如需审查外部路径，请使用 --allow-external-path。",
    });
  }
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

interface ListFilesContext {
  matcher: ReturnType<typeof ignore>;
  rootCwd: string;
}

async function listFiles(root: string, context: ListFilesContext): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = `${root}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const relDir = toReviewPath(context.rootCwd, fullPath);
      if (!isAbsolute(relDir) && !relDir.startsWith("..")) {
        if (context.matcher.ignores(`${relDir}/`) || context.matcher.ignores(relDir)) {
          continue;
        }
      }
      files.push(...(await listFiles(fullPath, context)));
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
