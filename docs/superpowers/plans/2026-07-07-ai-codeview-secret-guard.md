# AI Codeview 密钥保护实现计划

> **给 Agent 工作者：** 按任务逐步执行。推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 在调用 DeepSeek 前检测 diff 中疑似密钥的新增行，并默认阻断云端审查请求。

**架构：** 新增 `security` 模块负责纯函数检测，`review-command` 在 diff 解析后调用该模块。命中疑似密钥时抛出 `SECRET_DETECTED` AppError，退出码为 `2`；JSON 格式沿用现有结构化错误渲染。第一版只扫描新增 diff 行，不扫描全仓库文件。

**技术栈：** TypeScript、Vitest、现有 AppError、现有审查流水线。

---

## 文件边界

- 创建 `src/security/detect-secrets.ts`：检测新增 diff 行里的疑似密钥。
- 创建 `tests/security/detect-secrets.test.ts`：覆盖命中、忽略删除行、低误报场景。
- 修改 `src/errors/app-error.ts`：增加 `SECRET_DETECTED` 错误码。
- 修改 `src/commands/review-command.ts`：在 provider 调用前阻断。
- 修改 `tests/cli/review-command.test.ts`：覆盖阻断 provider 和 JSON 错误输出。
- 修改 `README.md`：记录隐私保护行为。

## 任务 1：密钥检测纯函数

- [x] 写失败测试：新增行里的 AWS access key、API key 赋值、private key 文件头会被检测。
- [x] 写失败测试：删除行里的密钥不会被检测。
- [x] 写失败测试：普通变量名和短 token 不会被检测。
- [x] 实现 `detectSecretsInDiffFiles(files)`。
- [x] 运行 `pnpm test -- tests/security/detect-secrets.test.ts`。

## 任务 2：接入审查流水线

- [x] 写失败测试：命中疑似密钥时不调用 provider，返回 `SECRET_DETECTED`。
- [x] 写失败测试：JSON 格式下 `SECRET_DETECTED` 输出结构化 JSON。
- [x] 修改 `runReviewCommand`。
- [x] 运行 `pnpm test -- tests/cli/review-command.test.ts`。

## 任务 3：文档与验证

- [x] 更新 `README.md`。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm build`。
- [x] 运行 `pnpm lint`。
- [x] 运行 `node dist/bin/ai-codeview.js config`。

## 注意

当前目录不是有效 Git 仓库，不能执行 worktree、commit、merge 或 PR 收尾。完成后只做本地文件修改和命令验证。
