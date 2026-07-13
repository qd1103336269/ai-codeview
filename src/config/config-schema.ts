import { z } from "zod";

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof severitySchema>;

export const outputFormatSchema = z.enum(["text", "markdown", "json"]);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

export const reportLanguageSchema = z.enum(["zh-CN", "en-US"]);
export type ReportLanguage = z.infer<typeof reportLanguageSchema>;

export const aiCodeviewConfigSchema = z
  .object({
    provider: z.literal("deepseek").default("deepseek"),
    model: z.enum(["deepseek-v4-pro", "deepseek-v4-flash"]).default("deepseek-v4-pro"),
    baseUrl: z.string().url().default("https://api.deepseek.com"),
    apiKeyEnv: z.string().min(1).default("DEEPSEEK_API_KEY"),
    thinking: z.boolean().default(true),
    reasoningEffort: z.enum(["high", "max"]).default("high"),
    timeoutMs: z.number().int().positive().default(60_000),
    maxRetries: z.number().int().nonnegative().default(2),
    reportLanguage: reportLanguageSchema.default("zh-CN"),
    failOn: severitySchema.default("high"),
    confidenceFloor: z.enum(["high", "medium", "low"]).default("medium"),
    review: z
      .object({
        security: z.boolean().default(true),
        bugs: z.boolean().default(true),
        quality: z.boolean().default(true),
        tests: z.boolean().default(true),
        learningNotes: z.boolean().default(true),
        continueOnError: z.boolean().default(true),
      })
      .default({
        security: true,
        bugs: true,
        quality: true,
        tests: true,
        learningNotes: true,
        continueOnError: true,
      }),
    security: z
      .object({
        allowSecrets: z.boolean().default(false),
      })
      .default({
        allowSecrets: false,
      }),
    input: z
      .object({
        maxFileBytes: z.number().int().positive().default(1_048_576),
        allowExternalPath: z.boolean().default(false),
      })
      .default({
        maxFileBytes: 1_048_576,
        allowExternalPath: false,
      }),
    ignore: z
      .array(z.string())
      .default([
        "pnpm-lock.yaml",
        "package-lock.json",
        "dist/**",
        "build/**",
        "*.min.js",
        "node_modules/**",
        ".git/**",
      ]),
    output: z
      .object({
        format: outputFormatSchema.default("markdown"),
        file: z.string().nullable().default(null),
      })
      .default({
        format: "markdown",
        file: null,
      }),
  })
  .strict();

export type AiCodeviewConfig = z.infer<typeof aiCodeviewConfigSchema>;
