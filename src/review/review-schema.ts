import { z } from "zod";
import { severitySchema } from "../config/config-schema.js";

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const findingSchema = z.object({
  id: z.string(),
  severity: severitySchema,
  confidence: confidenceSchema,
  category: z.string(),
  file: z.string(),
  line: z.number().int().positive().optional(),
  title: z.string(),
  reason: z.string(),
  suggestion: z.string(),
  patch: z.string().optional(),
  learningNote: z.string().optional(),
});

export type ReviewFinding = z.infer<typeof findingSchema>;

export const reviewReportSchema = z.object({
  risk: severitySchema,
  status: z.enum(["pass", "fail"]),
  summary: z.string(),
  findingCounts: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  findings: z.array(findingSchema),
});

export type ReviewReport = z.infer<typeof reviewReportSchema>;
