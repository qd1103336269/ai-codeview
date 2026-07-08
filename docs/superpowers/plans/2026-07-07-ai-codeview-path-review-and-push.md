# AI Codeview 0.2 Path Review And Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `review --path` and `push` for AI Codeview 0.2: absolute-path file review, staged-only review-before-push, Chinese commit message generation, and guarded Git commit/push.

**Architecture:** Keep deterministic input handling outside AI. Path review converts absolute files/directories into review chunks; Git review continues to use parsed diff chunks. Push composes existing staged review, risk gating, interactive confirmation, AI commit-message generation, and Git commit/push without auto-staging files.

**Tech Stack:** Node.js, TypeScript, Commander, DeepSeek provider via OpenAI-compatible SDK, `@inquirer/prompts` for interactive confirmation/editing, Vitest, tsup.

---

## File Map

- Modify `package.json`: add `@inquirer/prompts`, bump version to `0.2.0` when implementation is ready for release.
- Modify `src/errors/app-error.ts`: add input/path and Git operation error codes.
- Create `src/input/path-input.ts`: validate absolute paths, recursively read files, convert files into reviewable pseudo-diff entries.
- Create `tests/input/path-input.test.ts`: cover absolute path validation, missing path, file read, directory recursion, ignore handling, and binary skip.
- Modify `src/security/detect-secrets.ts`: add plain-content secret scanning for path review while preserving diff scanning behavior.
- Modify `tests/security/detect-secrets.test.ts`: add plain-content secret detection tests without storing contiguous fake DeepSeek keys.
- Modify `src/providers/ai-provider.ts`: add `generateCommitMessage(request)` to the provider interface.
- Modify `src/providers/deepseek-provider.ts`: implement commit-message generation using DeepSeek.
- Modify `tests/providers/deepseek-provider.test.ts`: verify Chinese commit-message prompt and JSON/text parsing behavior.
- Create `src/review/commit-message.ts`: build commit-message prompt and parse/sanitize provider output.
- Create `tests/review/commit-message.test.ts`: cover Chinese prompt requirements and subject sanitization.
- Modify `src/commands/review-command.ts`: support `path?: string[]`, route path input through `src/input/path-input.ts`.
- Modify `tests/cli/review-command.test.ts`: cover `--path` behavior at command-service level.
- Modify `src/git/git-client.ts`: add `commitStagedChanges`, `pushCurrentBranch`, and staged diff helper reuse.
- Modify `tests/git/git-client.test.ts`: cover exact Git arguments and error mapping.
- Create `src/commands/push-command.ts`: orchestrate staged review, user confirmation, commit-message generation/editing, commit, and push.
- Create `tests/commands/push-command.test.ts`: cover staged-only behavior, risk cancellation, commit-message confirmation/editing, commit/push failures.
- Modify `src/cli/create-program.ts`: add `review --path` and `push` command wiring, progress formatting.
- Modify `tests/cli/create-program.test.ts`: cover CLI option forwarding and push progress output.
- Modify `README.md` and `design.md`: move 0.2 features from planning language to current behavior after implementation.

## Task 1: Add Interactive Dependency And Release Version

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependency**

Run:

```bash
pnpm.cmd install
```

Expected: dependency tree is current before adding new package.

- [ ] **Step 2: Add interactive prompts package**

Run:

```bash
pnpm.cmd add @inquirer/prompts
```

Expected: `package.json` contains `@inquirer/prompts` in dependencies and `pnpm-lock.yaml` is updated.

- [ ] **Step 3: Update version**

Edit `package.json`:

```json
{
  "version": "0.2.0"
}
```

Expected: package version represents the new command/features.

- [ ] **Step 4: Verify install state**

Run:

```bash
pnpm.cmd test
```

Expected: no functional tests should fail because only dependency/version changed.

## Task 2: Extend Error Codes

**Files:**
- Modify: `src/errors/app-error.ts`
- Test: existing tests compile against the new union.

- [ ] **Step 1: Write failing type usage test indirectly**

Create later tests in Task 3/7 that expect these error codes:

```ts
expect(error).toMatchObject({ code: "INVALID_PATH_INPUT" });
expect(error).toMatchObject({ code: "PATH_NOT_FOUND" });
expect(error).toMatchObject({ code: "GIT_COMMIT_FAILED" });
expect(error).toMatchObject({ code: "GIT_PUSH_FAILED" });
```

Expected: before implementation, TypeScript will fail once those tests are added because codes are not in `AppErrorCode`.

- [ ] **Step 2: Add codes**

