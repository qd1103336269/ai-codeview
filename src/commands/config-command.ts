import { loadConfig } from "../config/load-config.js";

export interface ConfigCommandOptions {
  cwd?: string;
}

export async function runConfigCommand(options: ConfigCommandOptions = {}): Promise<string> {
  const config = await loadConfig({ cwd: options.cwd });
  return JSON.stringify(config, null, 2);
}
