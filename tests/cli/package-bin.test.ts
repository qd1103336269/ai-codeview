import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("package bin entries", () => {
  test("exposes both ai-codeview and ac commands", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as {
      bin?: Record<string, string>;
    };

    expect(packageJson.bin).toEqual({
      "ai-codeview": "dist/bin/ai-codeview.js",
      ac: "dist/bin/ai-codeview.js",
    });
  });
});
