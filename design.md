# AI Codeview CLI 产品设计

## 1. 产品定位

AI Codeview 是一个面向开发者的本地优先 AI 代码审查 CLI 工具。它在代码提交前审查本地变更，指出潜在 bug、安全风险、测试缺口和可维护性问题，并在需要时作为提交或 CI 的质量守门员。

第一版聚焦本地 Git 变更：

```bash
ai-codeview review
```

工具会读取当前仓库的 diff，先做确定性的预处理，再把经过切分和过滤的代码变更交给 AI 审查，最后在终端输出结构化报告。后续版本可以扩展到指定文件/目录、GitHub PR、GitLab MR、编辑器集成和自动修复建议。

## 2. 产品目标

这个工具要帮助开发者在提交代码前回答四个问题：

1. 这次变更有没有引入 bug、安全问题或破坏性行为？
2. 这次变更有没有让代码更难读、更难测、更难维护？
3. 这次变更是否安全到可以提交或进入 CI？
4. 我能从这次审查里学到什么，下次写得更好？

目标用户：

- 希望在提交前做本地 AI 审查的个人开发者。
- 想要轻量级 AI 审查能力、但暂时不需要 SaaS 平台的小团队。
- 希望后续把同一个工具接入 CI 的项目维护者。

MVP 不做：

- 不做 Web 控制台。
- 不做多用户账号系统。
- 不做团队管理和计费。
- 默认不自动修改代码。
- 第一版不做全仓库索引。
- 不依赖项目自建云端后端。

## 3. MVP 范围

第一版输入来源：

- 审查当前 Git 工作区变更，即 `git diff`。
- 支持只审查暂存区变更，即 `git diff --staged`。

第一版 AI 审查维度：

- 严肃代码审查：bug、安全风险、破坏性变更、边界条件遗漏。
- 代码质量助手：可读性、结构、命名、复杂度、可维护性。
- 提交前守门员：根据严重等级阈值返回非 0 退出码。
- 学习型解释器：解释重要问题为什么成立，以及更好的处理方式。

第一版输出：

- 终端可读报告。
- Markdown 报告文件。
- JSON 报告，供 CI 或后续集成使用。

后续范围：

- 审查 Git commit 或 commit range。
- 审查 GitHub Pull Request。
- 审查 GitLab Merge Request。
- 审查本地 patch 文件。
- 在 PR/MR 中添加 inline comment。
- 生成修复建议 patch。
- 交互式修复规划。
- 已知问题 baseline 和 suppression。
- 仓库级自定义审查规则。

版本 0.2 当前范围：

- 审查指定绝对路径的代码文件或目录。
- 新增 `ai-codeview push`，只审查已暂存代码，审查通过或用户确认后生成中文提交信息、提交并推送。

## 4. CLI 命令设计

```bash
ai-codeview review
```

审查当前工作区变更，包括未暂存和已暂存变更。

```bash
ai-codeview review --staged
```

只审查暂存区变更，适合接入 pre-commit hook。

```bash
ai-codeview review --base main
```

审查当前分支相对 base 分支的变更。

```bash
ai-codeview review --format text
ai-codeview review --format markdown
ai-codeview review --format json
```

控制输出格式。

```bash
ai-codeview review --output review.md
```

把报告写入文件。

```bash
ai-codeview review --allow-secrets
```

用户确认风险后，允许包含疑似密钥的 diff 继续发送给配置的 AI provider。默认不允许。

```bash
ai-codeview review --fail-on high
```

当发现大于等于指定严重等级的问题时，返回退出码 `1`。

```bash
ai-codeview review --path E:\code\demo\src\index.ts
ai-codeview review --path E:\code\demo\src
```

审查指定绝对路径的文件或目录。`--path` 可以重复传入，但每个路径必须是绝对路径。`--path` 不能与 `--staged`、`--base` 同时使用，因为路径审查读取文件当前内容，而 Git 模式审查 diff。

```bash
ai-codeview push
```

只审查已暂存代码，不自动 `git add`。如果审查结果达到 `failOn` 阈值，则展示报告并询问用户是否继续。继续后由 AI 生成中文 commit message，用户确认或编辑后才执行 `git commit` 和 `git push`。

```bash
ai-codeview init
ai-codeview init --force
```

生成本地配置文件 `.ai-codeview.json`。默认不覆盖已有配置；用户显式传入 `--force` 时才覆盖。

```bash
ai-codeview config
```

打印最终生效的配置和 AI provider 设置。

后续命令：

```bash
ai-codeview review src/
ai-codeview review --pr 123
ai-codeview review --commit HEAD~1..HEAD
ai-codeview explain finding-id
ai-codeview fix finding-id
```

## 5. AI 能力放在哪一层

AI 不应该到处都用。这个工具应该把确定性、可测试、可控的逻辑留给程序，把需要判断力的部分交给 AI。

程序确定性处理层：

- 输入层：执行 Git 命令、读取 diff、判断运行模式、校验 Git 仓库状态。
- 上下文层：按文件和 hunk 切分 diff，识别语言，过滤生成文件/lock 文件/minified 文件/vendor 文件/二进制文件，估算 token 并切分大 diff。
- 输出层：校验 AI 返回结构，排序 findings，渲染 text/Markdown/JSON 报告，决定退出码。

AI 判断层：

- 审查层：判断 bug、安全风险、回归风险、边界条件遗漏、测试缺口、可维护性问题。
- 解释层：解释重要 finding 为什么成立，并绑定具体代码变更。
- 总结层：总结整体风险，判断是否建议提交，给出下一步动作。

