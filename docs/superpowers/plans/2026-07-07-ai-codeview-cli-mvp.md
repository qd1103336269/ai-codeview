# AI Codeview CLI MVP 实现计划

> **给 Agent 工作者：** 必须按任务逐步执行。推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 实现第一个可工作的 AI Codeview CLI：读取本地 Git diff，通过 DeepSeek 适配器完成代码审查，输出 text / Markdown / JSON 报告，并返回稳定退出码。

**架构：** 使用 TypeScript ESM 构建一个小而清晰的 CLI。`cli` 负责命令解析，`config` 负责配置解析，`git` 负责收集 diff，`diff` 负责解析、过滤和切分，`review` 负责编排 AI 审查，`providers` 隔离 DeepSeek 调用，`report` 负责输出，`errors` 负责统一错误模型。所有核心行为按 TDD 实现。

**技术栈：** Node.js LTS、TypeScript、pnpm、Commander.js、execa、parse-diff、ignore、Zod、OpenAI SDK（配置为 DeepSeek baseURL）、chalk、ora、cli-table3、p-retry、p-limit、Vitest、tsup、ESLint、Prettier。

---

## 1. 文件结构

需要创建或维护的源码文件：

- `package.json`：包信息、bin 入口、scripts、依赖。
- `tsconfig.json`：TypeScript ESM 配置。
- `tsup.config.ts`：CLI 构建配置。
- `vitest.config.ts`：测试配置。
- `eslint.config.js`：Lint 配置。
- `.gitignore`：忽略生成物、本地密钥和日志。
- `README.md`：基础使用说明。
- `src/bin/ai-codeview.ts`：CLI 可执行入口。
- `src/cli/create-program.ts`：Commander program 工厂。
- `src/commands/review-command.ts`：`review` 命令处理。
- `src/commands/init-command.ts`：`init` 命令处理。
- `src/commands/config-command.ts`：`config` 命令处理。
- `src/config/config-schema.ts`：Zod 配置 schema 和类型。
- `src/config/default-config.ts`：内置默认配置。
- `src/config/load-config.ts`：配置解析、环境变量和 CLI 覆盖。
- `src/errors/app-error.ts`：统一错误模型。
- `src/git/git-client.ts`：Git 命令封装。
- `src/diff/parse-git-diff.ts`：unified diff 解析。
- `src/diff/filter-review-files.ts`：ignore、generated、binary 文件过滤。
- `src/diff/chunk-review-input.ts`：审查输入切分。
- `src/review/review-schema.ts`：finding 和 report schema。
- `src/review/prompt-builder.ts`：DeepSeek 审查 prompt 构建。
- `src/review/review-orchestrator.ts`：多 chunk 审查编排。
- `src/providers/ai-provider.ts`：AI provider 接口。
- `src/providers/deepseek-provider.ts`：DeepSeek provider 实现。
- `src/report/exit-code.ts`：退出码计算。
- `src/report/json-report.ts`：JSON 报告渲染。
- `src/report/markdown-report.ts`：Markdown 报告渲染。
- `src/report/text-report.ts`：chalk 终端报告渲染。
- `src/index.ts`：测试和外部复用的导出入口。

需要创建的测试文件：

- `tests/config/load-config.test.ts`
- `tests/errors/app-error.test.ts`
- `tests/git/git-client.test.ts`
- `tests/diff/parse-git-diff.test.ts`
- `tests/diff/filter-review-files.test.ts`
- `tests/diff/chunk-review-input.test.ts`
- `tests/review/prompt-builder.test.ts`
- `tests/review/review-orchestrator.test.ts`
- `tests/providers/deepseek-provider.test.ts`
- `tests/report/exit-code.test.ts`
- `tests/report/renderers.test.ts`
- `tests/cli/review-command.test.ts`

---

## 2. 执行原则

- 每个功能先写失败测试，再写实现。
- 每个任务结束前运行该任务对应测试。
- 能用纯函数测试的模块优先做成纯函数。
- DeepSeek 调用必须通过 provider interface 隔离。
- CLI 命令不得直接散落业务逻辑，只做参数解析和服务调用。
- JSON 输出不能包含 ANSI 颜色。
- 工具运行失败用退出码 `2`，审查 gate 失败用退出码 `1`，无阻断问题用退出码 `0`。

