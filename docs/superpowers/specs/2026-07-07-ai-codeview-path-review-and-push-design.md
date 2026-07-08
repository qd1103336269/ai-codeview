# AI Codeview 0.2 路径审查与 Push 命令设计

## 1. 背景

AI Codeview 0.1 聚焦 Git diff 审查。0.2 扩展两个能力：

1. 审查指定绝对路径下的代码文件。
2. 新增 `ai-codeview push`，在提交和推送前先审查暂存区代码，并生成中文提交信息。

这两个能力仍然保持本地优先、用户可控、默认不自动修改代码的原则。

## 2. 目标

- 用户可以审查某个绝对路径对应的文件或目录，不必先制造 Git diff。
- 用户可以用一个命令完成“审查已暂存代码、确认风险、生成中文提交信息、提交、推送”。
- `push` 命令不自动 `git add`，只处理用户已经暂存的代码。
- 所有提交和推送动作必须可见、可确认，避免 CLI 替用户做不可预期操作。

## 3. 非目标

- 不做相对路径审查。
- 不做 glob 表达式输入，例如 `src/**/*.ts`。
- 不做自动修复代码。
- 不自动暂存未暂存文件。
- 不在第一版 `push` 中自动推断远程分支；默认使用 `git push`，由 Git 自身处理 upstream。
- 不在非交互环境里强制打开编辑器。

## 4. 路径审查

### 4.1 命令

```bash
ai-codeview review --path E:\code\demo\src\index.ts
ai-codeview review --path E:\code\demo\src
ai-codeview review --path E:\code\demo\src\a.ts --path E:\code\demo\src\b.ts
```

`--path` 可以重复传入。每个路径必须是绝对路径。

### 4.2 与现有参数的关系

`--path` 不能与以下输入来源参数同时使用：

- `--staged`
- `--base`

原因是 `--path` 审查的是文件当前内容，而 `--staged` / `--base` 审查的是 Git diff。两类输入语义不同，混用会让报告难以解释。

### 4.3 输入规则

- 如果路径不是绝对路径，返回退出码 `2`，提示用户传入绝对路径。
- 如果路径不存在，返回退出码 `2`。
- 如果路径是文件，审查该文件。
- 如果路径是目录，递归读取目录下文件。
- 二进制文件、lock 文件、构建产物、minified 文件按现有 ignore 规则跳过。
- 如果所有文件都被跳过，返回 no-op 报告，退出码 `0`。

### 4.4 安全规则

路径审查会把文件内容发送给 DeepSeek。发送前需要做敏感信息扫描：

- 扫描 API key、token、private key、常见云厂商密钥。
- 默认命中疑似密钥时中止审查，返回 `SECRET_DETECTED` 和退出码 `2`。
- 用户显式传入 `--allow-secrets` 或配置 `security.allowSecrets: true` 时才允许继续。

## 5. Push 命令

### 5.1 命令

```bash
ai-codeview push
```

默认流程：

1. 检查当前目录是否是 Git 仓库。
2. 检查是否存在已暂存变更。
3. 使用 `git diff --staged` 收集待提交代码。
4. 按现有 review 流程审查 staged diff。
5. 如果审查结果达到 `failOn` 阈值，展示报告并询问是否继续。
6. 如果用户选择取消，退出码 `1`，不提交、不推送。
7. 如果用户选择继续，或审查结果没有达到阈值，生成中文 commit message。
8. 展示 commit message，让用户选择：
   - 使用并继续。
   - 编辑后继续。
   - 取消提交。
9. 执行 `git commit -m <message>`。
10. 执行 `git push`。

### 5.2 暂存区边界

`push` 第一版只处理已暂存代码：

- 不执行 `git add .`。
- 不提交未暂存文件。
- 不提交未跟踪文件。
- 如果没有 staged diff，返回退出码 `2`，提示先执行 `git add`。

### 5.3 风险确认规则

默认只在审查结果达到 `failOn` 阈值时询问是否继续。例如默认 `failOn=high`：

- `critical` / `high`：展示报告并询问是否继续。
- `medium` / `low`：展示报告但不阻断流程。
- 无 finding：直接进入生成 commit message。

后续可增加：

```bash
ai-codeview push --strict
```

