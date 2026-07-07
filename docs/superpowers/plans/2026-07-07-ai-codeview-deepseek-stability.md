# AI Codeview DeepSeek 稳定性实现计划

> **给 Agent 工作者：** 按任务逐步执行。推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 增强 DeepSeek provider 的稳定性：错误码细分、可恢复请求重试、AI JSON/schema 修复。

**架构：** 变更限制在 provider 层。`DeepSeekProvider` 继续实现 `AiProvider` 接口，内部新增请求执行、错误归类、JSON 解析和修复 prompt 逻辑。CLI、diff、审查编排层和报告层不感知 provider 的重试细节。

**技术栈：** TypeScript、OpenAI SDK 兼容客户端、Zod、Vitest、p-retry。

---

## 文件边界

- 修改 `src/providers/deepseek-provider.ts`：新增错误归类、有限重试、修复 prompt。
- 修改 `tests/providers/deepseek-provider.test.ts`：覆盖 401/403、429、5xx、网络错误、非 JSON 修复、schema 修复。
- 修改 `README.md`：记录 provider 稳定性行为。
- 修改 `docs/superpowers/plans/2026-07-07-ai-codeview-mvp.md` 不需要；实际 MVP 文件名是 `2026-07-07-ai-codeview-cli-mvp.md`，只在必要时更新延后项。

## 任务 1：错误码细分

- [x] 写失败测试：401/403 转为 `PROVIDER_AUTH_FAILED`，不重试。
- [x] 写失败测试：429 转为 `PROVIDER_RATE_LIMITED`。
- [x] 写失败测试：5xx 和网络错误转为 `PROVIDER_UNAVAILABLE`。
- [x] 实现错误归类函数。
- [x] 运行 `pnpm test -- tests/providers/deepseek-provider.test.ts`。

## 任务 2：可恢复请求重试

- [x] 写失败测试：429 第一次失败、第二次成功时返回报告，并调用两次。
- [x] 写失败测试：401 不重试，只调用一次。
- [x] 实现最多 2 次额外重试，总尝试次数最多 3 次。
- [x] 运行 `pnpm test -- tests/providers/deepseek-provider.test.ts`。

## 任务 3：AI 返回修复

- [x] 写失败测试：第一次返回非 JSON，第二次修复请求返回合法 report。
- [x] 写失败测试：第一次 JSON schema 不通过，第二次修复请求返回合法 report。
- [x] 写失败测试：修复后仍无效时抛出 `AI_RESPONSE_INVALID`。
- [x] 实现 修复 prompt，并只针对解析/schema 问题重试一次。
- [x] 运行 `pnpm test -- tests/providers/deepseek-provider.test.ts`。

## 任务 4：最终验证

- [x] 更新 README。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm build`。
- [x] 运行 `pnpm lint`。
- [x] 运行 `node dist/bin/ai-codeview.js config`。

## 注意

当前目录不是有效 Git 仓库，不能执行 worktree、commit、merge 或 PR 收尾。完成后只做本地文件修改和命令验证。
