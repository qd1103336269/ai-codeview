import { createRequire } from "node:module";
import { Chalk } from "chalk";
import { Command, CommanderError, Option } from "commander";
import { runConfigCommand as defaultRunConfigCommand } from "../commands/config-command.js";
import { runDoctorCommand as defaultRunDoctorCommand } from "../commands/doctor-command.js";
import { runInitCommand as defaultRunInitCommand } from "../commands/init-command.js";
import { runPushCommand as defaultRunPushCommand } from "../commands/push-command.js";
import { runReviewCommand as defaultRunReviewCommand } from "../commands/review-command.js";
import type { OutputFormat, Severity } from "../config/config-schema.js";
import { AppError, isAppError } from "../errors/app-error.js";

const require = createRequire(import.meta.url);
const pkgVersion = (require("../../package.json") as { version: string }).version;

export interface CreateProgramDeps {
  runReviewCommand?: typeof defaultRunReviewCommand;
  runInitCommand?: typeof defaultRunInitCommand;
  runConfigCommand?: typeof defaultRunConfigCommand;
  runPushCommand?: typeof defaultRunPushCommand;
  runDoctorCommand?: typeof defaultRunDoctorCommand;
}

interface ReviewCliOptions {
  staged?: boolean;
  base?: string;
  path?: string[];
  changed?: boolean;
  summary?: boolean;
  failOn?: Severity;
  format?: OutputFormat;
  output?: string;
  stdoutOnly?: boolean;
  color?: boolean;
  allowSecrets?: boolean;
  allowExternalPath?: boolean;
  fix?: boolean;
}

interface InitCliOptions {
  force?: boolean;
}

interface PushCliOptions {
  nonInteractive?: boolean;
  dryRun?: boolean;
  push?: boolean;
  message?: string;
  force?: boolean;
}

const progressChalk = new Chalk({ level: 1 });

export function createProgram(deps: CreateProgramDeps = {}): Command {
  const runReviewCommand = deps.runReviewCommand ?? defaultRunReviewCommand;
  const runInitCommand = deps.runInitCommand ?? defaultRunInitCommand;
  const runConfigCommand = deps.runConfigCommand ?? defaultRunConfigCommand;
  const runPushCommand = deps.runPushCommand ?? defaultRunPushCommand;
  const runDoctorCommand = deps.runDoctorCommand ?? defaultRunDoctorCommand;
  const program = new Command();

  program.exitOverride();

  program
    .name("ai-codeview")
    .description("命令行原生的 AI 代码审查助手，数据直接发送给你配置的 AI provider。")
    .configureHelp({
      styleTitle: (title) => {
        if (title === "Usage:") return "用法：";
        if (title === "Options:") return "选项：";
        if (title === "Commands:") return "命令：";
        if (title === "Arguments:") return "参数：";
        return title;
      },
    })
    .helpOption("-h, --help", "显示命令帮助")
    .helpCommand("help [command]", "显示命令帮助")
    .version(pkgVersion, "-V, --version", "显示版本号");

  program
    .command("review")
    .description("审查当前 Git 变更")
    .option("--staged", "只审查暂存区变更")
    .option("--changed", "审查 staged + unstaged 的全部本地变更")
    .option("--base <branch>", "审查当前分支相对 base 分支的变更")
    .option("--path <path>", "审查指定路径的文件或目录，支持相对路径和绝对路径", collectPathOption, [])
    .option("--summary", "只输出风险摘要和 finding 列表")
    .addOption(new Option("--fail-on <severity>", "当 finding 达到指定严重等级时返回失败退出码").choices(["critical", "high", "medium", "low"]))
    .addOption(new Option("--format <format>", "输出格式").choices(["text", "markdown", "json"]))
    .option("--output <file>", "把报告写入文件")
    .option("--stdout-only", "强制将报告输出到 stdout，忽略配置文件中的 output.file")
    .option("--color", "强制 text 输出使用 ANSI 颜色")
    .option("--no-color", "禁用 text 输出中的 ANSI 颜色")
    .option("--allow-secrets", "允许把包含疑似密钥的 diff 发送给 provider")
    .option("--allow-external-path", "允许审查工作目录外的绝对路径")
    .option("--fix", "对可修复的 finding 交互式应用 AI 生成的 patch")
    .action(async (options: ReviewCliOptions) => {
      const reviewOptions: Parameters<typeof runReviewCommand>[0] = {
        staged: options.staged,
        base: options.base,
        path: options.path?.length ? options.path : undefined,
        changed: options.changed,
        summary: options.summary,
        failOn: options.failOn,
        format: options.format,
        output: options.output,
        color: options.color,
        allowSecrets: options.allowSecrets,
        ...(options.stdoutOnly ? { noOutputFile: true } : {}),
        ...(options.allowExternalPath ? { allowExternalPath: true } : {}),
        ...(options.fix ? { fix: true } : {}),
      };
      const result = await runReviewCommand(reviewOptions, {
        onProgress: (message) => {
          process.stderr.write(`${formatProgressMessage(message)}\n`);
        },
      });
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    });

  program
    .command("init")
    .description("生成本地配置文件")
    .option("--force", "覆盖已有 .ai-codeview.json")
    .action(async (options: InitCliOptions) => {
      const result = await runInitCommand({ force: options.force });
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    });

  program.command("config").description("打印最终生效配置").action(async () => {
    try {
      process.stdout.write(`${await runConfigCommand()}\n`);
    } catch (error) {
      emitTopLevelError(error);
    }
  });

  program
    .command("push")
    .description("审查已暂存代码后提交并推送")
    .option("--non-interactive", "禁用交互确认，适合脚本或 CI 环境")
    .option("--dry-run", "只执行审查和提交信息生成，不创建 commit，不执行 push")
    .option("--no-push", "创建 commit 后不执行 git push")
    .option("-m, --message <message>", "使用指定提交信息，跳过 AI 生成和确认")
    .option("--force", "跳过首次使用 push 的自动预演")
    .action(async (options: PushCliOptions) => {
      const pushOptions = {
        ...(options.nonInteractive ? { nonInteractive: true } : {}),
        ...(options.dryRun ? { dryRun: true } : {}),
        ...(options.push === false ? { noPush: true } : {}),
        ...(options.message !== undefined ? { message: options.message } : {}),
        ...(options.force ? { force: true } : {}),
      };
      const result = await runPushCommand(
        pushOptions,
        {
          isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
          onProgress: (message) => {
            process.stderr.write(`${formatProgressMessage(message)}\n`);
          },
        },
      );
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    });

  program.command("doctor").description("检查本地运行环境和配置").action(async () => {
    try {
      const result = await runDoctorCommand();
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    } catch (error) {
      emitTopLevelError(error);
    }
  });

  return program;
}

