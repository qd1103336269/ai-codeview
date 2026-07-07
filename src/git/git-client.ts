import { execa } from "execa";
import { AppError } from "../errors/app-error.js";

export type GitDiffMode = "working-tree" | "staged" | "base";

export type RunCommand = (file: string, args: string[]) => Promise<{ stdout: string }>;

export interface CollectGitDiffInput {
  mode: GitDiffMode;
  base?: string;
  run?: RunCommand;
}

const defaultRun: RunCommand = async (file, args) => {
  return execa(file, args);
};

export async function collectGitDiff(input: CollectGitDiffInput): Promise<string> {
  const run = input.run ?? defaultRun;
  const args = getDiffArgs(input);

  try {
    const result = await run("git", args);
    if (!result.stdout.trim()) {
      throw new AppError({
        code: "NO_DIFF",
        message: "没有发现可审查的 diff。",
        exitCode: 0,
        recoverable: false,
        suggestion: "请先创建或暂存代码变更，再运行 review。",
      });
    }
    return result.stdout;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError({
      code: "GIT_NOT_FOUND",
      message: "无法执行 Git 命令。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请安装 Git，并确认它已经加入 PATH。",
      details: error,
    });
  }
}

function getDiffArgs(input: CollectGitDiffInput): string[] {
  if (input.mode === "staged") {
    return ["diff", "--staged"];
  }
  if (input.mode === "base") {
    if (!input.base?.trim()) {
      throw new AppError({
        code: "INVALID_CONFIG",
        message: "base diff 模式缺少 base 分支。",
        exitCode: 2,
        recoverable: false,
      });
    }
    return ["diff", `${input.base}...HEAD`];
  }
  return ["diff"];
}
