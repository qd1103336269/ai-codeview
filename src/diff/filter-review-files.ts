import ignore from "ignore";
import type { ReviewFileDiff } from "./parse-git-diff.js";

export interface SkippedReviewFile {
  path: string;
  reason: "ignored" | "binary";
}

export interface FilterReviewFilesResult {
  reviewable: ReviewFileDiff[];
  skipped: SkippedReviewFile[];
}

export function filterReviewFiles(files: ReviewFileDiff[], patterns: string[]): FilterReviewFilesResult {
  const matcher = ignore().add(patterns);
  const reviewable: ReviewFileDiff[] = [];
  const skipped: SkippedReviewFile[] = [];

  for (const file of files) {
    if (file.binary) {
      skipped.push({ path: file.path, reason: "binary" });
      continue;
    }
    if (matcher.ignores(file.path)) {
      skipped.push({ path: file.path, reason: "ignored" });
      continue;
    }
    reviewable.push(file);
  }

  return { reviewable, skipped };
}