---

## 3. 任务 1：项目脚手架

**文件：**

- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`tsup.config.ts`
- 创建：`vitest.config.ts`
- 创建：`eslint.config.js`
- 创建：`.gitignore`
- 创建：`README.md`
- 创建：`src/cli/create-program.ts`
- 创建：`src/bin/ai-codeview.ts`
- 创建：`src/index.ts`

- [ ] **步骤 1：创建 `package.json`**

要求：

- `name` 使用 `ai-codeview`。
- `type` 使用 `module`。
- `bin.ai-codeview` 指向 `./dist/bin/ai-codeview.js`。
- scripts 至少包含：`dev`、`build`、`test`、`test:watch`、`lint`、`format`。
- runtime 依赖包含：`commander`、`execa`、`parse-diff`、`ignore`、`zod`、`openai`、`cosmiconfig`、`yaml`、`chalk`、`ora`、`cli-table3`、`p-retry`、`p-limit`。
- dev 依赖包含：`typescript`、`@types/node`、`tsx`、`tsup`、`vitest`、`@vitest/coverage-v8`、`nock`、`tempy`、`strip-ansi`、`prettier`、`eslint`、`typescript-eslint`。

- [ ] **步骤 2：创建 TypeScript、tsup、Vitest 配置**

要求：

- TypeScript 使用严格模式。
- module 使用 ESM 友好的配置。
- tsup 输出 ESM，target 为 Node 20。
- CLI bundle 保留 shebang：`#!/usr/bin/env node`。
- Vitest 使用 Node 环境，并匹配 `tests/**/*.test.ts`。

- [ ] **步骤 3：创建最小 CLI 入口**

要求：

- `src/bin/ai-codeview.ts` 调用 `createProgram().parseAsync(process.argv)`。
- `src/cli/create-program.ts` 先只创建基础 program，包含 name、description、version。
- `src/index.ts` 导出 `createProgram`。

- [ ] **步骤 4：安装依赖**

运行：

```bash
pnpm install
```

预期：生成 lockfile，依赖安装成功。

- [ ] **步骤 5：验证脚手架**

运行：

```bash
pnpm build
```

预期：构建成功，生成 `dist/bin/ai-codeview.js`。

---

## 4. 任务 2：统一错误模型

**文件：**

- 创建：`src/errors/app-error.ts`
- 创建：`tests/errors/app-error.test.ts`

- [ ] **步骤 1：先写失败测试**

测试点：

- `AppError` 能保存 `code`、`message`、`exitCode`、`recoverable`、`suggestion`、`details`。
- `isAppError(error)` 能识别 `AppError`。
- `toAppError(error)` 对已知 `AppError` 原样返回。
- `toAppError(new Error(...))` 应包装成 `UNKNOWN_ERROR`，退出码为 `2`，默认消息为 `工具运行时发生未知错误。`。

运行：

```bash
pnpm test -- tests/errors/app-error.test.ts
```

预期：失败，原因是实现文件不存在。

- [ ] **步骤 2：实现 `AppError`**

要求：

- 定义 `AppErrorCode`，至少包含：`NOT_GIT_REPOSITORY`、`GIT_NOT_FOUND`、`NO_DIFF`、`INVALID_CONFIG`、`MISSING_API_KEY`、`PROVIDER_AUTH_FAILED`、`PROVIDER_RATE_LIMITED`、`PROVIDER_UNAVAILABLE`、`DIFF_TOO_LARGE`、`AI_RESPONSE_INVALID`、`OUTPUT_WRITE_FAILED`、`UNKNOWN_ERROR`。
- 定义 `AppExitCode = 0 | 1 | 2`。
- 实现 `AppError` class。
- 实现 `isAppError` 和 `toAppError`。

- [ ] **步骤 3：验证通过**

运行：

```bash
pnpm test -- tests/errors/app-error.test.ts
```

预期：通过。

---

## 5. 任务 3：配置 Schema 与加载

**文件：**

- 创建：`src/config/config-schema.ts`
- 创建：`src/config/default-config.ts`
- 创建：`src/config/load-config.ts`
- 创建：`tests/config/load-config.test.ts`

- [ ] **步骤 1：先写失败测试**

测试点：

