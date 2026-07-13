import { cosmiconfig } from "cosmiconfig";
import { ZodError, type ZodIssue } from "zod";
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
  noOutputFile?: boolean;
}

export interface LoadConfigInput {
  cwd?: string;
  overrides?: CliConfigOverrides;
}

const secretValuePattern = /(?:sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{24,})/;

function sanitizeIssue(issue: ZodIssue): ZodIssue {
  const received = (issue as unknown as { received?: unknown }).received;
  if (typeof received === "string" && secretValuePattern.test(received)) {
    return { ...issue, received: "<redacted>" } as ZodIssue;
  }
  return issue;
}

function formatIssues(issues: ZodIssue[]): string {
  const lines = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    const received = (issue as unknown as { received?: unknown }).received;
    const receivedHint =
      typeof received === "string" && received !== ""
        ? `，实际收到 ${secretValuePattern.test(received) ? "<redacted>" : JSON.stringify(received)}`
        : "";
    return `- ${path}：${issue.message}${receivedHint}`;
  });
  return `配置无效：\n${lines.join("\n")}`;
}

export function loadConfigFromObject(value: unknown): AiCodeviewConfig {
  try {
    return aiCodeviewConfigSchema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map(sanitizeIssue);
      throw new AppError({
        code: "INVALID_CONFIG",
        message: formatIssues(issues),
        exitCode: 2,
        recoverable: false,
        details: issues,
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
      file: overrides.noOutputFile
        ? null
        : overrides.output !== undefined
          ? overrides.output
          : config.output.file,
    },
  });
}

export async function loadConfig(input: LoadConfigInput = {}): Promise<AiCodeviewConfig> {
  const explorer = cosmiconfig("ai-codeview", {
    searchPlaces: [".ai-codeview.json", ".ai-codeview.yaml", ".ai-codeview.yml"],
  });

  let result;
  try {
    result = await explorer.search(input.cwd);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AppError({
      code: "INVALID_CONFIG",
      message: `配置文件解析失败：${reason}`,
      exitCode: 2,
      recoverable: false,
      cause: error,
    });
  }

  return resolveConfig(result?.config ?? {}, input.overrides);
}
