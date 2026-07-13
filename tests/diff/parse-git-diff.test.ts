import { describe, expect, test } from "vitest";
import { parseGitDiff } from "../../src/diff/parse-git-diff.js";

describe("parseGitDiff", () => {
  test("extracts changed files and hunks", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1111111..2222222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,1 +1,1 @@",
      "-const a = 1;",
      "+const a = 2;",
    ].join("\n");

    const files = parseGitDiff(diff);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("src/a.ts");
    expect(files[0]?.additions).toBe(1);
    expect(files[0]?.deletions).toBe(1);
    expect(files[0]?.binary).toBe(false);
    expect(files[0]?.noContentChange).toBe(false);
  });

  test("parses diff with CJK filename and keeps per-file raw independent", () => {
    const diff = [
      "diff --git a/中文.ts b/中文.ts",
      "index 1111111..2222222 100644",
      "--- a/中文.ts",
      "+++ b/中文.ts",
      "@@ -1,1 +1,1 @@",
      "-const a = 1;",
      "+const a = 2;",
    ].join("\n");

    const files = parseGitDiff(diff);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("中文.ts");
    expect(files[0]?.raw).toContain("中文.ts");
    expect(files[0]?.raw).not.toContain("diff --git a/src/other.ts");
  });

  test("marks real binary file via Binary files marker and not via empty chunks", () => {
    const diff = [
      "diff --git a/binary.zip b/binary.zip",
      "index 1111111..2222222 100644",
      "Binary files a/binary.zip and b/binary.zip differ",
    ].join("\n");

    const files = parseGitDiff(diff);

    expect(files).toHaveLength(1);
    expect(files[0]?.binary).toBe(true);
    expect(files[0]?.noContentChange).toBe(false);
  });

  test("mode-only change is noContentChange, not binary", () => {
    const diff = [
      "diff --git a/script.sh b/script.sh",
      "old mode 100644",
      "new mode 100755",
    ].join("\n");

    const files = parseGitDiff(diff);

    expect(files).toHaveLength(1);
    expect(files[0]?.binary).toBe(false);
    expect(files[0]?.noContentChange).toBe(true);
  });

  test("keeps per-file raw for multi-file diff without leaking whole diff", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1..2 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,1 +1,1 @@",
      "-a",
      "+b",
      "diff --git a/src/b.ts b/src/b.ts",
      "index 3..4 100644",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1,1 +1,1 @@",
      "-c",
      "+d",
    ].join("\n");

    const files = parseGitDiff(diff);

    expect(files).toHaveLength(2);
    expect(files[0]?.path).toBe("src/a.ts");
    expect(files[1]?.path).toBe("src/b.ts");
    expect(files[0]?.raw).toContain("src/a.ts");
    expect(files[0]?.raw).not.toContain("src/b.ts");
    expect(files[1]?.raw).toContain("src/b.ts");
    expect(files[1]?.raw).not.toContain("src/a.ts");
  });

  test("returns empty array for empty diff without throwing on whole rawDiff fallback", () => {
    expect(parseGitDiff("")).toEqual([]);
  });
});
