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

  const flush = () => {
    if (current.length > 0) {
      chunks.push(toChunk(chunks.length + 1, current));
      current = [];
      currentSize = 0;
    }
  };

  for (const file of files) {
    const expanded = file.raw.length > maxCharacters ? splitSingleFile(file, maxCharacters) : [file];

    for (const part of expanded) {
      const partSize = part.raw.length;
      if (current.length > 0 && currentSize + partSize > maxCharacters) {
        flush();
      }
      current.push(part);
      currentSize += partSize;
    }
  }

  flush();
  return chunks;
}

function splitSingleFile(file: ReviewFileDiff, maxCharacters: number): ReviewFileDiff[] {
  const lines = file.raw.split(/\r?\n/);
  const parts: string[] = [];
  let buf: string[] = [];
  let bufSize = 0;

  const flushBuf = () => {
    if (buf.length > 0) {
      parts.push(buf.join("\n"));
      buf = [];
      bufSize = 0;
    }
  };

  for (const line of lines) {
    const lineSize = line.length + 1;
    if (buf.length > 0 && bufSize + lineSize > maxCharacters) {
      flushBuf();
    }
    buf.push(line);
    bufSize += lineSize;
  }
  flushBuf();

  return parts.map((raw) => ({
    ...file,
    raw,
    additions: countAdditions(raw),
    deletions: countDeletions(raw),
  }));
}

function countAdditions(raw: string): number {
  return raw.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
}

function countDeletions(raw: string): number {
  return raw.split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
}

function toChunk(index: number, files: ReviewFileDiff[]): ReviewChunk {
  return {
    id: `chunk-${index}`,
    files,
    raw: files.map((file) => file.raw).join("\n"),
  };
}
