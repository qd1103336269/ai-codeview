import type { ReviewFileDiff } from "../diff/parse-git-diff.js";

export type SecretFindingType =
  | "aws-access-key"
  | "api-key-assignment"
  | "private-key"
  | "github-pat"
  | "gitlab-pat"
  | "slack-token"
  | "google-api-key"
  | "stripe-key"
  | "jwt";

export interface SecretFinding {
  type: SecretFindingType;
  file: string;
  line?: number;
  redacted: string;
}

export interface ReviewTextFile {
  path: string;
  content: string;
}

interface SecretRule {
  type: SecretFindingType;
  pattern: RegExp;
  redact: RegExp;
}

const secretRules: SecretRule[] = [
  {
    type: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    redact: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    type: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    redact: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    type: "github-pat",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    redact: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  },
  {
    type: "gitlab-pat",
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
    redact: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    type: "slack-token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    redact: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    type: "google-api-key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    redact: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    type: "stripe-key",
    pattern: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{24,}\b/,
    redact: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g,
  },
  {
    type: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    redact: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  {
    type: "api-key-assignment",
    pattern:
      /(?:api[_-]?key|apikey|token|secret|password|signingkey|privatekey|jwt[_-]?secret)\b\s*[:=]\s*["']?(?:sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{24,})/i,
    redact: /(?:api[_-]?key|apikey|token|secret|password|signingkey|privatekey|jwt[_-]?secret)\b\s*[:=]\s*["']?(?:sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{24,})/gi,
  },
];

export function detectSecretsInDiffFiles(files: ReviewFileDiff[]): SecretFinding[] {
  return files.flatMap((file) => detectSecretsInFile(file));
}

export function detectSecretsInTextFiles(files: ReviewTextFile[]): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const matchedRule = secretRules.find((rule) => rule.pattern.test(line));
      if (!matchedRule) {
        continue;
      }

      findings.push({
        type: matchedRule.type,
        file: file.path,
        line: index + 1,
        redacted: redactSecretLine(line),
      });
    }
  }

  return findings;
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

    if (!rawLine.startsWith("-") && !rawLine.startsWith("\\") && currentNewLine !== undefined) {
      currentNewLine += 1;
    }
  }

  return findings;
}

function redactSecretLine(line: string): string {
  return secretRules.reduce((acc, rule) => acc.replace(rule.redact, "<redacted>"), line);
}