这样分层的原因：

Git 操作、diff 切分、过滤、schema 校验、退出码必须稳定可测。AI 负责代码审查判断，不负责控制程序流程。这样工具更可控，后续接 CI 也更可靠。

## 6. 四类产品能力

严肃代码审查重点发现：

- 逻辑 bug。
- 边界条件处理错误。
- null、undefined、空值、超时、重试、并发问题。
- 注入、反序列化、密钥泄漏、路径穿越、鉴权绕过、权限判断错误等安全风险。
- API 行为破坏。
- 数据损坏风险。
- 测试缺失或测试覆盖不足。

代码质量助手重点发现：

- 控制流过度复杂。
- 命名含糊。
- 逻辑重复。
- 结构难测试。
- 隐式耦合。
- 错误处理过宽或过静默。
- 注释掩盖了代码本身的不清楚。

提交前守门员支持严重等级阈值：

```bash
ai-codeview review --fail-on high
```

严重等级：

- `critical`：很可能导致安全事故、数据损坏、严重故障或核心行为中断。
- `high`：很可能是 bug、严重回归或重要测试缺失。
- `medium`：有一定可能的问题或可维护性风险。
- `low`：轻微质量问题或可选优化。

退出码：

- `0`：没有达到阈值的问题。
- `1`：存在达到阈值的问题。
- `2`：工具、配置或运行时错误。

学习型解释器要求：

- 说明发生了什么变更。
- 说明为什么这个变更有风险。
- 说明更稳妥的实现应该考虑什么。
- 必要时给一个短例子。
- 默认不把报告变成教程，除非用户开启详细模式。

## 7. 报告模型

每个 finding 使用稳定结构：

```json
{
  "id": "ACV-0001",
  "severity": "high",
  "confidence": "medium",
  "category": "bug",
  "file": "src/auth/session.ts",
  "line": 42,
  "title": "过期会话可能被错误接受",
  "reason": "当前比较只检查日期，没有检查精确过期时间。",
  "suggestion": "使用时间戳比较过期时间，并补充边界时间测试。",
  "learning_note": "时间比较应统一使用同一种单位，避免边界偏差。"
}
```

报告摘要使用稳定结构：

```json
{
  "risk": "medium",
  "status": "fail",
  "summary": "本次变更整体范围可控，但有一个鉴权相关问题应在提交前修复。",
  "finding_counts": {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 3
  }
}
```

## 8. 技术架构

主流程：

```text
CLI 命令
  -> 配置解析器
  -> Git diff 收集器
  -> diff 解析器和文件分类器
  -> chunk 规划器
  -> AI 审查编排器
  -> 返回结构校验器
  -> finding 合并与去重器
  -> 报告渲染器
  -> 退出码解析器
```

模块划分：

- `cli`：解析命令行参数，调用应用服务，处理进程退出码。
- `config`：加载 `.ai-codeview.json`、`.ai-codeview.yaml`、环境变量和 CLI 参数覆盖。
- `git`：检测 Git 仓库，执行 `git diff`、`git diff --staged`，后续支持 commit range。
- `diff`：解析 unified diff，按文件和 hunk 切分，过滤不适合审查的文件，估算 token。
- `review`：构建 prompt，调用 AI provider，校验结构化返回，重试可恢复失败，合并 findings。
- `providers`：实现不同 AI provider 适配器，避免核心逻辑绑定具体模型厂商。
- `report`：渲染 text、Markdown、JSON 输出。
- `errors`：统一配置、Git、provider、schema、运行时错误。

## 9. 技术栈候选

项目需要选择一个主实现栈。MVP 不需要 Web 前端。

### 9.1 方案 A：Node.js + TypeScript

推荐作为 MVP 技术栈。

核心技术：

- 运行时：Node.js LTS。
- 语言：TypeScript。
- 包管理器：pnpm。
- CLI 框架：Commander.js 或 Clipanion。
- Git 调用：execa 或 Node.js child process wrapper。
- Schema 校验：Zod。
- 配置加载：cosmiconfig 或自定义 loader。
- 终端输出：chalk、ora、table renderer。
- 测试：Vitest。
- 构建：tsup 或 tsx + TypeScript compiler。
- 分发：带 `bin` 字段的 npm package。

AI 集成：

- 先做 provider 抽象。
- DeepSeek provider 适配器，基于 DeepSeek 的 OpenAI-compatible API。
- 默认模型使用 `deepseek-v4-pro`，速度/成本优先时可切换为 `deepseek-v4-flash`。
- Anthropic provider 适配器。
- Gemini provider 适配器。
- Ollama/本地模型适配器作为后续可选能力。

优点：

- 最适合 npm CLI 分发。
- TypeScript 类型系统适合约束结构化 AI 返回。
- 开发效率高，适合快速做 MVP。
- 对 JavaScript/TypeScript 项目用户天然友好。

缺点：

- 单文件二进制分发不如 Go/Rust 自然。
- 用户机器通常需要 Node.js，除非后续额外打包。

### 9.2 方案 B：Python CLI

核心技术：

- 运行时：Python 3.11+。
- CLI 框架：Typer 或 Click。
- 包和依赖管理：uv 或 Poetry。
- Schema 校验：Pydantic。
- Git 调用：subprocess 或 GitPython。
- 终端输出：Rich。
- 测试：pytest。
- 分发：pipx package。

优点：

- AI 生态强。
- Rich 很适合做漂亮的 CLI 报告。
- 脚本和数据处理开发体验好。

缺点：

