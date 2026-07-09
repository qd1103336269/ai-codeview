import type { ReviewChunk } from "../diff/chunk-review-input.js";
import type { ReportLanguage } from "../config/config-schema.js";
import type { AiProvider } from "../providers/ai-provider.js";
import type { ReviewFinding, ReviewReport } from "./review-schema.js";
import { buildReviewPrompt } from "./prompt-builder.js";

export interface ReviewChunksInput {
  chunks: ReviewChunk[];
  provider: AiProvider;
  reportLanguage?: ReportLanguage;
  onChunkStart?: (chunk: ReviewChunk, index: number, total: number) => void;
  onChunkComplete?: (chunk: ReviewChunk, index: number, total: number) => void;
}

export async function reviewChunks(input: ReviewChunksInput): Promise<ReviewReport> {
  const findings: ReviewFinding[] = [];
  const total = input.chunks.length;

  for (const [index, chunk] of input.chunks.entries()) {
    const current = index + 1;
    input.onChunkStart?.(chunk, current, total);
    const report = await input.provider.review({
      prompt: buildReviewPrompt({
        chunkId: chunk.id,
        diff: chunk.raw,
        files: chunk.files.map((file) => file.path),
        reportLanguage: input.reportLanguage,
      }),
    });
    findings.push(...report.findings);
    input.onChunkComplete?.(chunk, current, total);
  }

  const normalized = findings.map((finding, index) => ({
    ...finding,
    id: `ACV-${String(index + 1).padStart(4, "0")}`,
  }));

  const findingCounts = {
    critical: normalized.filter((finding) => finding.severity === "critical").length,
    high: normalized.filter((finding) => finding.severity === "high").length,
    medium: normalized.filter((finding) => finding.severity === "medium").length,
    low: normalized.filter((finding) => finding.severity === "low").length,
  };

  const risk =
    findingCounts.critical > 0
      ? "critical"
      : findingCounts.high > 0
        ? "high"
        : findingCounts.medium > 0
          ? "medium"
          : "low";

  return {
    risk,
    status: findingCounts.critical + findingCounts.high > 0 ? "fail" : "pass",
    summary: normalized.length > 0 ? `发现 ${normalized.length} 个审查问题。` : "未发现问题。",
    findingCounts,
    findings: normalized,
  };
}