Modify `AppErrorCode`:

```ts
export type AppErrorCode =
  | "NOT_GIT_REPOSITORY"
  | "GIT_NOT_FOUND"
  | "NO_DIFF"
  | "INVALID_CONFIG"
  | "INVALID_PATH_INPUT"
  | "PATH_NOT_FOUND"
  | "MISSING_API_KEY"
  | "SECRET_DETECTED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_BAD_REQUEST"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "DIFF_TOO_LARGE"
  | "AI_RESPONSE_INVALID"
  | "OUTPUT_WRITE_FAILED"
  | "GIT_COMMIT_FAILED"
  | "GIT_PUSH_FAILED"
  | "UNKNOWN_ERROR";
```

- [ ] **Step 3: Verify compile through targeted tests**

Run after Task 3 tests exist:

```bash
pnpm.cmd test -- tests/input/path-input.test.ts
```

Expected: no TypeScript union errors for new codes.

## Task 3: Build Absolute Path Input Reader

**Files:**
- Create: `src/input/path-input.ts`
- Create: `tests/input/path-input.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/input/path-input.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { collectPathReviewFiles } from "../../src/input/path-input.js";

describe("collectPathReviewFiles", () => {
  test("rejects relative paths", async () => {
    await expect(collectPathReviewFiles({ paths: ["src/index.ts"], ignore: [] })).rejects.toMatchObject({
      code: "INVALID_PATH_INPUT",
      exitCode: 2,
    });
  });

  test("rejects missing absolute paths", async () => {
    const missing = resolve(tmpdir(), `missing-${randomUUID()}.ts`);

    await expect(collectPathReviewFiles({ paths: [missing], ignore: [] })).rejects.toMatchObject({
      code: "PATH_NOT_FOUND",
      exitCode: 2,
    });
  });

  test("reads one absolute file as reviewable pseudo diff", async () => {
    const root = await makeTempDir();
    const file = join(root, "src", "a.ts");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(file, "export const a = 1;\n", "utf8");

    const result = await collectPathReviewFiles({ paths: [file], ignore: [], cwd: root });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: "src/a.ts",
      additions: 1,
      deletions: 0,
      binary: false,
    });
    expect(result[0].raw).toContain("文件内容审查");
    expect(result[0].raw).toContain("export const a = 1;");
  });

  test("recursively reads directories and applies ignore patterns", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(join(root, "dist", "bundle.js"), "const bundled = true;\n", "utf8");

    const result = await collectPathReviewFiles({
      paths: [join(root, "src"), join(root, "dist")],
      ignore: ["dist/**"],
      cwd: root,
    });

    expect(result.map((file) => file.path)).toEqual(["src/a.ts"]);
  });
});

async function makeTempDir(): Promise<string> {
  return mkdir(join(tmpdir(), `ai-codeview-path-${randomUUID()}`), { recursive: true });
}
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
pnpm.cmd test -- tests/input/path-input.test.ts
```

Expected: FAIL because `src/input/path-input.ts` does not exist.

- [ ] **Step 3: Implement minimal path reader**

Create `src/input/path-input.ts`:

```ts
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import ignore from "ignore";
import { AppError } from "../errors/app-error.js";
import type { ReviewFileDiff } from "../diff/parse-git-diff.js";

export interface CollectPathReviewFilesInput {
  paths: string[];
  ignore: string[];
  cwd?: string;
}

export async function collectPathReviewFiles(input: CollectPathReviewFilesInput): Promise<ReviewFileDiff[]> {
  const cwd = input.cwd ?? process.cwd();
  const matcher = ignore().add(input.ignore);
  const files: ReviewFileDiff[] = [];

  for (const path of input.paths) {
    if (!isAbsolute(path)) {
      throw new AppError({
        code: "INVALID_PATH_INPUT",
        message: `路径审查只接受绝对路径：${path}`,
        exitCode: 2,
        recoverable: false,
        suggestion: "请传入完整绝对路径，例如 E:\\code\\demo\\src\\index.ts。",
      });
    }

    const found = await safeStat(path);
    if (!found) {
      throw new AppError({
        code: "PATH_NOT_FOUND",
        message: `路径不存在：${path}`,
        exitCode: 2,
        recoverable: false,
      });
    }

    const absoluteFiles = found.isDirectory() ? await listFiles(path) : [path];
    for (const absoluteFile of absoluteFiles) {
      const reviewPath = toReviewPath(cwd, absoluteFile);
      if (matcher.ignores(reviewPath)) continue;

      const content = await readFile(absoluteFile, "utf8");
      files.push({
        path: reviewPath,
        additions: content.split(/\r?\n/).filter(Boolean).length,
        deletions: 0,
        raw: toPseudoDiff(reviewPath, content),
        binary: false,
      });
    }
  }

  return files;
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = `${root}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function toReviewPath(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).replace(/\\/g, "/") || absolutePath.replace(/\\/g, "/");
}