- 跨平台分发和依赖管理比 npm CLI 更容易有摩擦。
- 对前端/Node 项目用户没有 npm 安装那么自然。

### 9.3 方案 C：Go CLI

核心技术：

- 语言：Go。
- CLI 框架：Cobra。
- Git 调用：os/exec。
- 配置：Viper。
- 测试：Go test。
- 分发：单文件二进制。

优点：

- 启动速度快。
- 单文件二进制分发体验好。
- 适合 CI 和开发者机器。

缺点：

- 结构化 AI 返回校验需要写更多代码。
- AI SDK 和 prompt 工程生态不如 TypeScript/Python 方便。

### 9.4 方案 D：Rust CLI

核心技术：

- 语言：Rust。
- CLI 框架：clap。
- Git 调用：std::process 或 git2。
- 配置：serde + config crate。
- 测试：cargo test。
- 分发：单文件二进制。

优点：

- 性能和可靠性很好。
- 单文件分发体验很好。

缺点：

- MVP 开发速度最慢。
- 实现复杂度最高。
- AI provider 集成和结构化输出处理摩擦更大。

### 9.5 推荐组合

第一版推荐：

- Node.js + TypeScript。
- pnpm。
- Commander.js。
- execa。
- Zod。
- Vitest。
- tsup。
- 先实现 DeepSeek provider 适配器。

推荐原因：

这个项目是开发者 CLI，需要快速迭代、结构化 AI 返回、跨平台可用和简单分发。TypeScript 在 MVP 阶段的开发速度、可维护性和 npm 分发生态之间最平衡。

## 10. 技术与 npm 包清单

本章节把 MVP 实际需要用到的技术和 npm 包单独列出来。上一章负责比较技术栈，这一章负责落到可安装、可实现的工程清单。

### 10.1 基础技术

- Node.js LTS：CLI 运行时。
- TypeScript：主开发语言。
- pnpm：包管理器。
- Git：读取本地 diff 的基础依赖，用户机器需要已安装 Git。
- DeepSeek API：提供 AI 代码审查能力。

### 10.2 MVP 生产依赖

| 用途 | npm 包 | 说明 |
| --- | --- | --- |
| CLI 参数解析 | `commander` | 定义 `review`、`init`、`config` 等命令和参数。 |
| 执行 Git 命令 | `execa` | 调用 `git diff`、`git diff --staged`、`git merge-base` 等命令。 |
| 解析 unified diff | `parse-diff` | 把 raw diff 拆成 files、chunks、changes，便于后续审查。 |
| Ignore 规则 | `ignore` | 处理 `.gitignore` 风格规则，过滤 lock/build/vendor/minified 文件。 |
| Schema 校验 | `zod` | 校验配置、AI 返回、finding/report 数据结构。 |
| DeepSeek API 调用 | `openai` | DeepSeek 提供 OpenAI-compatible API，可通过 `baseURL` 指向 `https://api.deepseek.com`。 |
| 配置文件查找 | `cosmiconfig` | 查找和加载 `.ai-codeview.json`、`.ai-codeview.yaml` 等配置。 |
| YAML 配置支持 | `yaml` | 当用户使用 `.ai-codeview.yaml` 时解析 YAML。 |
| 终端样式 | `chalk` | 渲染更丰富的彩色终端输出，用于严重等级、标题、文件路径、状态和摘要。Chalk 5 是 ESM 包，项目应按 ESM CLI 配置构建。 |
| 终端加载状态 | `ora` | AI 审查、diff 处理等耗时步骤显示 spinner。 |
| 终端表格 | `cli-table3` | 渲染 finding 摘要、严重等级统计等表格。 |
| 重试 | `p-retry` | Provider 请求失败或 AI 返回结构可修复时做有限重试。 |
| 并发控制 | `p-limit` | 多 chunk 审查时限制并发，避免请求过多或超限。 |
| 交互式命令 | `@inquirer/prompts` | 用于 `push` 命令中的继续确认、提交信息确认和编辑。 |

### 10.3 MVP 开发依赖

| 用途 | npm 包 | 说明 |
| --- | --- | --- |
| TypeScript 编译 | `typescript` | 类型检查和编译基础。 |
| Node 类型 | `@types/node` | Node.js API 类型定义。 |
| 本地运行 TS | `tsx` | 开发期直接运行 TypeScript CLI。 |
| 打包 | `tsup` | 构建发布用的 `dist` 输出。 |
| 单元测试 | `vitest` | 测试配置、diff parser、报告渲染器、退出码解析器等模块。 |
| 测试覆盖率 | `@vitest/coverage-v8` | 输出覆盖率报告。 |
| HTTP mock | `nock` | 测试 DeepSeek provider 适配器，不真实请求外部 API。 |
| 临时目录 | `tempy` | 集成测试中创建临时 Git fixture 仓库。 |
| ANSI 清理 | `strip-ansi` | 黄金样例测试中比较终端输出。 |
| 代码格式化 | `prettier` | 统一代码和文档格式。 |
| 代码检查 | `eslint` | 基础 lint。 |
| TS lint 支持 | `typescript-eslint` | TypeScript ESLint 配置与规则。 |

### 10.4 可选或后续依赖

| 用途 | npm 包 | 阶段 |
| --- | --- | --- |
| GitHub PR 接入 | `@octokit/rest` | 版本 0.3。 |
| GitLab MR 接入 | `@gitbeaker/rest` | 版本 0.3。 |
| 文件/目录快速扫描 | `fast-glob` 或 Node.js `fs` 递归 | 版本 0.2 可选；如果 Node 原生递归能力足够，优先不新增依赖。 |
| 本地缓存 | `cacache` 或 `keyv` | 基线、provider 响应缓存或规则缓存。 |
| JSON schema 输出 | `zod-to-json-schema` | 给 CI 或外部工具导出报告 schema。 |

