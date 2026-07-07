import type { ReviewFileDiff } from "./parse-git-diff.js";

export interface ReviewChunk {
  id: string;
  files: ReviewFileDiff[];
  raw: string;
}

export function chunkReviewInput(files: ReviewFileDiff[], maxCharacters: number): ReviewChunk[] {
  const chunks: ReviewChunk[] = [];
  let current: ReviewFileDiff[] = [];
  let currentSize = 0;

  for (const file of files) {
    const fileSize = file.raw.length;
    if (current.length > 0 && currentSize + fileSize > maxCharacters) {
      chunks.push(toChunk(chunks.length + 1, current));
      current = [];
      currentSize = 0;
    }
    current.push(file);
    currentSize += fileSize;
  }

  if (current.length > 0) {
    chunks.push(toChunk(chunks.length + 1, current));
  }

  return chunks;
}

function toChunk(index: number, files: ReviewFileDiff[]): ReviewChunk {
  return {
    id: `chunk-${index}`,
    files,
    raw: files.map((file) => file.raw).join("\n"),
  };
}
