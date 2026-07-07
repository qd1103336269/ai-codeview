import { z } from "zod";

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof severitySchema>;

export const outputFormatSchema = z.enum(["text", "markdown", "json"]);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

export const aiCodeviewConfigSchema = z.object({
  provider: z.literal("deepseek").default("deepseek"),
  model: z
    .enum(["deepseek-v4-pro", "deepseek-v4-flash"])
    .default("deepseek-v4-pro"),
  baseUrl: z.string().url().default("https://api.deepseek.com"),
  apiKeyEnv: z.string().min(1).default("DEEPSEEK_API_KEY"),
  thinking: z.boolean().default(true),
  reasoningEffort: z.enum(["high", "max"]).default("high"),
  failOn: severitySchema.default("high"),
  confidenceFloor: z.enum(["high", "medium", "low"]).default("medium"),
  review: z
    .object({
      security: z.boolean().default(true),
      bugs: z.boolean().default(true),
      quality: z.boolean().default(true),
      tests: z.boolean().default(true),
      learningNotes: z.boolean().default(true),
    })
    .default({
      security: true,
      bugs: true,
      quality: true,
      tests: true,
      learningNotes: true,
    }),
  security: z
    .object({
      allowSecrets: z.boolean().default(false),
    })
    .default({
      allowSecrets: false,
    }),
  ignore: z
    .array(z.string())
    .default([
      "pnpm-lock.yaml",
      "package-lock.json",
      "dist/**",
      "build/**",
      "*.min.js",
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
});

export type AiCodeviewConfig = z.infer<typeof aiCodeviewConfigSchema>;