### 10.5 暂不引入的包

- 暂不引入大型 Web 框架，因为 MVP 是纯 CLI。
- 暂不引入 ORM 或数据库，因为 MVP 不做服务端和历史记录库。
- 暂不引入 LangChain/LlamaIndex，第一版只需要稳定的 provider 适配器和结构化输出，不需要复杂 Agent 框架。
- 暂不引入 `simple-git`，MVP 用 `execa` 直接调用 Git，更容易控制命令、输出和错误。

### 10.6 终端输出样式规范

可以引入 `chalk` 丰富终端输出，但输出风格要服务于代码审查，不做花哨装饰。

建议样式：

- `critical`：红色加粗，用于必须处理的问题。
- `high`：红色，用于高风险问题。
- `medium`：黄色，用于中等风险问题。
- `low`：蓝色或灰色，用于轻微建议。
- 成功状态：绿色，例如无达到阈值的问题。
- 文件路径、行号、finding id：灰色或 dim，降低视觉噪音。
- 报告标题和分组标题：bold，不使用大段背景色。
- JSON 输出必须保持无颜色，保证机器可解析。

CLI 应支持：

```bash
ai-codeview review --color
ai-codeview review --no-color
```

默认行为：

- 终端 text 输出自动检测颜色支持。
- Markdown 和 JSON 输出默认不包含 ANSI 颜色。
- CI 环境默认减少 spinner 和动态输出，保留稳定文本。

0.2 进度信息：

- 路径审查：`📂 校验输入路径...`、`📄 读取代码文件...`、`🔍 过滤无需审查的文件...`、`🤖 调用 DeepSeek 审查...`、`✅ 路径审查完成`。
- Push 命令：`🔍 检查 Git 状态...`、`📥 收集已暂存变更...`、`🤖 调用 DeepSeek 审查代码...`、`⚠️ 发现达到阈值的问题，等待用户确认...`、`🧠 生成中文提交信息...`、`📝 创建 Git commit...`、`🚀 推送到远程分支...`、`✅ push 流程完成`。

### 10.7 Chalk vs picocolors 对比

`chalk` 和 `picocolors` 都能做终端颜色输出，但定位不同。

| 维度 | `chalk` | `picocolors` |
| --- | --- | --- |
| 定位 | 功能更完整的终端样式库 | 极简、极轻量的颜色函数库 |
| API 体验 | 支持链式组合，例如 `chalk.bold.red(text)` | 函数式组合，例如 `bold(red(text))` |
| 样式能力 | 颜色、背景色、加粗、dim、underline 等能力更完整 | 覆盖常用颜色和样式，能力够用但更克制 |
| 颜色检测 | 内置颜色级别检测，也支持 `--color`、`--no-color` 等控制 | 也支持颜色开关，但整体控制能力更轻 |
| 包体积 | 比 `picocolors` 大，但对 CLI 项目通常可接受 | 体积极小，适合极致轻量场景 |
| 模块格式 | Chalk 5 是 ESM-only，项目需要按 ESM CLI 设计 | 同时适合更多模块环境，接入更少踩坑 |
| 可读性 | 样式表达更直观，适合较复杂的报告输出 | 简洁直接，适合简单状态和少量颜色 |
| 适合场景 | 有分级报告、摘要、文件路径、状态、分组标题的 CLI | 只需要少量颜色、追求最小依赖的 CLI |

本项目推荐使用 `chalk`，原因是 AI 代码审查报告需要展示严重等级、风险摘要、文件路径、finding 分组、通过/失败状态等多层信息。`chalk` 的表达能力和可读性更适合这类结构化终端报告。

`picocolors` 的优势是轻量和简单。如果后续发现终端样式只需要非常少的颜色，或者希望进一步压缩依赖体积，可以再替换为 `picocolors`。这类替换应限制在 `report` 模块内部，不影响审查、Git、provider 和配置模块。

## 11. AI Provider 策略

AI 能力由 DeepSeek 提供。项目仍然保留 provider 抽象，但 MVP 的首个、默认、必选 provider 是 DeepSeek。

Provider 接口示意：

```ts
interface AiProvider {
  review(input: ReviewRequest): Promise<ReviewResponse>;
}
```

首个 provider：

- DeepSeek provider 适配器。
- API 形态：OpenAI-compatible API。
- Base URL：`https://api.deepseek.com`。
- API key 环境变量：`DEEPSEEK_API_KEY`。
- 默认模型：`deepseek-v4-pro`。
- 可选模型：`deepseek-v4-flash`。
- 默认推理设置：开启 `thinking`，`reasoning_effort` 使用 `high`，适合严肃代码审查。
- 避免在新项目中使用 `deepseek-chat` 和 `deepseek-reasoner`，这两个模型名将在 2026-07-24 15:59 UTC 废弃。

后续 provider：

- Anthropic。
- Gemini。
- Ollama/本地模型。
- 企业或自托管网关的自定义 base URL。

