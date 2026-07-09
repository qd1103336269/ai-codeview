import { execa } from "execa";
import { loadConfig } from "../config/load-config.js";
import type { RunCommand } from "../git/git-client.js";
import type { CommandResult } from "./review-command.js";

export interface DoctorCommandDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  run?: RunCommand;
  nodeVersion?: string;
}

interface DoctorCheck {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

const defaultRun: RunCommand = async (file, args) => {
  return execa(file, args);
};

export async function runDoctorCommand(deps: DoctorCommandDeps = {}): Promise<CommandResult> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const run = deps.run ?? defaultRun;
  const checks: DoctorCheck[] = [];

  const nodeVersion = deps.nodeVersion ?? process.versions.node;
  checks.push({
    label: "Node.js",
    status: isNodeVersionSupported(nodeVersion) ? "pass" : "fail",
    detail: `当前版本 ${nodeVersion}，要求 >= 20`,
  });

  checks.push(await checkGit(run));
  checks.push(await checkGitRepository(run));

  const configResult = await checkConfig(cwd);
  checks.push(configResult.check);
  if (configResult.apiKeyEnv) {
    checks.push({
      label: "DeepSeek API Key",
      status: env[configResult.apiKeyEnv] ? "pass" : "fail",
      detail: env[configResult.apiKeyEnv]
        ? `已设置 ${configResult.apiKeyEnv}`
        : `未设置 ${configResult.apiKeyEnv}`,
    });
  }

  checks.push(await checkGitRemote(run));

  const output = renderDoctorOutput(checks);
  return {
    exitCode: checks.some((check) => check.status === "fail") ? 2 : 0,
    output,
  };
}

async function checkGit(run: RunCommand): Promise<DoctorCheck> {
  try {
    const result = await run("git", ["--version"]);
    return { label: "Git", status: "pass", detail: result.stdout.trim() || "可用" };
  } catch {
    return { label: "Git", status: "fail", detail: "无法执行 git --version，请安装 Git 并加入 PATH" };
  }
}

async function checkGitRepository(run: RunCommand): Promise<DoctorCheck> {
  try {
    const result = await run("git", ["rev-parse", "--is-inside-work-tree"]);
    return {
      label: "Git 仓库",
      status: result.stdout.trim() === "true" ? "pass" : "fail",
      detail: result.stdout.trim() === "true" ? "当前目录在 Git 仓库内" : "当前目录不在 Git 仓库内",
    };
  } catch {
    return { label: "Git 仓库", status: "fail", detail: "当前目录不在 Git 仓库内，或 Git 状态不可读" };
  }
}

async function checkGitRemote(run: RunCommand): Promise<DoctorCheck> {
  try {
    const result = await run("git", ["remote", "get-url", "origin"]);
    return { label: "Git remote", status: "pass", detail: result.stdout.trim() || "origin 已配置" };
  } catch {
    return {
      label: "Git remote",
      status: "warn",
      detail: "未检测到 origin remote；review 可用，push 前需要配置远程仓库",
    };
  }
}

async function checkConfig(cwd: string): Promise<{ check: DoctorCheck; apiKeyEnv?: string }> {
  try {
    const config = await loadConfig({ cwd });
    return {
      check: { label: "配置文件", status: "pass", detail: `provider=${config.provider}, model=${config.model}` },
      apiKeyEnv: config.apiKeyEnv,
    };
  } catch {
    return {
      check: { label: "配置文件", status: "fail", detail: "配置加载失败，请检查 .ai-codeview.json/yaml" },
    };
  }
}

function isNodeVersionSupported(version: string): boolean {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= 20;
}

function renderDoctorOutput(checks: DoctorCheck[]): string {
  return [
    "AI Codeview doctor",
    "",
    ...checks.map((check) => `${getStatusIcon(check.status)} ${check.label}: ${check.detail}`),
  ].join("\n");
}

function getStatusIcon(status: DoctorCheck["status"]): string {
  if (status === "pass") return "✓";
  if (status === "warn") return "!";
  return "✗";
}
