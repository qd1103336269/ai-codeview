import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { defaultConfig } from "../config/default-config.js";

export interface InitCommandOptions {
  cwd?: string;
  force?: boolean;
}

export interface InitCommandResult {
  exitCode: 0 | 2;
  output: string;
}

export async function runInitCommand(options: InitCommandOptions = {}): Promise<InitCommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = resolve(cwd, ".ai-codeview.json");

  if (!options.force && (await fileExists(configPath))) {
    return {
      exitCode: 2,
      output: `配置文件已存在：${configPath}。如需覆盖，请使用 --force。`,
    };
  }

  await writeFile(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");

  return {
    exitCode: 0,
    output: `配置文件已写入：${configPath}。`,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
