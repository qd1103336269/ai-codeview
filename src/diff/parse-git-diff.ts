import parseDiff from "parse-diff";

export interface ReviewFileDiff {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  raw: string;
  binary: boolean;
  noContentChange: boolean;
}

export function parseGitDiff(rawDiff: string): ReviewFileDiff[] {
  if (!rawDiff.trim()) {
    return [];
  }

  const sections = splitDiffSections(rawDiff);
  const result: ReviewFileDiff[] = [];

  for (const section of sections) {
    if (!section.trim()) {
      continue;
    }

    const parsed = parseDiff(section);
    const binary = /^Binary files .+ differ$/m.test(section);

    for (const file of parsed) {
      const changes = file.chunks.flatMap((chunk) => chunk.changes);
      const additions = changes.filter((change) => change.type === "add").length;
      const deletions = changes.filter((change) => change.type === "del").length;
      const path = file.to || file.from || "unknown";
      const oldPath = file.from && file.from !== path ? file.from : undefined;
      const noContentChange = !binary && file.chunks.length === 0;

      result.push({
        path,
        oldPath,
        additions,
        deletions,
        raw: section,
        binary,
        noContentChange,
      });
    }
  }

  return result;
}

function splitDiffSections(rawDiff: string): string[] {
  return rawDiff.split(/\n(?=diff --git )/);
}
