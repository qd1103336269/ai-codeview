# AI Codeview 0.2 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining 0.2 safety and edge-case gaps for path review and `ai-codeview push`.

**Architecture:** Keep `review-command` as the canonical review pipeline and make `push-command` reuse the same deterministic preprocessing pieces: parse, secret scan, filter, chunk, review. Keep path input responsible for safely collecting readable text files and representing skipped binary or unreadable files as non-reviewable inputs.

**Tech Stack:** TypeScript, Commander, Vitest, existing `AppError`, `parseGitDiff`, `filterReviewFiles`, `detect-secrets`, and `@inquirer/prompts`.

---

### Task 1: Guard Push Against Secrets

**Files:**
- Modify: `tests/commands/push-command.test.ts`
- Modify: `src/commands/push-command.ts`

- [ ] **Step 1: Write the failing test**

Add a test proving `push` blocks a staged secret before provider review:

```ts
test("blocks staged push before provider review when diff contains a likely secret", async () => {
  const provider = providerReturning(passReport(), "feat: x");
  const commitStagedChanges = vi.fn();
  const pushCurrentBranch = vi.fn();

  const result = await runPushCommand(
    {},
    {
      collectGitDiff: vi.fn().mockResolvedValue(stagedDiffWithSecret()),
      provider,
      commitStagedChanges,
      pushCurrentBranch,
    },
  );

  expect(result.exitCode).toBe(2);
  expect(result.output).toContain("疑似密钥");
  expect(provider.review).not.toHaveBeenCalled();
  expect(provider.generateCommitMessage).not.toHaveBeenCalled();
  expect(commitStagedChanges).not.toHaveBeenCalled();
  expect(pushCurrentBranch).not.toHaveBeenCalled();
});
```

Add helper:

```ts
function stagedDiffWithSecret(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,1 +1,1 @@",
    "-const token = \"old\";",
    "+const token = \"sk-" + "1234567890abcdef1234567890abcdef\";",
  ].join("\n");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd test -- tests/commands/push-command.test.ts`

Expected: FAIL because `provider.review` is called instead of being blocked.

- [ ] **Step 3: Write minimal implementation**

In `src/commands/push-command.ts`, import `detectSecretsInDiffFiles`, parse staged diff once, and throw `SECRET_DETECTED` before filtering/chunking/reviewing:

```ts
const parsed = parseGitDiff(rawDiff);
assertNoSecrets(parsed);
```

Use the same user-facing error shape as `review-command`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd test -- tests/commands/push-command.test.ts`

Expected: PASS for the new test and existing push tests.

### Task 2: Reuse Review File Filtering In Push

**Files:**
- Modify: `tests/commands/push-command.test.ts`
- Modify: `src/commands/push-command.ts`

- [ ] **Step 1: Write the failing test**

Add a test proving ignored staged files do not reach the provider:

```ts
test("skips ignored staged files before push review", async () => {
  const provider = providerReturning(passReport(), "feat: x");

  const result = await runPushCommand(
    {},
    {
      collectGitDiff: vi.fn().mockResolvedValue(stagedIgnoredDiff()),
      provider,
      confirmCommitMessage: vi.fn().mockResolvedValue({ action: "confirm" }),
      commitStagedChanges: vi.fn().mockResolvedValue(undefined),
      pushCurrentBranch: vi.fn().mockResolvedValue(undefined),
    },
  );

  expect(result.exitCode).toBe(0);
  expect(provider.review).not.toHaveBeenCalled();
  expect(provider.generateCommitMessage).toHaveBeenCalledTimes(1);
});
```

Add helper:

```ts
function stagedIgnoredDiff(): string {
  return [
    "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
    "--- a/pnpm-lock.yaml",
    "+++ b/pnpm-lock.yaml",
    "@@ -1,1 +1,1 @@",
    "-lockfileVersion: '9.0'",
    "+lockfileVersion: '9.1'",
  ].join("\n");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd test -- tests/commands/push-command.test.ts`

Expected: FAIL because ignored files are still reviewed.

- [ ] **Step 3: Write minimal implementation**

In `push-command`, import and call `filterReviewFiles(parsed, config.ignore)` before chunking:

```ts
const filtered = filterReviewFiles(parsed, config.ignore);
const chunks = chunkReviewInput(filtered.reviewable, 40_000);
const report = chunks.length > 0 ? await reviewChunks({ chunks, provider }) : emptyReport();
```

Keep commit-message generation based on the original staged diff so the commit message can still describe the staged change.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd test -- tests/commands/push-command.test.ts`

Expected: PASS.

### Task 3: Treat Commit Message Editor Cancellation As User Cancellation

**Files:**
- Modify: `tests/commands/push-command.test.ts`
- Modify: `src/commands/push-command.ts`

- [ ] **Step 1: Write the failing test**

Add a test that an interactive cancellation-like error does not commit or push:

```ts
test("does not commit when commit message editing is cancelled", async () => {
  const commitStagedChanges = vi.fn();
  const pushCurrentBranch = vi.fn();

  const result = await runPushCommand(
    {},
    {
      collectGitDiff: vi.fn().mockResolvedValue(stagedDiff()),
      provider: providerReturning(passReport(), "feat: x"),
      confirmCommitMessage: vi.fn().mockRejectedValue(new Error("User force closed the prompt")),
      commitStagedChanges,
      pushCurrentBranch,
    },
  );

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("已取消");
  expect(commitStagedChanges).not.toHaveBeenCalled();
  expect(pushCurrentBranch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd test -- tests/commands/push-command.test.ts`

Expected: FAIL because prompt cancellation currently maps to unknown tool error with exit code `2`.

- [ ] **Step 3: Write minimal implementation**

Wrap commit-message confirmation in a helper that catches common prompt cancellation errors and returns `{ action: "cancel" }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd test -- tests/commands/push-command.test.ts`

Expected: PASS.

### Task 4: Safely Skip Binary Or Unreadable Path Files

**Files:**
- Modify: `tests/input/path-input.test.ts`
- Modify: `src/input/path-input.ts`

- [ ] **Step 1: Write the failing test**

Add a test proving binary-looking files under a reviewed directory are represented as skipped/non-reviewable rather than read as UTF-8 text:

```ts
test("marks binary path files as non-reviewable", async () => {
  const root = await makeTempDir();
  const file = join(root, "image.bin");
  await writeFile(file, Buffer.from([0, 1, 2, 3, 0]), "binary");

  const result = await collectPathReviewFiles({ paths: [file], ignore: [], cwd: root });

  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    path: "image.bin",
    additions: 0,
    deletions: 0,
    binary: true,
    raw: "",
    content: "",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd test -- tests/input/path-input.test.ts`

Expected: FAIL because binary files are currently decoded as text and marked `binary: false`.

- [ ] **Step 3: Write minimal implementation**

Read path files as `Buffer`, detect null bytes, and return a binary `PathReviewFile` with empty content instead of pseudo diff. Decode only non-binary buffers as UTF-8.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm.cmd test -- tests/input/path-input.test.ts`

Expected: PASS.

### Task 5: Final Verification

**Files:**
- Run only, no source changes expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm.cmd test -- tests/commands/push-command.test.ts tests/input/path-input.test.ts tests/cli/review-command.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm.cmd test
```

Expected: PASS for all tests.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm.cmd build
```

Expected: Build exits with code `0`.
