import type { ReviewChunk } from "../diff/chunk-review-input.js";
import type { ReportLanguage } from "../config/config-schema.js";
import type { AiProvider } from "../providers/ai-provider.js";
import type { ReviewFinding, ReviewReport } from "./review-schema.js";
import { buildReviewPrompt } from "./prompt-builder.js";

export interface ReviewChunksInput {
  chunks: ReviewChunk[];
  provider: AiProvider;
  reportLanguage?: ReportLanguage;
  learningNotes?: boolean;
  continueOnError?: boolean;
  onChunkStart?: (chunk: ReviewChunk, index: number, total: number) => void;
  onChunkComplete?: (chunk: ReviewChunk, index: number, total: number) => void;
}

export interface ChunkReviewError {
  chunkId: string;
  message: string;
}

export interface ReviewChunksResult extends ReviewReport {
  chunkErrors: ChunkReviewError[];
}

export async function reviewChunks(input: ReviewChunksInput): Promise<ReviewChunksResult> {
  const findings: ReviewFinding[] = [];
  const chunkErrors: ChunkReviewError[] = [];
  const total = input.chunks.length;
  const continueOnError = input.continueOnError ?? true;

  for (const [index, chunk] of input.chunks.entries()) {
    const current = index + 1;
    input.onChunkStart?.(chunk, current, total);
    try {
      const report = await input.provider.review({
        prompt: buildReviewPrompt({
          chunkId: chunk.id,
          diff: chunk.raw,
          files: chunk.files.map((file) => file.path),
          reportLanguage: input.reportLanguage,
          learningNotes: input.learningNotes,
        }),
      });
      findings.push(...report.findings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chunkErrors.push({ chunkId: chunk.id, message });
      if (!continueOnError) {
        throw error;
      }
    } finally {
      input.onChunkComplete?.(chunk, current, total);
    }
  }

  const deduped = deduplicateFindings(findings);
  const normalized = deduped.map((finding, index) => ({
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

  const baseSummary = normalized.length > 0 ? `发现 ${normalized.length} 个审查问题。` : "未发现问题。";
  const summary =
    chunkErrors.length > 0 ? `${baseSummary}（${chunkErrors.length} 个分块审查失败）` : baseSummary;

  return {
    risk,
    status: findingCounts.critical + findingCounts.high > 0 ? "fail" : "pass",
    summary,
    findingCounts,
    findings: normalized,
    chunkErrors,
  };
}

function deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>();
  const result: ReviewFinding[] = [];
  for (const finding of findings) {
    const key = `${finding.file}:${finding.line ?? 0}:${finding.title}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(finding);
  }
  return result;
}