- 空配置会使用 DeepSeek 默认值。
- 默认 provider 为 `deepseek`。
- 默认 model 为 `deepseek-v4-pro`。
- 默认 baseUrl 为 `https://api.deepseek.com`。
- 默认 apiKeyEnv 为 `DEEPSEEK_API_KEY`。
- 默认 failOn 为 `high`。
- 非法 severity，例如 `urgent`，应抛出 `INVALID_CONFIG`。
- CLI 参数可以覆盖配置文件值，例如 `failOn` 和 `output.format`。

运行：

```bash
pnpm test -- tests/config/load-config.test.ts
```

预期：失败，原因是配置模块不存在。

- [ ] **步骤 2：实现配置 schema**

要求：

- 使用 Zod 定义 `severitySchema`：`critical`、`high`、`medium`、`low`。
- 使用 Zod 定义 `outputFormatSchema`：`text`、`markdown`、`json`。
- 定义 `aiCodeviewConfigSchema`。
- model 只允许 `deepseek-v4-pro`、`deepseek-v4-flash`。
- 默认开启 `thinking: true`。
- 默认 `reasoningEffort: high`。
- 默认 ignore 包含：`pnpm-lock.yaml`、`package-lock.json`、`dist/**`、`build/**`、`*.min.js`。

- [ ] **步骤 3：实现加载与覆盖逻辑**

要求：

- `loadConfigFromObject(value)` 负责解析对象配置。
- Zod 校验失败时抛出 `AppError`，code 为 `INVALID_CONFIG`，exitCode 为 `2`。
- `resolveConfig(value, overrides)` 支持 CLI 参数覆盖配置。

- [ ] **步骤 4：验证通过**

运行：

```bash
pnpm test -- tests/config/load-config.test.ts
```

预期：通过。

---

## 6. 任务 4：审查 Schema 与退出码

**文件：**

- 创建：`src/review/review-schema.ts`
- 创建：`src/report/exit-code.ts`
- 创建：`tests/report/exit-code.test.ts`

- [ ] **步骤 1：先写失败测试**

测试点：

- finding 低于 `failOn` 阈值时返回退出码 `0`。
- finding 达到 severity 和 confidence 阈值时返回退出码 `1`。
- `critical` 但 confidence 为 `low` 时，默认不触发 gate。

运行：

```bash
pnpm test -- tests/report/exit-code.test.ts
```

预期：失败，原因是 report 模块不存在。

- [ ] **步骤 2：实现 review schema**

要求：

- `confidenceSchema` 包含 `high`、`medium`、`low`。
- finding 字段包含：`id`、`severity`、`confidence`、`category`、`file`、`line?`、`title`、`reason`、`suggestion`、`learningNote?`。
- report 字段包含：`risk`、`status`、`summary`、`findingCounts`、`findings`。

- [ ] **步骤 3：实现退出码计算**

要求：

- severity 排序：`critical > high > medium > low`。
- confidence 排序：`high > medium > low`。
- 同时满足 severity 阈值和 confidence 阈值才返回 `1`。

- [ ] **步骤 4：验证通过**

运行：

```bash
pnpm test -- tests/report/exit-code.test.ts
```

预期：通过。

---

## 7. 任务 5：报告渲染器

**文件：**

- 创建：`src/report/json-report.ts`
- 创建：`src/report/markdown-report.ts`
- 创建：`src/report/text-report.ts`
- 创建：`tests/report/renderers.test.ts`

- [ ] **步骤 1：先写失败测试**

测试点：

- JSON 输出可被 `JSON.parse` 解析。
- JSON 输出不包含 ANSI 颜色。
- Markdown 输出包含 `# AI 代码审查报告`、`## 问题列表` 和 finding 标题。
- Text 输出经 `strip-ansi` 后仍可读，包含标题、severity、文件路径和行号。

运行：

```bash
pnpm test -- tests/report/renderers.test.ts
```

预期：失败，原因是渲染器不存在。

- [ ] **步骤 2：实现 JSON 渲染**

要求：

- `renderJsonReport(report)` 返回格式化 JSON 字符串。
- 不允许引入 chalk 或 ANSI 颜色。

- [ ] **步骤 3：实现 Markdown 渲染**

要求：

- 包含标题、状态、风险、摘要和 findings。
- 每个 finding 输出 severity、confidence、category、location、reason、suggestion、learningNote。

