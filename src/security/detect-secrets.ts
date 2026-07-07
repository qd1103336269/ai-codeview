import type { ReviewFileDiff } from "../diff/parse-git-diff.js";

export type SecretFindingType = "aws-access-key" | "api-key-assignment" | "private-key";

export interface SecretFinding {
  type: SecretFindingType;
  file: string;
  line?: number;
  redacted: string;
}

const secretRules: Array<{ type: SecretFindingType; pattern: RegExp }> = [
  {
    type: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    type: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    type: "api-key-assignment",
    pattern:
      /(?:api[_-]?key|apikey|token|secret|password)\b\s*[:=]\s*["']?(?:sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{24,})/i,
  },
];

export function detectSecretsInDiffFiles(files: ReviewFileDiff[]): SecretFinding[] {
  return files.flatMap((file) => detectSecretsInFile(file));
}

function detectSecretsInFile(file: ReviewFileDiff): SecretFinding[] {
  const findings: SecretFinding[] = [];
  let currentNewLine: number | undefined;

  for (const rawLine of file.raw.split(/\r?\n/)) {
    const hunkStart = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkStart) {
      currentNewLine = Number(hunkStart[1]);
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      const content = rawLine.slice(1);
      const matchedRule = secretRules.find((rule) => rule.pattern.test(content));
      if (matchedRule) {
        findings.push({
          type: matchedRule.type,
          file: file.path,
          line: currentNewLine,
          redacted: redactSecretLine(content),
        });
      }
      if (currentNewLine !== undefined) {
        currentNewLine += 1;
      }
      continue;
    }

    if (!rawLine.startsWith("-") && currentNewLine !== undefined) {
      currentNewLine += 1;
    }
  }

  return findings;
}

function redactSecretLine(line: string): string {
  return line
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "<redacted>")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-<redacted>")
    .replace(/(["']?)([A-Za-z0-9_-]{24,})(["']?)/g, "$1<redacted>$3")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "-----BEGIN <redacted>-----");
}