`--strict` 表示只要存在任何 finding 都询问是否继续。

### 5.4 Commit Message

提交信息由 DeepSeek 生成，要求：

- 使用中文。
- 默认采用 Conventional Commits 类型前缀，例如 `feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:`。
- 标题简短明确，优先描述用户价值或核心变更。
- 多文件复杂变更可以生成正文，但第一行必须可单独作为 commit subject。

示例：

```text
feat: 增加暂存区审查后推送流程
```

交互规则：

- 默认展示 AI 生成的提交信息。
- 用户确认后才提交。
- 用户可以编辑提交信息后继续。
- 用户可以取消，取消后不 commit、不 push。

### 5.5 非交互环境

如果检测到非 TTY 环境：

- 达到 `failOn` 阈值时直接中止，退出码 `1`。
- 不打开交互编辑器。
- 后续可通过 `--yes` 显式允许无交互提交，但第一版先不启用自动确认。

## 6. 进度信息

进度信息继续使用 `chalk` 前景色和 emoji，不使用背景色。

路径审查新增阶段：

```text
📂 校验输入路径...
📄 读取代码文件...
🔍 过滤无需审查的文件...
🤖 调用 DeepSeek 审查...
✅ 路径审查完成
```

Push 命令新增阶段：

```text
🔍 检查 Git 状态...
📥 收集已暂存变更...
🤖 调用 DeepSeek 审查代码...
⚠️ 发现达到阈值的问题，等待用户确认...
🧠 生成中文提交信息...
📝 创建 Git commit...
🚀 推送到远程分支...
✅ push 流程完成
```

## 7. 技术设计

新增或调整模块：

- `input/path-input.ts`：校验绝对路径、读取文件、目录递归、过滤文件。
- `security/detect-secrets.ts`：扩展为既能扫描 diff，也能扫描普通文件内容。
- `commands/review-command.ts`：支持 `--path` 输入来源。
- `commands/push-command.ts`：编排 staged review、风险确认、commit message 生成、commit、push。
- `git/git-client.ts`：新增 staged diff 检查、commit、push、状态读取方法。
- `review/commit-message.ts`：构建提交信息 prompt，校验 AI 返回。
- `cli/create-program.ts`：新增 `push` 命令和 `review --path` 参数。

交互依赖：

- 引入 `@inquirer/prompts`，用于确认、选择和编辑提交信息。

## 8. 错误与退出码

| 场景 | 退出码 | 行为 |
| --- | --- | --- |
| `--path` 不是绝对路径 | `2` | 提示必须传入绝对路径 |
| `--path` 不存在 | `2` | 提示路径不存在 |
| `--path` 与 `--staged` / `--base` 同时使用 | `2` | 提示输入来源冲突 |
| 路径审查命中疑似密钥 | `2` | 阻断发送给 DeepSeek |
| `push` 没有 staged diff | `2` | 提示先执行 `git add` |
| `push` 审查达到阈值且用户取消 | `1` | 不 commit、不 push |
| 用户取消提交信息确认 | `1` | 不 commit、不 push |
| `git commit` 失败 | `2` | 显示 Git 错误摘要 |
| `git push` 失败 | `2` | 显示 Git 错误摘要 |

## 9. 测试策略

路径审查测试：

- 非绝对路径返回错误。
- 不存在路径返回错误。
- 文件路径可以生成 review input。
- 目录路径递归读取文件。
- ignore 规则可以跳过 lock/build/minified 文件。
- 疑似密钥默认阻断。
- `--path` 与 `--staged` / `--base` 冲突时报错。

Push 命令测试：

- 没有 staged diff 时不调用 DeepSeek、不 commit、不 push。
- staged review 通过时生成中文 commit message。
- AI commit message 展示后，用户确认才执行 commit 和 push。
- 用户选择编辑时使用编辑后的提交信息。
- 达到 `failOn` 阈值时询问是否继续。
- 用户取消时不 commit、不 push。
- `git commit` 或 `git push` 失败时返回退出码 `2`。

## 10. 版本策略

如果 `0.1.0` 已经发布，本需求作为 `0.2.0` 发布。

如果 `0.1.0` 尚未成功发布，也可以先合入主线，但为了产品节奏清晰，推荐仍然按 `0.2.0` 规划和发布。
