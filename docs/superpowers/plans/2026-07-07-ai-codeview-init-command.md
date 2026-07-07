# AI Codeview init 命令实现计划

> **给 Agent 工作者：** 按任务逐步执行。推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 将 `ai-codeview init` 从打印默认配置升级为生成 `.ai-codeview.json`。

**架构：** `runInitCommand` 返回 `{ exitCode, output }`，并负责写配置文件。Commander 层只解析 `--force`、写 stdout、设置 `process.exitCode`。默认不覆盖已有文件，用户显式传 `--force` 时覆盖。

**技术栈：** TypeScript、Node.js fs/promises、Commander.js、Vitest。

---

## 文件边界

- 修改 `src/commands/init-command.ts`：写 `.ai-codeview.json`，支持 `force`。
- 修改 `src/cli/create-program.ts`：`init --force` 透传并设置退出码。
- 创建 `tests/commands/init-command.test.ts`：覆盖写入、拒绝覆盖、`force` 覆盖。
- 修改 `tests/cli/create-program.test.ts`：覆盖 `init --force` 参数透传。
- 修改 `README.md` 和 `design.md`：更新 init 行为说明。

## 任务 1：Init 命令写配置

- [x] 写失败测试：空目录运行 init 会创建 `.ai-codeview.json`。
- [x] 写失败测试：已有配置时默认不覆盖，返回 exitCode `2`。
- [x] 写失败测试：`force: true` 时覆盖已有配置。
- [x] 实现 `runInitCommand({ cwd, force })`。
- [x] 运行 `pnpm test -- tests/commands/init-command.test.ts`。

## 任务 2：Commander 接入

- [x] 写失败测试：`init --force` 传给 `runInitCommand`。
- [x] 修改 `createProgram`。
- [x] 运行 `pnpm test -- tests/cli/create-program.test.ts`。

## 任务 3：文档与验证

- [x] 更新 `README.md` 和 `design.md`。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm build`。
- [x] 运行 `pnpm lint`。
- [x] 运行 `node dist/bin/ai-codeview.js init --help`。

## 注意

当前目录不是有效 Git 仓库，不能执行 worktree、commit、merge 或 PR 收尾。完成后只做本地文件修改和命令验证。
