import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { detectSecretsInDiffFiles } from "../../src/security/detect-secrets.js";
import type { ReviewFileDiff } from "../../src/diff/parse-git-diff.js";

describe("detectSecretsInDiffFiles", () => {
  test("does not keep contiguous DeepSeek-like API key fixtures in source", () => {
    const deepseekKeyPattern = new RegExp(["sk", "[A-Za-z0-9_\\-]{8,}"].join("-"));
    const sourceFiles = ["tests/security/detect-secrets.test.ts", "tests/cli/review-command.test.ts"];

    for (const sourceFile of sourceFiles) {
      expect(readFileSync(sourceFile, "utf8")).not.toMatch(deepseekKeyPattern);
    }
  });

  test("detects likely secrets added in diff lines", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,1 +1,3 @@",
          "+const awsKey = \"AKIAIOSFODNN7EXAMPLE\";",
          `+const deepseekApiKey = "${deepseekLikeApiKey()}";`,
          "+const privateKey = \"-----BEGIN PRIVATE KEY-----\";",
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([
      expect.objectContaining({ file: "src/config.ts", type: "aws-access-key" }),
      expect.objectContaining({ file: "src/config.ts", type: "api-key-assignment" }),
      expect.objectContaining({ file: "src/config.ts", type: "private-key" }),
    ]);
    expect(findings.every((finding) => !finding.redacted.includes("1234567890abcdef"))).toBe(true);
  });

  test("ignores removed secret-looking lines", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,1 +0,0 @@",
          "-const awsKey = \"AKIAIOSFODNN7EXAMPLE\";",
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([]);
  });

  test("ignores ordinary variable names and short tokens", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,1 +1,2 @@",
          "+const apiKeyName = \"DEEPSEEK_API_KEY\";",
          "+const token = \"abc123\";",
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([]);
  });
});

function fileDiff(path: string, raw: string): ReviewFileDiff {
  return {
    path,
    additions: 1,
    deletions: 0,
    raw,
    binary: false,
  };
}

function deepseekLikeApiKey(): string {
  return ["sk", "1234567890abcdef1234567890abcdef"].join("-");
}
