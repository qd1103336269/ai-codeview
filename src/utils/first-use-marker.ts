import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

function getMarkerDir(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? homedir();
  return join(home, ".ai-codeview");
}

function getPushMarker(): string {
  return join(getMarkerDir(), "push-used");
}

export async function isFirstPushUse(): Promise<boolean> {
  try {
    await access(getPushMarker());
    return false;
  } catch {
    return true;
  }
}

export async function markPushUsed(): Promise<void> {
  try {
    await mkdir(getMarkerDir(), { recursive: true });
    await writeFile(getPushMarker(), new Date().toISOString());
  } catch {
    // 标记写入失败不阻塞流程，按"已用过"处理
  }
}