配置示例：

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "baseUrl": "https://api.deepseek.com",
  "thinking": true,
  "reasoningEffort": "high",
  "failOn": "high",
  "output": "text"
}
```

密钥策略：

- API key 默认从 `DEEPSEEK_API_KEY` 环境变量读取。
- 配置文件可以引用环境变量名，但默认不直接保存明文密钥。

## 12. Prompt 与返回策略

Prompt 应该：

- 明确角色：资深代码审查员。
- 包含审查维度和严重等级规则。
- 包含 diff chunk 和文件元信息。
- 要求 finding 尽量绑定具体变更行。
- 要求不要输出泛泛而谈或证据不足的问题。
- 要求返回结构化 JSON。

AI 输出必须经过 schema 校验。如果校验失败：

1. 使用修复 prompt 重试一次。
2. 如果仍然失败，返回工具错误退出码 `2`。
3. 在 verbose 模式保留足够的诊断信息。

AI 必须输出置信度：

- `high`：直接由 diff 支撑。
- `medium`：很可能成立，但可能依赖上下文。
- `low`：弱信号，默认不应该导致 gate 失败。

默认提交守门只对以下 finding 失败：

- severity 大于等于阈值。
- confidence 不等于 `low`。

## 13. 配置设计

默认配置文件：

```bash
.ai-codeview.json
```

示例：

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "baseUrl": "https://api.deepseek.com",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "thinking": true,
  "reasoningEffort": "high",
  "failOn": "high",
  "confidenceFloor": "medium",
  "review": {
    "security": true,
    "bugs": true,
    "quality": true,
    "tests": true,
    "learningNotes": true
  },
  "security": {
    "allowSecrets": false
  },
  "ignore": [
    "pnpm-lock.yaml",
    "package-lock.json",
    "dist/**",
    "build/**",
    "*.min.js"
  ],
  "output": {
    "format": "markdown",
    "file": null
  }
}
```

配置优先级：

1. CLI 参数。
2. 环境变量。
3. 项目配置。
4. 用户全局配置。
5. 内置默认值。

## 14. 异常场景与错误处理

开发前需要先梳理异常场景，并把它们转成清晰的错误类型、用户提示、退出码和测试用例。CLI 的失败体验很重要：用户应该知道发生了什么、是否需要自己处理、下一步怎么做。

### 14.1 统一处理原则

- 审查结果失败和工具运行失败要区分：发现 high/critical finding 是审查失败，退出码 `1`；工具自身异常是运行失败，退出码 `2`。
- 所有错误都要有短消息；`--verbose` 才输出详细诊断。
- 不打印 API key、完整请求头、包含密钥的配置内容。
- 默认错误信息面向普通开发者，避免只输出 stack trace。
- 可恢复异常可以重试，但重试次数必须有限。
- JSON 输出模式下，错误也应输出稳定 JSON 结构，方便 CI 解析。

### 14.2 退出码约定

| 退出码 | 含义 | 示例 |
| --- | --- | --- |
| `0` | 工具运行成功，且没有达到 gate 阈值的问题 | 无 high/critical finding |
| `1` | 工具运行成功，但审查结果没有通过 gate | `--fail-on high` 且存在 high finding |
| `2` | 工具、配置、环境、provider 或输出失败 | Git 不可用、API key 缺失、DeepSeek 请求失败 |

### 14.3 异常场景清单

