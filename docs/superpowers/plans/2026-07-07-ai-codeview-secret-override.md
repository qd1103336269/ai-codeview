# AI Codeview 密钥保护放行实现计划

> **给 Agent 工作者：** 按任务逐步执行。推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 增加显式密钥保护放行能力，让用户可以用配置或 `--allow-secrets` 在确认风险后继续审查。

**架构：** 默认安全策略不变：疑似密钥会阻断 provider 调用。新增 `security.allowSecrets` 配置和 `review --allow-secrets` CLI 参数，二者任一为 `true` 时跳过密钥保护，但不改变密钥检测模块本身。

**技术栈：** TypeScript、Commander.js、Zod、Vitest。

---

## 文件边界

- 修改 `src/config/config-schema.ts`：增加 `security.allowSecrets` 默认值。
- 修改 `src/config/load-config.ts`：支持 CLI 覆盖项。
- 修改 `src/cli/create-program.ts`：增加 `--allow-secrets`。
- 修改 `src/commands/review-command.ts`：根据配置跳过密钥保护。
- 修改相关测试和文档。

## 任务 1：配置支持

- [x] 写失败测试：默认 `security.allowSecrets` 为 `false`。
- [x] 写失败测试：配置文件可设置 `security.allowSecrets: true`。
- [x] 写失败测试：CLI 覆盖项可覆盖为 `true`。
- [x] 实现配置 schema 和 override。
- [x] 运行 `pnpm test -- tests/config/load-config.test.ts`。

## 任务 2：CLI 参数透传

- [x] 写失败测试：`review --allow-secrets` 传给 `runReviewCommand`。
- [x] 实现 Commander 参数。
- [x] 运行 `pnpm test -- tests/cli/create-program.test.ts`。

## 任务 3：流水线放行

- [x] 写失败测试：`allowSecrets: true` 时命中疑似密钥仍调用 provider。
- [x] 写失败测试：配置文件 `security.allowSecrets: true` 时命中疑似密钥仍调用 provider。
- [x] 实现 review 流水线 条件判断。
- [x] 运行 `pnpm test -- tests/cli/review-command.test.ts`。

## 任务 4：文档与验证

- [x] 更新 `README.md` 和 `design.md`。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm build`。
- [x] 运行 `pnpm lint`。
- [x] 运行 `node dist/bin/ai-codeview.js review --help`。

## 注意

当前目录不是有效 Git 仓库，不能执行 worktree、commit、merge 或 PR 收尾。完成后只做本地文件修改和命令验证。