function toPseudoDiff(path: string, content: string): string {
  return [`文件内容审查：${path}`, "```", content, "```"].join("\n");
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm.cmd test -- tests/input/path-input.test.ts
```

Expected: PASS.

## Task 4: Add Plain Content Secret Detection

**Files:**
- Modify: `src/security/detect-secrets.ts`
- Modify: `tests/security/detect-secrets.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/security/detect-secrets.test.ts`:

```ts
import { detectSecretsInTextFiles } from "../../src/security/detect-secrets.js";

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
```

If the import already exists, merge it into the existing import instead of creating a second import.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
pnpm.cmd test -- tests/security/detect-secrets.test.ts
```

Expected: FAIL because `detectSecretsInTextFiles` is not exported.

- [ ] **Step 3: Implement plain text scanner**

Add to `src/security/detect-secrets.ts`:

```ts
export interface ReviewTextFile {
  path: string;
  content: string;
}

export function detectSecretsInTextFiles(files: ReviewTextFile[]): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const matchedRule = secretRules.find((rule) => rule.pattern.test(line));
      if (!matchedRule) continue;

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
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm.cmd test -- tests/security/detect-secrets.test.ts
```

Expected: PASS.

## Task 5: Support `review --path`

**Files:**
- Modify: `src/commands/review-command.ts`
- Modify: `src/cli/create-program.ts`
- Modify: `tests/cli/review-command.test.ts`
- Modify: `tests/cli/create-program.test.ts`

- [ ] **Step 1: Write failing service tests**

Add to `tests/cli/review-command.test.ts`:

```ts
test("rejects path mode combined with staged mode", async () => {
  const result = await runReviewCommand(
    { staged: true, path: ["E:\\code\\demo\\src\\a.ts"], format: "text" },
    { provider: providerReturningPass() },
  );

  expect(result.exitCode).toBe(2);
  expect(result.output).toContain("不能同时使用");
});

test("reviews absolute path input without collecting git diff", async () => {
  const cwd = await makeTempDir();
  const sourceDir = join(cwd, "src");
  await mkdir(sourceDir, { recursive: true });
  const sourceFile = join(sourceDir, "a.ts");
  await writeFile(sourceFile, "export const a = 1;\n", "utf8");
  const collectGitDiff = vi.fn();
  const provider = providerReturningPass();

  const result = await runReviewCommand(
    { path: [sourceFile], format: "text" },
    { collectGitDiff, provider, cwd },
  );

  expect(result.exitCode).toBe(0);
  expect(collectGitDiff).not.toHaveBeenCalled();
  expect(provider.review).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
pnpm.cmd test -- tests/cli/review-command.test.ts
```

Expected: FAIL because `ReviewCommandOptions` has no `path` support and path mode is not implemented.

- [ ] **Step 3: Implement review command routing**

Modify `src/commands/review-command.ts`:

```ts
import { collectPathReviewFiles } from "../input/path-input.js";
import { detectSecretsInDiffFiles, detectSecretsInTextFiles } from "../security/detect-secrets.js";
```

Extend options:

```ts
export interface ReviewCommandOptions {
  staged?: boolean;
  base?: string;
  path?: string[];
  format?: OutputFormat;
  failOn?: Severity;
  output?: string;
  color?: boolean;
  allowSecrets?: boolean;
}
```

Add validation near the start after config loads:

```ts
if (options.path?.length && (options.staged || options.base)) {
  throw new AppError({
    code: "INVALID_PATH_INPUT",
    message: "不能同时使用 --path 与 --staged 或 --base。",
    exitCode: 2,
    recoverable: false,
  });
}
```

Replace raw diff collection block with:

```ts
const parsed = options.path?.length
  ? await collectPathReviewFiles({ paths: options.path, ignore: config.ignore, cwd })
  : parseGitDiff(await collectGitDiff(getGitDiffInput(options)));
```

For path mode progress, emit:

```ts
progress(options.path?.length ? "校验输入路径..." : "收集 Git diff...");
```

Secret checking can initially call `detectSecretsInDiffFiles(parsed)` because pseudo diff contains file content. If Task 4 is complete, prefer plain text scanning by returning content from path input or extracting content before pseudo diff.

- [ ] **Step 4: Add CLI option forwarding test**

Modify `tests/cli/create-program.test.ts` expected review options to include `path` when passed:

```ts
await program.parseAsync(["review", "--path", "E:\\code\\demo\\src\\a.ts"], { from: "user" });

expect(runReviewCommand).toHaveBeenCalledWith(
  expect.objectContaining({
    path: ["E:\\code\\demo\\src\\a.ts"],
  }),
  expect.anything(),
);
```

- [ ] **Step 5: Implement CLI option**

Modify `src/cli/create-program.ts`:

```ts
interface ReviewCliOptions {
  staged?: boolean;
  base?: string;
  path?: string[];
  failOn?: Severity;
  format?: OutputFormat;
  output?: string;
  color?: boolean;
  allowSecrets?: boolean;
}
```

Add option:

```ts
.option("--path <path>", "审查指定绝对路径的文件或目录", collectPathOption, [])
```

Add helper:

```ts
function collectPathOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}
```

Pass `path: options.path` to `runReviewCommand`.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
pnpm.cmd test -- tests/cli/review-command.test.ts tests/cli/create-program.test.ts tests/input/path-input.test.ts
```

Expected: PASS.

## Task 6: Add Commit Message Prompt And Provider Method

**Files:**
- Create: `src/review/commit-message.ts`
- Create: `tests/review/commit-message.test.ts`
- Modify: `src/providers/ai-provider.ts`
- Modify: `src/providers/deepseek-provider.ts`
- Modify: `tests/providers/deepseek-provider.test.ts`

- [ ] **Step 1: Write commit-message prompt tests**

Create `tests/review/commit-message.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildCommitMessagePrompt, sanitizeCommitMessage } from "../../src/review/commit-message.js";