| 分类 | 场景 | 用户提示 | 退出码 | 重试 | 测试覆盖 |
| --- | --- | --- | --- | --- | --- |
| 环境 | 当前目录不是 Git 仓库 | 提示用户进入 Git 仓库后再运行 | `2` | 否 | 集成测试 |
| 环境 | 用户机器未安装 Git | 提示安装 Git 或检查 PATH | `2` | 否 | 单元测试 mock |
| 环境 | Git 命令超时 | 提示 Git diff 执行超时，可用 `--verbose` 查看命令 | `2` | 否 | 单元测试 |
| 输入 | 没有可审查 diff | 输出 no-op 信息，不调用 DeepSeek | `0` | 否 | 集成测试 |
| 输入 | `--staged` 但没有 staged diff | 输出 staged no-op 信息 | `0` | 否 | 集成测试 |
| 输入 | `--base main` 找不到 base 分支 | 提示 base 不存在或需要 fetch | `2` | 否 | 单元测试 |
| 输入 | `--path` 不是绝对路径 | 提示必须传入绝对路径 | `2` | 否 | 单元测试 |
| 输入 | `--path` 指向不存在路径 | 提示路径不存在 | `2` | 否 | 单元测试 |
| 输入 | `--path` 与 `--staged` 或 `--base` 同时使用 | 提示输入来源冲突 | `2` | 否 | 单元测试 |
| 输入 | diff 体积超过上限 | 提示缩小范围，或后续支持 `--max-files` / `--max-tokens` | `2` | 否 | 单元测试 |
| 输入 | 文件路径包含空格或特殊字符 | 正常处理，不应误切分路径 | 取决于结果 | 否 | Diff parser 单元测试 |
| Diff | 二进制文件变更 | 跳过并在摘要中说明 skipped binary files | `0` 或 `1` | 否 | 单元测试 |
| Diff | lock/build/minified/vendor 文件 | 默认跳过，并统计 skipped files | `0` 或 `1` | 否 | Ignore 测试 |
| Diff | 删除文件 | 审查删除行为，不要求读取新内容 | 取决于结果 | 否 | Diff parser 单元测试 |
| Diff | rename/move 文件 | 保留 old/new path 信息 | 取决于结果 | 否 | Diff parser 单元测试 |
| Diff | 文件编码异常 | 跳过该文件并提示无法安全读取 | `0` 或 `2` | 否 | 单元测试 |
| 配置 | 配置文件 JSON/YAML 语法错误 | 提示配置文件路径和错误位置 | `2` | 否 | 单元测试 |
| 配置 | 配置字段类型错误 | 提示具体字段和期望类型 | `2` | 否 | Zod 测试 |
| 配置 | 未设置 `DEEPSEEK_API_KEY` | 提示设置环境变量 | `2` | 否 | 单元测试 |
| 配置 | model 不在允许列表 | 提示可用模型，如 `deepseek-v4-pro` | `2` | 否 | 单元测试 |
| DeepSeek | 401/403 鉴权失败 | 提示检查 `DEEPSEEK_API_KEY` | `2` | 否 | Provider mock 测试 |
| DeepSeek | 429 限流 | 提示稍后重试；内部做有限退避重试 | `2` | 是 | Provider mock 测试 |
| DeepSeek | 余额或配额不足 | 提示检查 DeepSeek 账户额度 | `2` | 否 | Provider mock 测试 |
| DeepSeek | 5xx 服务端错误 | 提示 provider 暂时不可用；有限重试 | `2` | 是 | Provider mock 测试 |
| DeepSeek | 网络超时或 DNS 失败 | 提示检查网络或代理配置 | `2` | 是 | Provider mock 测试 |
| DeepSeek | 请求超过模型上下文限制 | 提示缩小 diff 或降低 chunk size | `2` | 否 | Provider mock 测试 |
| AI 返回 | 返回不是合法 JSON | 使用 修复 prompt 重试一次 | `2` | 是 | Provider mock 测试 |
| AI 返回 | JSON 合法但 schema 不通过 | 使用 修复 prompt 重试一次，失败后提示结构无效 | `2` | 是 | Zod + provider 测试 |
| AI 返回 | finding 缺少文件或原因 | 丢弃该 finding 或触发 repair，避免输出不可行动建议 | `2` 或降级 | 是 | 单元测试 |
| AI 质量 | finding 置信度为 `low` | 默认不触发 gate，仍可在报告中展示 | `0` 或 `1` | 否 | Exit code 测试 |
| 输出 | `--output review.md` 路径不可写 | 提示检查路径和权限 | `2` | 否 | 单元测试 |
| 输出 | JSON 输出包含 ANSI 颜色 | 不允许，测试中用 `strip-ansi` 校验 | `2` 或测试失败 | 否 | 黄金样例测试 |
| CI | CI 环境中 spinner 导致日志混乱 | 自动关闭动态 spinner，输出稳定文本 | 取决于结果 | 否 | 单元测试 |
| 隐私 | diff 中疑似包含 secret | 警告用户，并可后续支持阻断云端请求 | `0`、`1` 或 `2` | 否 | 单元测试 |
| Push | 没有已暂存变更 | 提示先执行 `git add` | `2` | 否 | 单元测试 |
| Push | 审查达到 `failOn` 阈值且用户取消 | 不 commit、不 push | `1` | 否 | 单元测试 |
| Push | 用户取消提交信息确认 | 不 commit、不 push | `1` | 否 | 单元测试 |
| Push | `git commit` 失败 | 提示 Git commit 失败摘要 | `2` | 否 | 单元测试 |
| Push | `git push` 失败 | 提示 Git push 失败摘要 | `2` | 否 | 单元测试 |

### 14.4 错误对象模型

内部错误建议统一成结构化对象，方便终端、Markdown、JSON 输出复用。

```ts
type AppErrorCode =
  | "NOT_GIT_REPOSITORY"
  | "GIT_NOT_FOUND"
  | "NO_DIFF"
  | "INVALID_CONFIG"
  | "MISSING_API_KEY"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "DIFF_TOO_LARGE"
  | "AI_RESPONSE_INVALID"
  | "OUTPUT_WRITE_FAILED";

interface AppError {
  code: AppErrorCode;
  message: string;
  exitCode: 0 | 1 | 2;
  recoverable: boolean;
  suggestion?: string;
  details?: unknown;
}
```

`details` 只能在 `--verbose` 模式输出，并且输出前必须脱敏。

### 14.5 重试策略

- Git 命令失败默认不重试，因为多数是环境或参数问题。
- DeepSeek 429、5xx、网络超时可以用指数退避重试，默认最多 2 次。
- AI 返回结构不合法时，可以用 修复 prompt 重试 1 次。
- 配置错误、鉴权错误、API key 缺失不重试。
- 重试日志默认简短，`--verbose` 输出完整阶段信息。

## 15. 隐私与安全

CLI 会把代码 diff 发送给用户配置的 AI provider。

必须具备的安全措施：

- 第一次运行时提示：代码 diff 可能会发送给配置的 provider。
- 后续支持 本地模型 provider，用于私有仓库。
- 默认忽略常见 secret 文件。
- 当新增 diff 行中疑似出现密钥时，默认阻断审查并避免把 diff 发送给云端 provider；用户可通过 `--allow-secrets` 或 `security.allowSecrets: true` 显式放行。
- 除非用户主动输出报告文件，否则不持久化 raw diff 和 AI response。
- 日志中不能包含 API key。

后续企业能力：

- 允许覆盖 provider base URL。
- 允许接入自托管 AI gateway。
- 支持策略文件，禁止某些路径使用云端 AI。

## 16. 测试策略

单元测试：

- CLI 参数解析。
- 配置解析和优先级。
- Git wrapper 行为。
- Diff parser。
- Ignore pattern 匹配。
- Chunk planner。
- Zod response validation。
- Exit code resolver。
- Report renderers。

集成测试：

- 使用 fixture Git repository 运行 review command。
- 暂存区 diff。
- 无 diff 行为。
- 无效配置行为。
- Mock AI provider 成功和失败。

