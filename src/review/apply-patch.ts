import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import parseDiff from "parse-diff";

export interface ApplyPatchResult {
  file: string;
  success: boolean;
  error?: string;
}

export async function applyPatch(
  relativeFilePath: string,
  patch: string,
  cwd: string,
): Promise<ApplyPatchResult> {
  const absolutePath = resolve(cwd, relativeFilePath);

  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch {
    return { file: relativeFilePath, success: false, error: "文件不存在或无法读取" };
  }

  const lines = content.split(/\r?\n/);
  const parsed = parseDiff(patch);

  if (parsed.length === 0) {
    return { file: relativeFilePath, success: false, error: "patch 解析失败，未找到有效 hunk" };
  }

  try {
    const newLines = applyHunks(lines, parsed);
    await writeFile(absolutePath, newLines.join("\n"), "utf8");
    return { file: relativeFilePath, success: true };
  } catch (error) {
    return {
      file: relativeFilePath,
      success: false,
      error: error instanceof Error ? error.message : "patch 应用失败",
    };
  }
}

function applyHunks(
  lines: string[],
  parsed: ReturnType<typeof parseDiff>,
): string[] {
  const result = [...lines];
  let lineOffset = 0;

  for (const file of parsed) {
    for (const chunk of file.chunks) {
      const newStart = chunk.newStart;
      const targetIndex = newStart - 1 + lineOffset;
      const changes = chunk.changes;
      let cursor = targetIndex;

      for (const change of changes) {
        if (change.type === "context") {
          cursor += 1;
          continue;
        }
        if (change.type === "add") {
          const content = change.content.slice(1);
          result.splice(cursor, 0, content);
          cursor += 1;
          lineOffset += 1;
        } else if (change.type === "del") {
          const content = change.content.slice(1);
          if (result[cursor] !== content) {
            throw new Error(`hunk 上下文不匹配：第 ${cursor + 1} 行期望 "${content}"，实际 "${result[cursor] ?? "<EOF>"}"`);
          }
          result.splice(cursor, 1);
          lineOffset -= 1;
        }
      }
    }
  }

  return result;
}
