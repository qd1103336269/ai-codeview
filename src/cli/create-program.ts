import { Chalk } from "chalk";
import { Command } from "commander";
import { runConfigCommand as defaultRunConfigCommand } from "../commands/config-command.js";
import { runInitCommand as defaultRunInitCommand } from "../commands/init-command.js";
import { runPushCommand as defaultRunPushCommand } from "../commands/push-command.js";
import { runReviewCommand as defaultRunReviewCommand } from "../commands/review-command.js";
import type { OutputFormat, Severity } from "../config/config-schema.js";

export interface CreateProgramDeps {
  runReviewCommand?: typeof defaultRunReviewCommand;
  runInitCommand?: typeof defaultRunInitCommand;
  runConfigCommand?: typeof defaultRunConfigCommand;
  runPushCommand?: typeof defaultRunPushCommand;
}

interface ReviewCliOptions {
  staged?: boolean;
  base?: string;
  path?: string[];
  failOn?: Severity;
  format?: OutputFormat;
  output?: string;
  color?: boolean;
  allowSecrets?: boolean;
}

interface InitCliOptions {
  force?: boolean;
}

interface PushCliOptions {
  nonInteractive?: boolean;
}

const progressChalk = new Chalk({ level: 1 });

export function createProgram(deps: CreateProgramDeps = {}): Command {
  const runReviewCommand = deps.runReviewCommand ?? defaultRunReviewCommand;
  const runInitCommand = deps.runInitCommand ?? defaultRunInitCommand;
  const runConfigCommand = deps.runConfigCommand ?? defaultRunConfigCommand;
  const runPushCommand = deps.runPushCommand ?? defaultRunPushCommand;
  const program = new Command();

  program
    .name("ai-codeview")
    .description("本地优先的 AI 代码审查 CLI，使用 DeepSeek 提供审查能力。")
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
    .version("0.2.0", "-V, --version", "显示版本号");

  program
    .command("review")
    .description("审查当前 Git 变更")
    .option("--staged", "只审查暂存区变更")
    .option("--base <branch>", "审查当前分支相对 base 分支的变更")
    .option("--path <path>", "审查指定绝对路径的文件或目录", collectPathOption, [])
    .option("--fail-on <severity>", "当 finding 达到指定严重等级时返回失败退出码")
    .option("--format <format>", "输出格式")
    .option("--output <file>", "把报告写入文件")
    .option("--color", "强制 text 输出使用 ANSI 颜色")
    .option("--no-color", "禁用 text 输出中的 ANSI 颜色")
    .option("--allow-secrets", "允许把包含疑似密钥的 diff 发送给 provider")
    .action(async (options: ReviewCliOptions) => {
      const result = await runReviewCommand(
        {
          staged: options.staged,
          base: options.base,
          path: options.path?.length ? options.path : undefined,
          failOn: options.failOn,
          format: options.format,
          output: options.output,
          color: options.color,
          allowSecrets: options.allowSecrets,
        },
        {
          onProgress: (message) => {
            process.stderr.write(`${formatProgressMessage(message)}\n`);
          },
        },
      );
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
    process.stdout.write(`${await runConfigCommand()}\n`);
  });

  program
    .command("push")
    .description("审查已暂存代码后提交并推送")
    .option("--non-interactive", "禁用交互确认，适合脚本或 CI 环境")
    .action(async (options: PushCliOptions) => {
      const pushOptions = options.nonInteractive ? { nonInteractive: true } : {};
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

  return program;
}

function collectPathOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function formatProgressMessage(message: string): string {
  if (message.includes("检查 Git 状态")) {
    return progressChalk.cyan(`🔍 ${message}`);
  }
  if (message.includes("已暂存变更")) {
    return progressChalk.cyan(`📥 ${message}`);
  }
  if (message.includes("达到阈值")) {
    return progressChalk.yellow(`⚠️ ${message}`);
  }
  if (message.includes("提交信息")) {
    return progressChalk.magenta(`🧠 ${message}`);
  }
  if (message.includes("Git commit")) {
    return progressChalk.yellow(`📝 ${message}`);
  }
  if (message.includes("远程分支")) {
    return progressChalk.cyan(`🚀 ${message}`);
  }
  if (message.includes("push 流程完成")) {
    return progressChalk.green(`✅ ${message}`);
  }
  if (message.includes("开始")) {
    return progressChalk.cyan(`🚀 ${message}`);
  }
  if (message.includes("DeepSeek")) {
    return progressChalk.magenta(`🤖 ${message}`);
  }
  if (message.includes("完成")) {
    return progressChalk.green(`✅ ${message}`);
  }
  if (message.includes("敏感信息")) {
    return progressChalk.yellow(`🛡️ ${message}`);
  }
  if (message.includes("写入")) {
    return progressChalk.yellow(`📝 ${message}`);
  }
  if (message.includes("配置")) {
    return progressChalk.cyan(`⚙️ ${message}`);
  }
  if (message.includes("Git diff")) {
    return progressChalk.cyan(`📥 ${message}`);
  }
  if (message.includes("解析") || message.includes("过滤") || message.includes("分块")) {
    return progressChalk.cyan(`🔍 ${message}`);
  }
  return progressChalk.cyan(`• ${message}`);
}