异常场景测试：

- 非 Git 仓库。
- Git 未安装或 Git 命令失败。
- `DEEPSEEK_API_KEY` 缺失。
- DeepSeek 401/403、429、5xx、网络超时。
- Diff 过大、二进制文件、rename/delete 文件。
- AI 返回非 JSON、schema 不通过、repair 后仍失败。
- 输出文件路径不可写。
- CI 环境关闭 spinner，JSON 输出不含 ANSI 颜色。

黄金样例测试：

- Markdown 报告输出。
- JSON 报告输出。
- Text 报告输出。

手动冒烟测试：

```bash
ai-codeview init
ai-codeview review
ai-codeview review --staged
ai-codeview review --format json
ai-codeview review --fail-on high
```

当前版本完整测试流程：

以下流程只覆盖 0.1 和 0.2 的本地能力，不包含 0.3 的 CI、PR/MR、commit range、baseline 或 suppression。

1. 基础自动化检查：

```bash
pnpm lint
pnpm test
pnpm build
```

通过标准：

- `lint` 无错误。
- `test` 全部通过，不允许只跑单个文件后直接判定版本可发布。
- `build` 成功生成 `dist`，`bin` 入口可被 Node 执行。

2. 按能力分组回归：

```bash
pnpm test -- tests/cli/create-program.test.ts tests/commands/init-command.test.ts tests/config/load-config.test.ts tests/errors/app-error.test.ts
pnpm test -- tests/git/git-client.test.ts tests/diff/parse-git-diff.test.ts tests/diff/filter-review-files.test.ts tests/diff/chunk-review-input.test.ts
pnpm test -- tests/review/prompt-builder.test.ts tests/review/review-orchestrator.test.ts tests/providers/deepseek-provider.test.ts
pnpm test -- tests/report/renderers.test.ts tests/report/exit-code.test.ts tests/security/detect-secrets.test.ts
pnpm test -- tests/input/path-input.test.ts tests/cli/review-command.test.ts
pnpm test -- tests/commands/push-command.test.ts tests/review/commit-message.test.ts
```

覆盖关系：

- CLI、配置、错误：`create-program`、`init-command`、`load-config`、`app-error`。
- Git diff 输入：`git-client`、`parse-git-diff`、`filter-review-files`、`chunk-review-input`。
- AI 审查链路：`prompt-builder`、`review-orchestrator`、`deepseek-provider`。
- 输出和 gate：`renderers`、`exit-code`。
- 隐私安全：`detect-secrets`。
- 0.2 路径审查：`path-input`、`review-command`。
- 0.2 push 流程：`push-command`、`commit-message`。

3. 不依赖真实 DeepSeek 的 CLI 冒烟：

在一个干净的临时 Git 仓库中执行，重点验证命令入口、配置读取、无 diff 行为和输出格式。

```bash
pnpm dev -- init --force
pnpm dev -- config
pnpm dev -- review --format json
```

通过标准：

- `init --force` 可以生成或覆盖 `.ai-codeview.json`。
- `config` 能打印最终生效配置，且不泄露 API key。
- 无 diff 时 `review --format json` 返回清楚 no-op 结果，不调用 DeepSeek。

4. 真实 DeepSeek 手动冒烟：

执行前设置环境变量，并只使用无敏感信息的小变更。

```powershell
$env:DEEPSEEK_API_KEY = "<your-deepseek-api-key>"
pnpm dev -- review
pnpm dev -- review --staged
pnpm dev -- review --format markdown
pnpm dev -- review --format json
pnpm dev -- review --fail-on high
pnpm dev -- review --path E:\code\demo\src\index.ts
pnpm dev -- review --path E:\code\demo\src
```

通过标准：

- `review` 能审查当前 Git diff。
- `review --staged` 只审查已暂存 diff。
- `markdown`、`json` 输出格式稳定，JSON 可被解析。
- `--fail-on high` 在存在 high 或 critical finding 时返回退出码 `1`，否则返回 `0`。
- `--path` 可以审查绝对路径文件和目录，并在发送给 DeepSeek 前执行过滤和敏感信息扫描。

5. `push` 命令安全冒烟：

`push` 会真实执行 `git commit` 和 `git push`，必须在临时仓库和临时远程仓库中验证。推荐先 `pnpm build`，然后在临时工作仓库里调用构建后的 CLI。

```powershell
pnpm build

mkdir E:\tmp\acv-smoke-remote.git
git init --bare E:\tmp\acv-smoke-remote.git
git clone E:\tmp\acv-smoke-remote.git E:\tmp\acv-smoke-work
cd E:\tmp\acv-smoke-work
git config user.name "AI Codeview Smoke"
git config user.email "smoke@example.com"

"console.log('smoke')" > index.js
git add index.js
node E:\code\ai\ai-codeview\dist\bin\ai-codeview.js push
git log --oneline -1
git status --short
```

通过标准：

- 没有暂存变更时，`push` 返回退出码 `2`，不 commit、不 push。
- 有暂存变更时，`push` 只审查 staged diff，不自动 `git add` 未暂存文件。
- 审查达到 `failOn` 阈值时，先展示报告并询问是否继续。
- 用户取消风险确认、提交信息确认或编辑流程时，不执行 commit 和 push。
- AI 生成中文 commit message，用户确认或编辑后执行 `git commit`。
- commit 成功后执行 `git push`，临时远程仓库能看到新提交。
- `git commit` 或 `git push` 失败时返回退出码 `2`，并给出清楚错误。

6. 反向和安全用例：

