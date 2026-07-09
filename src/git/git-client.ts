import { execa } from "execa";
import { AppError } from "../errors/app-error.js";

export type GitDiffMode = "working-tree" | "staged" | "base";

export type RunCommand = (file: string, args: string[]) => Promise<{ stdout: string }>;

export interface CollectGitDiffInput {
  mode: GitDiffMode;
  base?: string;
  run?: RunCommand;
}

export interface CommitStagedChangesInput {
  message: string;
  run?: RunCommand;
}

export interface HasUnstagedChangesInput {
  run?: RunCommand;
}

export interface StageAllChangesInput {
  run?: RunCommand;
}

export interface PushCurrentBranchInput {
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

export async function commitStagedChanges(input: CommitStagedChangesInput): Promise<void> {
  const run = input.run ?? defaultRun;

  try {
    await run("git", ["commit", "-m", input.message]);
  } catch (error) {
    throw new AppError({
      code: "GIT_COMMIT_FAILED",
      message: "Git commit 执行失败。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请检查暂存区、提交钩子和 Git 配置后重试。",
      details: error,
    });
  }
}

export async function hasUnstagedChanges(input: HasUnstagedChangesInput = {}): Promise<boolean> {
  const run = input.run ?? defaultRun;

  try {
    const result = await run("git", ["status", "--porcelain"]);
    return result.stdout.trim().length > 0;
  } catch (error) {
    if (isCommandNotFound(error)) {
      throw new AppError({
        code: "GIT_NOT_FOUND",
        message: "无法执行 Git 命令。",
        exitCode: 2,
        recoverable: false,
        suggestion: "请安装 Git，并确认它已经加入 PATH。",
        details: error,
      });
    }

    throw new AppError({
      code: "GIT_STATUS_FAILED",
      message: "Git status 执行失败。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请确认当前目录是 Git 仓库，并检查工作区文件权限后重试。",
      details: error,
    });
  }
}

export async function stageAllChanges(input: StageAllChangesInput = {}): Promise<void> {
  const run = input.run ?? defaultRun;

  try {
    await run("git", ["add", "-A"]);
  } catch (error) {
    throw new AppError({
      code: "GIT_ADD_FAILED",
      message: "Git add 执行失败。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请检查工作区文件状态、权限和 .gitignore 配置后重试。",
      details: error,
    });
  }
}

export async function pushCurrentBranch(input: PushCurrentBranchInput = {}): Promise<void> {
  const run = input.run ?? defaultRun;

  try {
    await run("git", ["push"]);
  } catch (error) {
    throw new AppError({
      code: "GIT_PUSH_FAILED",
      message: "Git push 执行失败。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请检查远程仓库、网络、认证和 upstream 配置后重试。",
      details: error,
    });
  }
}

function isCommandNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  const causeCode = (error as { cause?: { code?: unknown } }).cause?.code;
  return code === "ENOENT" || causeCode === "ENOENT";
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