- [ ] **步骤 4：实现 text 渲染**

要求：

- 使用 `chalk`。
- `critical` 红色加粗。
- `high` 红色。
- `medium` 黄色。
- `low` 蓝色或灰色。
- 支持 `{ color: boolean }`，关闭颜色时输出纯文本。

- [ ] **步骤 5：验证通过**

运行：

```bash
pnpm test -- tests/report/renderers.test.ts
```

预期：通过。

---

## 8. 任务 6：Git diff 收集与解析

**文件：**

- 创建：`src/git/git-client.ts`
- 创建：`src/diff/parse-git-diff.ts`
- 创建：`tests/git/git-client.test.ts`
- 创建：`tests/diff/parse-git-diff.test.ts`

- [ ] **步骤 1：先写 diff parser 失败测试**

测试点：

- 能从 unified diff 提取文件路径。
- 能计算 additions 和 deletions。
- 能保留 raw diff。

运行：

```bash
pnpm test -- tests/diff/parse-git-diff.test.ts
```

预期：失败，原因是 parser 不存在。

- [ ] **步骤 2：实现 diff parser**

要求：

- 使用 `parse-diff`。
- 输出 `ReviewFileDiff`：`path`、`oldPath?`、`additions`、`deletions`、`raw`、`binary`。
- 对 rename/move 保留 old path。
- 对 binary 或无 chunk 文件标记 `binary: true`。

- [ ] **步骤 3：先写 Git client 失败测试**

测试点：

- `mode: staged` 时执行 `git diff --staged`。
- `mode: working-tree` 时执行 `git diff`。
- diff 为空时抛出 `NO_DIFF`，exitCode 为 `0`。
- Git 命令失败时抛出 `GIT_NOT_FOUND` 或统一工具错误。

运行：

```bash
pnpm test -- tests/git/git-client.test.ts
```

预期：失败，原因是 Git client 不存在。

- [ ] **步骤 4：实现 Git client**

要求：

- 使用 `execa` 调用 Git。
- 支持依赖注入 `run`，方便测试。
- 不直接 `process.exit`。
- 所有错误转换为 `AppError`。

- [ ] **步骤 5：验证通过**

运行：

```bash
pnpm test -- tests/diff/parse-git-diff.test.ts tests/git/git-client.test.ts
```

预期：通过。

---

## 9. 任务 7：Diff 过滤与切分

**文件：**

- 创建：`src/diff/filter-review-files.ts`
- 创建：`src/diff/chunk-review-input.ts`
- 创建：`tests/diff/filter-review-files.test.ts`
- 创建：`tests/diff/chunk-review-input.test.ts`

- [ ] **步骤 1：先写过滤失败测试**

测试点：

- 跳过 lock 文件。
- 跳过 `dist/**`。
- 跳过 `*.min.js`。
- 跳过 binary 文件。
- 返回 `reviewable` 和 `skipped` 两组结果。

运行：

```bash
pnpm test -- tests/diff/filter-review-files.test.ts
```

预期：失败，原因是过滤模块不存在。

- [ ] **步骤 2：实现文件过滤**

要求：

- 使用 `ignore` 包。
- skipped 项包含 `path` 和 `reason`。
- reason 至少包含 `ignored`、`binary`。

- [ ] **步骤 3：先写 chunking 失败测试**

测试点：

- 多个文件能按 max characters 切成多个 chunk。
- 每个 chunk 包含 id、files、raw。
- 不应丢失文件顺序。

运行：

```bash
pnpm test -- tests/diff/chunk-review-input.test.ts
```

预期：失败，原因是 chunking 模块不存在。

- [ ] **步骤 4：实现 chunking**

要求：

- 函数名：`chunkReviewInput(files, maxCharacters)`。
- chunk id 使用 `chunk-1`、`chunk-2`。
- 单个文件超过 maxCharacters 时仍要形成独立 chunk，不丢弃。

- [ ] **步骤 5：验证通过**

运行：

```bash
pnpm test -- tests/diff/filter-review-files.test.ts tests/diff/chunk-review-input.test.ts
```

预期：通过。

---

## 10. 任务 8：Prompt 构建器 与 DeepSeek Provider

**文件：**

