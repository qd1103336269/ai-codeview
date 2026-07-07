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
  });
});
