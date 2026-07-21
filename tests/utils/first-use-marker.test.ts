import { describe, expect, test } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { isFirstPushUse, markPushUsed } from "../../src/utils/first-use-marker.js";

const originalHomedir = process.env.USERPROFILE ?? process.env.HOME;
let tempHome: string;

describe("first-use-marker", () => {
  test("isFirstPushUse returns true when marker absent", async () => {
    tempHome = await makeTempDir();
    process.env.USERPROFILE = tempHome;
    process.env.HOME = tempHome;
    try {
      expect(await isFirstPushUse()).toBe(true);
    } finally {
      await restoreHome();
    }
  });

  test("isFirstPushUse returns false after markPushUsed", async () => {
    tempHome = await makeTempDir();
    process.env.USERPROFILE = tempHome;
    process.env.HOME = tempHome;
    try {
      await markPushUsed();
      expect(await isFirstPushUse()).toBe(false);
    } finally {
      await restoreHome();
    }
  });

  test("markPushUsed does not throw when home dir not writable", async () => {
    await expect(markPushUsed()).resolves.toBeUndefined();
  });
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `acv-marker-${randomUUID()}`), { recursive: true });
}

async function restoreHome(): Promise<void> {
  process.env.USERPROFILE = originalHomedir;
  process.env.HOME = originalHomedir;
  await rm(tempHome, { recursive: true, force: true }).catch(() => {});
}