- 创建：`src/providers/ai-provider.ts`
- 创建：`src/providers/deepseek-provider.ts`
- 创建：`src/review/prompt-builder.ts`
- 创建：`tests/review/prompt-builder.test.ts`
- 创建：`tests/providers/deepseek-provider.test.ts`

- [ ] **步骤 1：先写 prompt 失败测试**

测试点：

- prompt 包含 senior code reviewer 角色。
- prompt 包含 severity 和 confidence 规则。
- prompt 包含文件路径。
- prompt 包含 diff 内容。
- prompt 明确要求只返回 JSON。

运行：

```bash
pnpm test -- tests/review/prompt-builder.test.ts
```

预期：失败，原因是 prompt builder 不存在。

- [ ] **步骤 2：实现 prompt builder**

要求：

- 输入包含 `chunkId`、`diff`、`files`。
- 输出完整 prompt 字符串。
- 明确审查维度：bug、安全、破坏性变更、测试缺失、可维护性。
- 明确返回字段：`risk`、`status`、`summary`、`findingCounts`、`findings`。

- [ ] **步骤 3：先写 DeepSeek provider 失败测试**

测试点：

- provider 使用配置里的 model。
- provider 发送 messages。
- provider 能解析 JSON response。
- provider 用 Zod 校验返回 schema。
- provider 可注入 mock `createChatCompletion`，测试不真实请求网络。

运行：

```bash
pnpm test -- tests/providers/deepseek-provider.test.ts
```

预期：失败，原因是 provider 不存在。

- [ ] **步骤 4：实现 provider interface**

要求：

- `AiProvider` 暴露 `review(request): Promise<ReviewReport>`。
- `ReviewRequest` 至少包含 `prompt`。

- [ ] **步骤 5：实现 DeepSeek provider**

要求：

- 使用 `openai` SDK。
- `baseURL` 使用 `https://api.deepseek.com`。
- API key 从调用方传入，不在 provider 内直接读取环境变量。
- 支持模型：`deepseek-v4-pro`、`deepseek-v4-flash`。
- 请求设置 `response_format: { type: "json_object" }`。
- 空响应或 schema 错误抛出 `AI_RESPONSE_INVALID`。

- [ ] **步骤 6：验证通过**

运行：

```bash
pnpm test -- tests/review/prompt-builder.test.ts tests/providers/deepseek-provider.test.ts
```

预期：通过。

---

## 11. 任务 9：审查编排器

**文件：**

- 创建：`src/review/review-orchestrator.ts`
- 创建：`tests/review/review-orchestrator.test.ts`

- [ ] **步骤 1：先写失败测试**

测试点：

- 能遍历多个 chunk 调用 provider。
- 能合并 findings。
- 能重新生成稳定 finding id，例如 `ACV-0001`。
- 能统计 `critical`、`high`、`medium`、`low`。
- 能根据 findings 生成整体 risk 和 status。

运行：

```bash
pnpm test -- tests/review/review-orchestrator.test.ts
```

预期：失败，原因是 orchestrator 不存在。

- [ ] **步骤 2：实现 orchestrator**

要求：

- 输入：`chunks` 和 `provider`。
- 每个 chunk 调用 `buildReviewPrompt`。
- 每个 prompt 交给 `provider.review`。
- 合并所有 findings。
- 生成 findingCounts。
- 有 high 或 critical 时 status 为 `fail`，否则为 `pass`。

- [ ] **步骤 3：验证通过**

运行：

```bash
pnpm test -- tests/review/review-orchestrator.test.ts
```

预期：通过。

---

## 12. 任务 10：CLI 命令

**文件：**

- 修改：`src/cli/create-program.ts`
- 创建：`src/commands/review-command.ts`
- 创建：`src/commands/init-command.ts`
- 创建：`src/commands/config-command.ts`
- 创建：`tests/cli/review-command.test.ts`

- [ ] **步骤 1：先写 CLI 失败测试**

测试点：

- `runReviewCommand` 遇到 `NO_DIFF` 时返回 exitCode `0`。
- 输出包含 `没有发现可审查的 diff。`。
- 命令函数不直接调用 `process.exit`。

运行：

```bash
pnpm test -- tests/cli/review-command.test.ts
```

预期：失败，原因是 command 模块不存在。

- [ ] **步骤 2：实现 `review` command handler**

要求：

