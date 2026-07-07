import { cosmiconfig } from "cosmiconfig";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import {
  aiCodeviewConfigSchema,
  type AiCodeviewConfig,
  type OutputFormat,
  type Severity,
} from "./config-schema.js";

export interface CliConfigOverrides {
  failOn?: Severity;
  format?: OutputFormat;
  output?: string | null;
  allowSecrets?: boolean;
}

export interface LoadConfigInput {
  cwd?: string;
  overrides?: CliConfigOverrides;
}

export function loadConfigFromObject(value: unknown): AiCodeviewConfig {
  try {
    return aiCodeviewConfigSchema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError({
        code: "INVALID_CONFIG",
        message: `Invalid configuration: ${error.issues[0]?.path.join(".") || "root"}`,
        exitCode: 2,
        recoverable: false,
        details: error.issues,
      });
    }
    throw error;
  }
}

export function resolveConfig(value: unknown, overrides: CliConfigOverrides = {}): AiCodeviewConfig {
  const config = loadConfigFromObject(value);

  return loadConfigFromObject({
    ...config,
    failOn: overrides.failOn ?? config.failOn,
    security: {
      ...config.security,
      allowSecrets: overrides.allowSecrets ?? config.security.allowSecrets,
    },
    output: {
      ...config.output,
      format: overrides.format ?? config.output.format,
      file: overrides.output !== undefined ? overrides.output : config.output.file,
    },
  });
}

export async function loadConfig(input: LoadConfigInput = {}): Promise<AiCodeviewConfig> {
  const explorer = cosmiconfig("ai-codeview", {
    searchPlaces: [".ai-codeview.json", ".ai-codeview.yaml", ".ai-codeview.yml"],
  });
  const result = await explorer.search(input.cwd);

  return resolveConfig(result?.config ?? {}, input.overrides);
}
