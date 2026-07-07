import parseDiff from "parse-diff";

export interface ReviewFileDiff {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  raw: string;
  binary: boolean;
}

export function parseGitDiff(rawDiff: string): ReviewFileDiff[] {
  const rawByPath = splitRawDiffByPath(rawDiff);

  return parseDiff(rawDiff).map((file) => {
    const changes = file.chunks.flatMap((chunk) => chunk.changes);
    const additions = changes.filter((change) => change.type === "add").length;
    const deletions = changes.filter((change) => change.type === "del").length;
    const path = file.to || file.from || "unknown";
    const oldPath = file.from && file.from !== path ? file.from : undefined;

    return {
      path,
      oldPath,
      additions,
      deletions,
      raw: rawByPath.get(path) ?? rawDiff,
      binary: file.chunks.length === 0,
    };
  });
}

function splitRawDiffByPath(rawDiff: string): Map<string, string> {
  const sections = rawDiff.split(/\n(?=diff --git )/);
  const result = new Map<string, string>();

  for (const section of sections) {
    const match = section.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (match?.[2]) {
      result.set(match[2], section);
    }
  }

  return result;
}