describe("commit-message", () => {
  test("builds a Chinese commit message prompt from staged diff", () => {
    const prompt = buildCommitMessagePrompt({
      diff: "diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;",
    });

    expect(prompt).toContain("中文");
    expect(prompt).toContain("Conventional Commits");
    expect(prompt).toContain("diff --git");
  });

  test("sanitizes markdown fenced output", () => {
    expect(sanitizeCommitMessage("```text\nfeat: 增加推送前审查\n```")).toBe("feat: 增加推送前审查");
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
pnpm.cmd test -- tests/review/commit-message.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement prompt helpers**

Create `src/review/commit-message.ts`:

```ts
export interface BuildCommitMessagePromptInput {
  diff: string;
}

export function buildCommitMessagePrompt(input: BuildCommitMessagePromptInput): string {
  return [
    "你是一个帮助开发者生成 Git 提交信息的助手。",
    "请根据下面的 staged diff 生成一条中文 commit message。",
    "要求使用 Conventional Commits 类型前缀，例如 feat、fix、docs、refactor、test、chore。",
    "第一行必须是简短 subject，不超过 72 个字符。",
    "如果确实需要正文，可以在第二行空行后补充，但不要输出 Markdown 代码块。",
    "只返回 commit message 本身。",
    "",
    "Staged diff:",
    input.diff,
  ].join("\n");
}

export function sanitizeCommitMessage(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}
```

- [ ] **Step 4: Extend provider interface**

Modify `src/providers/ai-provider.ts`:

```ts
import type { ReviewReport } from "../review/review-schema.js";

export interface ReviewRequest {
  prompt: string;
}

export interface CommitMessageRequest {
  prompt: string;
}

export interface AiProvider {
  review(request: ReviewRequest): Promise<ReviewReport>;
  generateCommitMessage(request: CommitMessageRequest): Promise<string>;
}
```

Update all test provider mocks to include:

```ts
generateCommitMessage: vi.fn().mockResolvedValue("feat: 测试提交"),
```

- [ ] **Step 5: Implement DeepSeek provider method**

Modify `src/providers/deepseek-provider.ts`:

```ts
import { sanitizeCommitMessage } from "../review/commit-message.js";
import type { AiProvider, CommitMessageRequest, ReviewRequest } from "./ai-provider.js";
```

Add method:

```ts
async generateCommitMessage(request: CommitMessageRequest): Promise<string> {
  const completion = await this.createCompletionWithRetry({
    model: this.model,
    messages: [{ role: "user", content: request.prompt }],
    thinking: { type: this.thinking ? "enabled" : "disabled" },
    reasoning_effort: this.reasoningEffort,
    stream: false,
  });

  const content = getCompletionContent(completion);
  if (!content) {
    throw new AppError({
      code: "AI_RESPONSE_INVALID",
      message: "DeepSeek 返回了空提交信息。",
      exitCode: 2,
      recoverable: true,
    });
  }

  return sanitizeCommitMessage(content);
}
```

- [ ] **Step 6: Add DeepSeek test**

Add to `tests/providers/deepseek-provider.test.ts`:

```ts
test("generates sanitized Chinese commit message", async () => {
  const create = vi.fn().mockResolvedValue(completion("```text\nfeat: 增加推送前审查\n```"));
  const provider = createProvider(create);

  const message = await provider.generateCommitMessage({ prompt: "生成中文提交信息" });

  expect(message).toBe("feat: 增加推送前审查");
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: [{ role: "user", content: "生成中文提交信息" }],
      stream: false,
    }),
  );
});
```

- [ ] **Step 7: Verify GREEN**

Run:

```bash
pnpm.cmd test -- tests/review/commit-message.test.ts tests/providers/deepseek-provider.test.ts
```

Expected: PASS.

## Task 7: Add Git Commit And Push Helpers

**Files:**
- Modify: `src/git/git-client.ts`
- Modify: `tests/git/git-client.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/git/git-client.test.ts`:

```ts
import { commitStagedChanges, pushCurrentBranch } from "../../src/git/git-client.js";

test("commits staged changes with provided message", async () => {
  const run = vi.fn().mockResolvedValue({ stdout: "" });

  await commitStagedChanges({ message: "feat: 增加推送前审查", run });

  expect(run).toHaveBeenCalledWith("git", ["commit", "-m", "feat: 增加推送前审查"]);
});

test("maps commit failure to GIT_COMMIT_FAILED", async () => {
  const run = vi.fn().mockRejectedValue(new Error("commit failed"));

  await expect(commitStagedChanges({ message: "feat: x", run })).rejects.toMatchObject({
    code: "GIT_COMMIT_FAILED",
    exitCode: 2,
  });
});

test("pushes current branch using git push", async () => {
  const run = vi.fn().mockResolvedValue({ stdout: "" });

  await pushCurrentBranch({ run });

  expect(run).toHaveBeenCalledWith("git", ["push"]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm.cmd test -- tests/git/git-client.test.ts
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement helpers**

Add to `src/git/git-client.ts`:

```ts
export interface CommitStagedChangesInput {
  message: string;
  run?: RunCommand;
}

export interface PushCurrentBranchInput {
  run?: RunCommand;
}

export async function commitStagedChanges(input: CommitStagedChangesInput): Promise<void> {
  const run = input.run ?? defaultRun;
  try {
    await run("git", ["commit", "-m", input.message]);
  } catch (error) {
    throw new AppError({
      code: "GIT_COMMIT_FAILED",
      message: "Git commit 执行失败。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请检查暂存区、提交钩子和 Git 配置后重试。",
      details: error,
    });
  }
}

export async function pushCurrentBranch(input: PushCurrentBranchInput = {}): Promise<void> {
  const run = input.run ?? defaultRun;
  try {
    await run("git", ["push"]);
  } catch (error) {
    throw new AppError({
      code: "GIT_PUSH_FAILED",
      message: "Git push 执行失败。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请检查远程仓库、网络、认证和 upstream 配置后重试。",
      details: error,
    });
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm.cmd test -- tests/git/git-client.test.ts
```

Expected: PASS.

## Task 8: Implement Push Command Orchestrator

**Files:**
- Create: `src/commands/push-command.ts`
- Create: `tests/commands/push-command.test.ts`

- [ ] **Step 1: Write failing push command tests**

Create `tests/commands/push-command.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { AppError } from "../../src/errors/app-error.js";
import { runPushCommand } from "../../src/commands/push-command.js";
import type { ReviewReport } from "../../src/review/review-schema.js";

describe("runPushCommand", () => {
  test("does not commit or push when there is no staged diff", async () => {
    const commit = vi.fn();
    const push = vi.fn();

    const result = await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockRejectedValue(
          new AppError({
            code: "NO_DIFF",
            message: "没有发现可审查的 diff。",
            exitCode: 0,
            recoverable: false,
          }),
        ),
        commitStagedChanges: commit,
        pushCurrentBranch: push,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("请先执行 git add");
    expect(commit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("commits and pushes after passing staged review and confirmed message", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const push = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 增加推送前审查");

    const result = await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
        commitStagedChanges: commit,
        pushCurrentBranch: push,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(commit).toHaveBeenCalledWith({ message: "feat: 增加推送前审查" });
    expect(push).toHaveBeenCalled();
  });

  test("uses edited commit message", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const provider = providerReturning(passReport(), "feat: 初始提交信息");

    await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider,
        confirmCommitMessage: vi.fn().mockResolvedValue({
          action: "edit",
          message: "feat: 使用编辑后的中文提交信息",
        }),
        commitStagedChanges: commit,
        pushCurrentBranch: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(commit).toHaveBeenCalledWith({ message: "feat: 使用编辑后的中文提交信息" });
  });

  test("does not commit when risk confirmation is rejected", async () => {
    const commit = vi.fn();

    const result = await runPushCommand(
      {},
      {
        collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
        provider: providerReturning(failReport(), "fix: x"),
        confirmRisk: vi.fn().mockResolvedValue(false),
        commitStagedChanges: commit,
        pushCurrentBranch: vi.fn(),
      },
    );

    expect(result.exitCode).toBe(1);
    expect(commit).not.toHaveBeenCalled();
  });
});

function providerReturning(report: ReviewReport, message: string) {
  return {
    review: vi.fn().mockResolvedValue(report),
    generateCommitMessage: vi.fn().mockResolvedValue(message),
  };
}

function stagedDiff(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,1 +1,1 @@",
    "-const a = 1;",
    "+const a = 2;",
  ].join("\n");
}

function passReport(): ReviewReport {
  return {
    risk: "low",
    status: "pass",
    summary: "未发现问题。",
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    findings: [],
  };
}

function failReport(): ReviewReport {
  return {
    risk: "high",
    status: "fail",
    summary: "发现高风险问题。",
    findingCounts: { critical: 0, high: 1, medium: 0, low: 0 },
    findings: [
      {
        id: "ACV-0001",
        severity: "high",
        confidence: "high",
        category: "bug",
        file: "src/a.ts",
        title: "高风险问题",
        reason: "原因。",
        suggestion: "建议。",
      },
    ],
  };
}
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm.cmd test -- tests/commands/push-command.test.ts
```

Expected: FAIL because `runPushCommand` does not exist.

- [ ] **Step 3: Implement push command**

Create `src/commands/push-command.ts`:

```ts
import { collectGitDiff as defaultCollectGitDiff, commitStagedChanges as defaultCommitStagedChanges, pushCurrentBranch as defaultPushCurrentBranch } from "../git/git-client.js";
import type { AiProvider } from "../providers/ai-provider.js";
import { AppError, toAppError } from "../errors/app-error.js";
import { parseGitDiff } from "../diff/parse-git-diff.js";
import { chunkReviewInput } from "../diff/chunk-review-input.js";
import { reviewChunks } from "../review/review-orchestrator.js";
import { buildCommitMessagePrompt } from "../review/commit-message.js";
import { resolveExitCode } from "../report/exit-code.js";
import { renderMarkdownReport } from "../report/markdown-report.js";
import { loadConfig } from "../config/load-config.js";
import { DeepSeekProvider } from "../providers/deepseek-provider.js";
import type { CommandResult } from "./review-command.js";

export interface PushCommandOptions {}

export interface CommitMessageDecision {
  action: "confirm" | "edit" | "cancel";
  message?: string;
}

export interface PushCommandDeps {
  collectGitDiff?: typeof defaultCollectGitDiff;
  commitStagedChanges?: typeof defaultCommitStagedChanges;
  pushCurrentBranch?: typeof defaultPushCurrentBranch;
  provider?: AiProvider;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  onProgress?: (message: string) => void;
  confirmRisk?: (reportMarkdown: string) => Promise<boolean>;
  confirmCommitMessage?: (message: string) => Promise<CommitMessageDecision>;
}

export async function runPushCommand(_options: PushCommandOptions, deps: PushCommandDeps = {}): Promise<CommandResult> {
  const progress = deps.onProgress ?? noopProgress;

  try {
    progress("检查 Git 状态...");
    progress("收集已暂存变更...");
    const rawDiff = await collectStagedDiff(deps);
    const config = await loadConfig({ cwd: deps.cwd ?? process.cwd(), overrides: { format: "markdown" } });
    const provider = deps.provider ?? createDeepSeekProvider(config, deps.env ?? process.env);

    progress("调用 DeepSeek 审查代码...");
    const report = await reviewChunks({
      chunks: chunkReviewInput(parseGitDiff(rawDiff), 40_000),
      provider,
    });
    const reportMarkdown = renderMarkdownReport(report);
    const gateExitCode = resolveExitCode(report, config.failOn, config.confidenceFloor);

    if (gateExitCode === 1) {
      progress("发现达到阈值的问题，等待用户确认...");
      const shouldContinue = await (deps.confirmRisk ?? defaultConfirmRisk)(reportMarkdown);
      if (!shouldContinue) {
        return { exitCode: 1, output: "已取消提交和推送。" };
      }
    }

    progress("生成中文提交信息...");
    const generatedMessage = await provider.generateCommitMessage({
      prompt: buildCommitMessagePrompt({ diff: rawDiff }),
    });
    const decision = await (deps.confirmCommitMessage ?? defaultConfirmCommitMessage)(generatedMessage);
    if (decision.action === "cancel") {
      return { exitCode: 1, output: "已取消提交和推送。" };
    }

    const message = decision.action === "edit" ? decision.message?.trim() : generatedMessage;
    if (!message) {
      throw new AppError({
        code: "INVALID_CONFIG",
        message: "提交信息不能为空。",
        exitCode: 2,
        recoverable: false,
      });
    }

    progress("创建 Git commit...");
    await (deps.commitStagedChanges ?? defaultCommitStagedChanges)({ message });
    progress("推送到远程分支...");
    await (deps.pushCurrentBranch ?? defaultPushCurrentBranch)();
    progress("push 流程完成");
    return { exitCode: 0, output: "提交和推送完成。" };
  } catch (error) {
    const appError = toAppError(error);
    return { exitCode: appError.exitCode, output: appError.message };
  }
}

async function collectStagedDiff(deps: PushCommandDeps): Promise<string> {
  try {
    return await (deps.collectGitDiff ?? defaultCollectGitDiff)({ mode: "staged" });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.code === "NO_DIFF") {
      throw new AppError({
        code: "NO_DIFF",
        message: "没有已暂存变更，请先执行 git add。",
        exitCode: 2,
        recoverable: false,
      });
    }
    throw appError;
  }
}

function createDeepSeekProvider(config: Awaited<ReturnType<typeof loadConfig>>, env: NodeJS.ProcessEnv): AiProvider {
  const apiKey = env[config.apiKeyEnv];
  if (!apiKey) {
    throw new AppError({
      code: "MISSING_API_KEY",
      message: `缺少 ${config.apiKeyEnv}。`,
      exitCode: 2,
      recoverable: false,
    });
  }
  return new DeepSeekProvider({
    apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    thinking: config.thinking,
    reasoningEffort: config.reasoningEffort,
  });
}

async function defaultConfirmRisk(): Promise<boolean> {
  return false;
}

async function defaultConfirmCommitMessage(): Promise<CommitMessageDecision> {
  return { action: "cancel" };
}

function noopProgress(): void {}
```

Then replace default confirmation functions with real `@inquirer/prompts` in Task 9.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm.cmd test -- tests/commands/push-command.test.ts
```

Expected: PASS.

## Task 9: Wire Interactive Prompts And CLI Push Command

**Files:**
- Modify: `src/commands/push-command.ts`
- Modify: `src/cli/create-program.ts`
- Modify: `tests/cli/create-program.test.ts`

- [ ] **Step 1: Replace default prompt functions**

Modify `src/commands/push-command.ts` imports:

```ts
import { confirm, editor, select } from "@inquirer/prompts";
```

Replace defaults:

```ts
async function defaultConfirmRisk(reportMarkdown: string): Promise<boolean> {
  process.stdout.write(`${reportMarkdown}\n`);
  return confirm({
    message: "审查发现达到阈值的问题，仍然继续提交和推送吗？",
    default: false,
  });
}

async function defaultConfirmCommitMessage(message: string): Promise<CommitMessageDecision> {
  process.stdout.write(`\nAI 生成的提交信息：\n\n${message}\n\n`);
  const action = await select({
    message: "请选择提交信息处理方式",
    choices: [
      { name: "使用并继续", value: "confirm" as const },
      { name: "编辑后继续", value: "edit" as const },
      { name: "取消提交", value: "cancel" as const },
    ],
  });

  if (action === "edit") {
    const edited = await editor({
      message: "编辑提交信息",
      default: message,
    });
    return { action, message: edited };
  }

  return { action };
}
```

- [ ] **Step 2: Write CLI push forwarding test**

Add to `tests/cli/create-program.test.ts`:

```ts
test("runs push command handler", async () => {
  const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const runPushCommand = vi.fn().mockImplementation((_options, deps) => {
    deps.onProgress("检查 Git 状态...");
    return Promise.resolve({ exitCode: 0, output: "提交和推送完成。" });
  });
  const program = createProgram({ runPushCommand });

  await program.parseAsync(["push"], { from: "user" });

  expect(runPushCommand).toHaveBeenCalledWith({}, expect.objectContaining({ onProgress: expect.any(Function) }));
  expect(stderrWrite.mock.calls[0]?.[0]?.toString()).toContain("检查 Git 状态");
  expect(stdoutWrite).toHaveBeenCalledWith("提交和推送完成。\n");
  stdoutWrite.mockRestore();
  stderrWrite.mockRestore();
});
```

- [ ] **Step 3: Run test and verify RED**

Run:

```bash
pnpm.cmd test -- tests/cli/create-program.test.ts
```

Expected: FAIL because `CreateProgramDeps` has no push command and CLI has no `push`.

- [ ] **Step 4: Implement CLI command**

Modify `src/cli/create-program.ts`:

```ts
import { runPushCommand as defaultRunPushCommand } from "../commands/push-command.js";
```

Extend deps:

```ts
export interface CreateProgramDeps {
  runReviewCommand?: typeof defaultRunReviewCommand;
  runInitCommand?: typeof defaultRunInitCommand;
  runConfigCommand?: typeof defaultRunConfigCommand;
  runPushCommand?: typeof defaultRunPushCommand;
}
```

Inside `createProgram`:

```ts
const runPushCommand = deps.runPushCommand ?? defaultRunPushCommand;
```

Add command:

```ts
program.command("push").description("审查已暂存代码后提交并推送").action(async () => {
  const result = await runPushCommand(
    {},
    {
      onProgress: (message) => {
        process.stderr.write(`${formatProgressMessage(message)}\n`);
      },
    },
  );
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
});
```

Extend `formatProgressMessage` for new messages:

```ts
if (message.includes("检查 Git 状态")) return progressChalk.cyan(`🔍 ${message}`);
if (message.includes("已暂存变更")) return progressChalk.cyan(`📥 ${message}`);
if (message.includes("达到阈值")) return progressChalk.yellow(`⚠️ ${message}`);
if (message.includes("提交信息")) return progressChalk.magenta(`🧠 ${message}`);
if (message.includes("Git commit")) return progressChalk.yellow(`📝 ${message}`);
if (message.includes("推送")) return progressChalk.cyan(`🚀 ${message}`);
if (message.includes("push 流程完成")) return progressChalk.green(`✅ ${message}`);
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm.cmd test -- tests/cli/create-program.test.ts tests/commands/push-command.test.ts
```

Expected: PASS.

## Task 10: Final Documentation And Release Checks

**Files:**
- Modify: `README.md`
- Modify: `design.md`
- Modify: `docs/superpowers/specs/2026-07-07-ai-codeview-path-review-and-push-design.md` only if implementation deviates.

- [ ] **Step 1: Update README current commands**

Move `review --path` and `push` out of "0.2 规划命令" and into "常用命令":

```bash
ai-codeview review --path E:\code\demo\src\index.ts
ai-codeview push
```

Add:

```md
`push` 只处理已暂存代码。请先执行 `git add <file>`，再运行 `ai-codeview push`。
```

- [ ] **Step 2: Update current capabilities**

Add to README "当前能力":

```md
- 支持审查指定绝对路径的文件或目录。
- 支持审查已暂存代码后生成中文提交信息、提交并推送。
```

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm.cmd lint
pnpm.cmd test
pnpm.cmd build
npm.cmd pack --dry-run
```

Expected:

- lint exits 0.
- all Vitest tests pass.
- tsup build succeeds.
- npm dry-run package contains `README.md`, `dist/bin/ai-codeview.js`, source map, and `package.json`.

- [ ] **Step 4: Manual smoke commands**

Run:

```bash
node dist/bin/ai-codeview.js --help
node dist/bin/ai-codeview.js review --help
node dist/bin/ai-codeview.js push --help
```

Expected:

- help output includes `review --path`.
- help output includes `push`.
- output is Chinese.

## Self-Review

- Spec coverage: path review, absolute-path validation, staged-only push, `failOn` confirmation, Chinese commit message, edit-before-commit, no auto `git add`, progress messages, error codes, and version strategy are covered.
- Placeholder scan: no unresolved placeholder markers remain.
- Type consistency: `AiProvider.generateCommitMessage`, `ReviewCommandOptions.path`, `PushCommandDeps`, `CommitMessageDecision`, and new Git helper names are consistent across tasks.
