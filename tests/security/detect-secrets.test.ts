import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { detectSecretsInDiffFiles, detectSecretsInTextFiles } from "../../src/security/detect-secrets.js";
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

  test("detects likely secrets in plain path-review files", () => {
    const findings = detectSecretsInTextFiles([
      {
        path: "src/config.ts",
        content: `const deepseekApiKey = "${deepseekLikeApiKey()}";`,
      },
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        file: "src/config.ts",
        type: "api-key-assignment",
        line: 1,
      }),
    ]);
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

  test("detects GitHub PAT ghp_ tokens", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const gh = "ghp_${"a".repeat(36)}";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "github-pat" })]);
    expect(findings[0]?.redacted).not.toContain("ghp_");
  });

  test("detects Slack xoxb- tokens", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const slack = "xoxb-${"0".repeat(12)}-soup";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "slack-token" })]);
  });

  test("detects Google API key AIza... tokens", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const g = "AIza${"A".repeat(35)}";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "google-api-key" })]);
  });

  test("detects Stripe live secret keys", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const s = "sk_live_${"0".repeat(24)}";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "stripe-key" })]);
  });

  test("detects JWT tokens (three base64url segments)", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const bearer = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "jwt" })]);
  });

  test("detects GitLab glpat- tokens", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const gl = "glpat-${"x".repeat(20)}";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "gitlab-pat" })]);
  });

  test("detects camelCase signingKey assignment", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const signingKey = "${"k".repeat(24)}";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "api-key-assignment" })]);
  });

  test("detects JWT_SECRET uppercase assignment", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,0 +1,1 @@",
          `+const JWT_SECRET = "${"v".repeat(24)}";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([expect.objectContaining({ type: "api-key-assignment" })]);
  });

  test("does not redact git SHA-1 hashes in non-assignment context", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/notes.ts",
        [
          "diff --git a/src/notes.ts b/src/notes.ts",
          "--- a/src/notes.ts",
          "+++ b/src/notes.ts",
          "@@ -1,0 +1,1 @@",
          "+// commit abcdef0123456789012345678901234567890123",
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([]);
  });

  test("redact does not strip UUID-like strings from redacted output", () => {
    const line = `+// id: 550e8400e29b41d4a716446655440000`;
    const file = fileDiff(
      "src/notes.ts",
      [
        "diff --git a/src/notes.ts b/src/notes.ts",
        "--- a/src/notes.ts",
        "+++ b/src/notes.ts",
        "@@ -1,0 +1,1 @@",
        line,
      ].join("\n"),
    );

    const findings = detectSecretsInDiffFiles([file]);
    expect(findings).toEqual([]);
  });

  test("tracks new line number across /No newline/ marker", () => {
    const findings = detectSecretsInDiffFiles([
      fileDiff(
        "src/config.ts",
        [
          "diff --git a/src/config.ts b/src/config.ts",
          "--- a/src/config.ts",
          "+++ b/src/config.ts",
          "@@ -1,1 +1,3 @@",
          "+const a = 1;",
          "\\ No newline at end of file",
          `+const signingKey = "${"k".repeat(24)}";`,
        ].join("\n"),
      ),
    ]);

    expect(findings).toEqual([
      expect.objectContaining({ type: "api-key-assignment", line: 2 }),
    ]);
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