```powershell
pnpm dev -- review --path src
pnpm dev -- review --path E:\not-exist\missing.ts
pnpm dev -- review --path E:\code\demo\src\index.ts --staged
pnpm dev -- review --path E:\code\demo\src\index.ts --base main
pnpm dev -- push
```

通过标准：

- 相对路径、缺失路径、`--path` 与 Git diff 输入模式冲突时返回退出码 `2`。
- 命中疑似密钥时，默认阻断发送到 DeepSeek；只有显式 `--allow-secrets` 或配置放行后才继续。
- `push` 在没有 staged diff 时返回清楚提示，不创建提交。

7. 0.1/0.2 验收映射：

| 能力 | 必跑验证 |
| --- | --- |
| 本地 Git diff 审查 | `pnpm test`，真实 `pnpm dev -- review` 冒烟 |
| staged diff 审查 | `git-client`、`review-command` 测试，真实 `pnpm dev -- review --staged` 冒烟 |
| Text/Markdown/JSON 输出 | `renderers` 测试，真实 `--format markdown`、`--format json` 冒烟 |
| 配置文件 | `load-config`、`init-command` 测试，真实 `init`、`config` 冒烟 |
| DeepSeek provider | `deepseek-provider` mock 测试，真实 DeepSeek 小 diff 冒烟 |
| 严重等级 gate | `exit-code` 测试，真实 `--fail-on high` 冒烟 |
| `review --path <absolute-path>` | `path-input`、`review-command` 测试，真实文件和目录路径冒烟 |
| `ai-codeview push` | `push-command`、`commit-message` 测试，临时 bare remote 冒烟 |

## 17. MVP 里程碑

1. CLI 骨架：项目初始化、命令解析、配置加载、基础终端输出。
2. Git Diff 输入：检测 Git 仓库，收集 unstaged/staged diff，支持 `--staged` 和 `--base`。
3. Diff 处理：解析文件和 hunks，过滤 generated/ignored 文件，估算体积并切分 chunk。
4. AI 审查：Provider 接口、首个 provider 适配器、prompt builder、结构化返回校验、重试/修复流程。
5. 报告和 Gate：Text/Markdown/JSON report，严重等级阈值和退出码。
6. 质量收尾：测试、文档、示例配置、端到端 fixture 运行。

## 18. 路线图

版本 0.1：

- 本地 Git diff 审查。
- Text/Markdown/JSON 输出。
- 配置文件。
- DeepSeek provider 适配器。
- 严重等级 gate。

版本 0.2：

- 通过 `review --path <absolute-path>` 审查指定绝对路径的文件或目录。
- 新增 `push` 命令，只处理已暂存代码。
- Push 前先审查 staged diff，达到 `failOn` 阈值时询问是否继续。
- 使用 DeepSeek 生成中文 commit message，用户确认或编辑后再提交。
- 提交成功后执行 `git push`。

版本 0.3：

- Commit range 审查。
- GitHub PR 审查。
- GitLab MR 审查。
- 行内审查评论。
- CI 模板。
- 更多 provider 适配器。
- 更好的 token 预算。
- 基线抑制。

版本 0.4：

- 建议修复补丁。
- 交互式修复模式。
- Local model mode。
- 仓库规则包。

## 19. 待选择项

你后续需要选择：

1. 主实现语言：
   - 推荐：Node.js + TypeScript。
   - 可选：Python、Go、Rust。
2. 默认输出样式：
   - 已确定：默认在终端输出 Markdown，额外支持 text/JSON。
3. 默认 gate 阈值：
   - 推荐：`high`。
4. 包名：
   - 当前工作名：`ai-codeview`。

已确定项：

- AI 能力由 DeepSeek 提供。
- MVP 默认 provider 为 `deepseek`。
- MVP 默认模型为 `deepseek-v4-pro`。
- API key 通过 `DEEPSEEK_API_KEY` 读取。
- 0.2 的 `push` 命令只处理已暂存代码，不自动 `git add`。
- 0.2 的 commit message 使用中文，提交前必须等待用户确认，并支持用户编辑。
- 0.2 的审查阻断策略默认只在达到 `failOn` 阈值时询问是否继续。

## 20. MVP 验收标准

MVP 达成的标准：

- 在 Git 仓库内运行 `ai-codeview review` 可以审查当前变更。
- 在非 Git 仓库运行时返回清楚错误。
- 没有 diff 时返回清楚的 no-op 信息。
- Finding 包含 severity、confidence、category、file、title、reason、suggestion、learning note。
- `--fail-on high` 在存在 high 或 critical finding 时返回退出码 `1`。
- `--format json` 输出合法 JSON。
- 默认报告输出到终端，`--output review.md` 可以写入 Markdown 报告。
- 切换 AI provider 不需要改 CLI、Git、diff、report 模块。

0.2 验收标准：

- `ai-codeview review --path <absolute-path>` 可以审查指定文件或目录。
- 非绝对路径、路径不存在、`--path` 与 Git diff 输入模式冲突时返回清楚错误。
- 路径审查默认执行敏感信息扫描，命中疑似密钥时不发送给 DeepSeek。
- `ai-codeview push` 只读取 staged diff，没有暂存变更时不提交、不推送。
- `push` 审查达到 `failOn` 阈值时询问用户是否继续。
- 用户取消风险确认、提交信息确认或编辑流程时，不执行 commit 和 push。
- AI 生成中文 commit message，用户可确认或编辑后继续。
- `git commit` 和 `git push` 失败时返回退出码 `2` 并给出清楚提示。

