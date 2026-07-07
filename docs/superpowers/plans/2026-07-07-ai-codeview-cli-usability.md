# AI Codeview CLI 易用性实现计划

> **给 Agent 工作者：** 按任务逐步执行。推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 补齐 AI Codeview CLI 的二期实用能力：配置文件发现、`--base` diff、`--fail-on`、`--output`、颜色开关和 JSON 错误输出。

**架构：** 继续保持 CLI 只负责参数解析，`config` 负责最终配置解析，`git` 负责 diff 收集，`commands/review-command` 串联流水线。新增行为全部先写测试，避免 CLI 参数和配置文件优先级互相污染。

**技术栈：** Node.js、TypeScript、Commander.js、cosmiconfig、execa、Zod、Vitest。

---

## 文件边界

- 修改 `src/config/load-config.ts`：增加配置文件发现和 CLI 覆盖项合并。
- 修改 `src/git/git-client.ts`：支持 `git diff <base>...HEAD`。
- 修改 `src/commands/review-command.ts`：接入最终配置、输出文件、颜色开关和 JSON 错误。
- 修改 `src/cli/create-program.ts`：新增 `--base`、`--fail-on`、`--output`、`--color`、`--no-color`。
- 修改 `src/commands/config-command.ts`：打印最终配置。
- 修改 `README.md`：补齐新命令示例。
- 增加或扩展对应测试文件。

## 任务 1：配置文件发现

- [x] 写失败测试：临时目录内存在 `.ai-codeview.json` 时，`loadConfig` 应读取并和默认值合并。
- [x] 写失败测试：CLI 覆盖项 应覆盖配置文件里的 `failOn`、`output.format`、`output.file`。
- [x] 实现 `loadConfig({ cwd, overrides })`。
- [x] 运行 `pnpm test -- tests/config/load-config.test.ts`。

## 任务 2：Git base diff

- [x] 写失败测试：`collectGitDiff({ mode: "base", base: "main" })` 调用 `git diff main...HEAD`。
- [x] 实现 base 模式。
- [x] 运行 `pnpm test -- tests/git/git-client.test.ts`。

## 任务 3：Review 命令实用参数

- [x] 写失败测试：`--fail-on medium` 影响 exit code gate。
- [x] 写失败测试：`--output review.md` 把报告写入文件。
- [x] 写失败测试：JSON 格式下工具错误输出稳定 JSON。
- [x] 写失败测试：`color: true` 时 text report 包含 ANSI，`color: false` 时不包含 ANSI。
- [x] 实现 `runReviewCommand` 对最终配置、写文件和错误渲染的支持。
- [x] 运行 `pnpm test -- tests/cli/review-command.test.ts`。

## 任务 4：Commander 参数和文档

- [x] 写或扩展 CLI 测试覆盖新增参数解析。
- [x] 修改 `createProgram`。
- [x] 修改 `README.md`。
- [x] 运行 `pnpm test`、`pnpm build`、`pnpm lint`、`node dist/bin/ai-codeview.js config`。

## 注意

当前目录不是有效 Git 仓库，不能执行 worktree、commit、merge 或 PR 收尾。完成后只做本地文件修改和命令验证。