- 支持参数：`staged`、`format`。
- 支持依赖注入 `collectGitDiff`，便于测试。
- 捕获异常并转成 `CommandResult`。
- `CommandResult` 包含 `exitCode` 和 `output`。

- [ ] **步骤 3：实现 `init` command handler**

要求：

- 输出默认配置 JSON。
- 默认 provider 为 `deepseek`。
- 默认 model 为 `deepseek-v4-pro`。
- 默认 apiKeyEnv 为 `DEEPSEEK_API_KEY`。

- [ ] **步骤 4：实现 `config` command handler**

要求：

- 输出当前默认配置。
- 后续可接入配置文件解析。

- [ ] **步骤 5：实现 Commander program**

要求：

- 命令：`review`、`init`、`config`。
- `review` 支持 `--staged` 和 `--format <format>`。
- command action 写 stdout，并设置 `process.exitCode`。

- [ ] **步骤 6：验证通过**

运行：

```bash
pnpm test -- tests/cli/review-command.test.ts
pnpm build
```

预期：测试通过，构建成功。

---

## 13. 任务 11：串起完整 审查流水线

**文件：**

- 修改：`src/commands/review-command.ts`
- 修改：`src/index.ts`
- 修改：`tests/cli/review-command.test.ts`

- [ ] **步骤 1：扩展 CLI 成功路径失败测试**

测试点：

- mock `collectGitDiff` 返回一个有效 diff。
- mock provider 返回无问题报告。
- `runReviewCommand({ format: "text" })` 返回 exitCode `0`。
- 输出包含 `AI 代码审查报告`。

运行：

```bash
pnpm test -- tests/cli/review-command.test.ts
```

预期：失败，原因是完整 流水线 尚未接入。

- [ ] **步骤 2：串起 流水线**

`runReviewCommand` 应按顺序执行：

1. `collectGitDiff`
2. `parseGitDiff`
3. `filterReviewFiles`
4. `chunkReviewInput`
5. `reviewChunks`
6. `resolveExitCode`
7. 根据 format 调用 `renderJsonReport` / `renderMarkdownReport` / `renderTextReport`

要求：

- provider 通过依赖注入传入，测试不真实调用 DeepSeek。
- 没有 provider 时返回工具错误，exitCode 为 `2`。
- JSON 输出不能带颜色。
- text 输出默认可先关闭颜色，后续再接 `--color`。

- [ ] **步骤 3：验证通过**

运行：

```bash
pnpm test -- tests/cli/review-command.test.ts
```

预期：通过。

---

## 14. 任务 12：最终验证与 README

**文件：**

- 修改：`README.md`

- [ ] **步骤 1：更新 README**

README 至少包含：

- 项目简介。
- DeepSeek API key 设置方式。
- 开发命令。
- 构建命令。
- 基础 CLI 命令示例：`review`、`review --staged`、`review --format json`、`init`、`config`。

- [ ] **步骤 2：运行完整测试**

运行：

```bash
pnpm test
```

预期：所有测试通过。

- [ ] **步骤 3：运行构建**

运行：

```bash
pnpm build
```

预期：构建成功。

- [ ] **步骤 4：运行 CLI 冒烟测试**

运行：

```bash
node dist/bin/ai-codeview.js config
```

预期：输出 JSON 配置，其中包含 `"provider": "deepseek"`，退出码为 `0`。

- [ ] **步骤 5：记录本阶段刻意延后项**

延后项：

- PR/MR 集成和 suggested patch 生成。
- 基线抑制。

---

## 15. 自检清单

实现完成前必须确认：

- [ ] 每个新增模块都有对应测试。
- [ ] 每个测试先经历失败，再实现通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm build` 通过。
- [ ] `node dist/bin/ai-codeview.js config` 能输出 DeepSeek 默认配置。
- [ ] JSON 输出没有 ANSI 颜色。
- [ ] `NO_DIFF` 返回 exitCode `0`。
- [ ] 工具异常返回 exitCode `2`。
- [ ] Gate 失败返回 exitCode `1`。

---

## 16. 执行建议

推荐在当前会话中按 Inline Execution 执行，因为项目目前是空仓库起步，连续上下文更容易保证模块命名、类型和测试一致。

执行顺序严格按任务 1 到任务 12，不要跳过 TDD 的失败测试阶段。