function emitTopLevelError(error: unknown): void {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
    return;
  }
  const appError = isAppError(error) ? error : new AppError({
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "工具运行时发生未知错误。",
    exitCode: 2,
    cause: error,
  });
  process.stderr.write(`${appError.message}\n`);
  process.exitCode = appError.exitCode;
}

function collectPathOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function formatProgressMessage(message: string): string {
  const rules: Array<{ keyword: string; emoji: string; color: (s: string) => string }> = [
    { keyword: "检查 Git 状态", emoji: "🔍", color: progressChalk.cyan },
    { keyword: "已暂存变更", emoji: "📥", color: progressChalk.cyan },
    { keyword: "达到阈值", emoji: "⚠️", color: progressChalk.yellow },
    { keyword: "提交信息", emoji: "🧠", color: progressChalk.magenta },
    { keyword: "Git commit", emoji: "📝", color: progressChalk.yellow },
    { keyword: "远程分支", emoji: "🚀", color: progressChalk.cyan },
    { keyword: "push 流程完成", emoji: "✅", color: progressChalk.green },
    { keyword: "开始", emoji: "🚀", color: progressChalk.cyan },
    { keyword: "DeepSeek", emoji: "🤖", color: progressChalk.magenta },
    { keyword: "完成", emoji: "✅", color: progressChalk.green },
    { keyword: "敏感信息", emoji: "🛡️", color: progressChalk.yellow },
    { keyword: "写入", emoji: "📝", color: progressChalk.yellow },
    { keyword: "配置", emoji: "⚙️", color: progressChalk.cyan },
    { keyword: "Git diff", emoji: "📥", color: progressChalk.cyan },
    { keyword: "解析", emoji: "🔍", color: progressChalk.cyan },
    { keyword: "过滤", emoji: "🔍", color: progressChalk.cyan },
    { keyword: "分块", emoji: "🔍", color: progressChalk.cyan },
  ];
  for (const rule of rules) {
    if (message.includes(rule.keyword)) {
      return rule.color(`${rule.emoji} ${message}`);
    }
  }
  return progressChalk.cyan(`• ${message}`);
}
