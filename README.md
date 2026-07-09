# AI Codeview

AI Codeview 是一个本地优先的 AI 代码审查命令行工具。它可以审查本地 Git 变更，也可以审查指定路径的代码文件或目录，并使用 DeepSeek 输出中文代码审查报告。

安装后可以使用三个等价命令：

- `ai-codeview`：完整命令名，适合脚本和文档。
- `acv`：推荐简写命令，适合日常终端使用。
- `ac`：兼容简写命令。PowerShell 默认也有 `ac` alias，可能会冲突；Windows 用户优先使用 `acv`。

例如：

```bash
ai-codeview review --staged
acv review --staged
```

## 适用场景

AI Codeview 适合在提交前做一次本地 AI 代码审查，帮助你发现明显 bug、安全风险、测试缺口和可维护性问题。

适合：

- 个人项目或小团队在提交前快速审查本地变更。
- 希望用中文报告理解这次代码变更风险。
- 希望在 `git commit` 和 `git push` 前增加一道轻量 gate。
- 希望审查指定路径下的文件或目录。

不适合：

- 替代人工 code review 或安全审计。
- 审查不允许发送给外部 AI provider 的敏感私有代码。
- 在没有配置 DeepSeek API Key 的环境中直接使用 AI 审查能力。

## 官网

AI Codeview 官网规划中。后续会提供一个在线网页，用于介绍产品定位、核心能力、安装方式、使用示例、版本路线图和发布说明。

官网上线后，可以在这里补充访问地址：

```text
https://your-domain.example
```

## 前置条件

使用前请确认：

- 已安装 Node.js 20 或更高版本。
- 已安装 Git，并且可以在终端中运行 `git --version`。
- 有可用的 DeepSeek API Key。
- 当前网络可以访问 `https://api.deepseek.com`。
- 运行 Git diff 审查时，需要在 Git 仓库目录内执行命令。
- 使用 `push` 命令时，需要已经配置 Git 用户名、邮箱、远程仓库和 push 权限。

`push` 命令优先处理已暂存代码。没有暂存变更但存在工作区修改时，它会询问是否执行 `git add -A` 后继续。
在脚本或 CI 等非交互式环境中，请使用 `acv push --non-interactive`，并在运行前手动暂存要提交的文件。

```bash
git add <file>
```

## 安装

全局安装：

```bash
npm install -g ai-codeview
```

确认安装成功：

```bash
acv --help
ai-codeview --help
```

如果你使用的终端里 `ac` 没有和系统 alias 冲突，也可以运行：

```bash
ac --help
```

## 配置 DeepSeek API Key

AI Codeview 默认从 `DEEPSEEK_API_KEY` 读取 DeepSeek API Key。

PowerShell：

```powershell
$env:DEEPSEEK_API_KEY = "你的 DeepSeek API Key"
```

macOS / Linux：

```bash
export DEEPSEEK_API_KEY="你的 DeepSeek API Key"
```

建议把 API Key 配置为系统或终端环境变量。不要把真实密钥写入项目配置文件，也不要提交到 Git 仓库。

## 3 分钟跑通

第一次使用时，可以按下面流程确认安装、配置和基础审查链路是否正常。

```bash
npm install -g ai-codeview
acv --help
```

PowerShell：

```powershell
$env:DEEPSEEK_API_KEY = "你的 DeepSeek API Key"
acv review
```

macOS / Linux：

```bash
export DEEPSEEK_API_KEY="你的 DeepSeek API Key"
acv review
```

如果当前仓库没有 diff，命令会返回没有可审查内容的提示。你可以先修改一个小文件后再次运行。

## 快速开始

审查当前工作区变更：

```bash
acv review
```

只审查已暂存变更：

```bash
git add src/index.ts
acv review --staged
```

审查指定路径的文件：

```bash
acv review --path src\index.ts
```

审查指定路径的目录：

```bash
acv review --path src
```

提交并推送已暂存代码：

```bash
git add src/index.ts
acv push
```

脚本或 CI 中禁用交互确认：

```bash
git add src/index.ts
acv push --non-interactive
```

## 常用命令

```bash
acv review
acv review --changed
acv review --staged
acv review --base main
acv review --path src\index.ts
acv review --path E:\code\demo\src\index.ts
acv review --summary
acv review --format markdown --output review.md
acv review --format json
acv review --fail-on high
acv push
acv push --dry-run
acv push --no-push
acv push --message "feat: 更新代码审查流程"
acv push --non-interactive --message "feat: 自动提交"
acv doctor
acv init
acv config
acv help
```

完整命令名也可以使用：

```bash
ai-codeview review
ai-codeview push
ai-codeview doctor
ai-codeview push --non-interactive
ai-codeview help
```

## 审查 Git 变更

默认审查当前工作区 diff：

```bash
acv review
```

等价于审查 `git diff` 的内容。

显式审查 staged + unstaged 的全部本地变更：

```bash
acv review --changed
```

只审查暂存区 diff：

```bash
acv review --staged
```

适合在提交前审查已经 `git add` 的代码。

审查当前分支相对 base 分支的差异：

```bash
acv review --base main
```

## 审查指定路径

审查单个文件：

```bash
acv review --path src\index.ts
```

审查目录：

```bash
acv review --path src
```

路径审查规则：

- `--path` 支持相对路径和绝对路径；相对路径会基于当前工作目录解析。
- 可以传文件，也可以传目录。
- 可以重复传入多个 `--path`。
- `--path` 不能和 `--staged` 同时使用。
- `--path` 不能和 `--base` 同时使用。

## 输出报告

输出 Markdown：

```bash
acv review --format markdown
```

输出 JSON：

```bash
acv review --format json
```

只输出风险摘要和 finding 列表：

```bash
acv review --summary
```

写入文件：

```bash
acv review --format markdown --output review.md
acv review --format json --output review.json
```

JSON 输出适合脚本处理；Markdown 输出适合阅读和归档。

## 严重等级 Gate

可以通过 `--fail-on` 设置阻断阈值：

```bash
acv review --fail-on high
```

严重等级：

- `critical`
- `high`
- `medium`
- `low`

## 退出码

AI Codeview 使用稳定退出码，方便脚本或 CI 判断结果。

| 退出码 | 含义 | 常见场景 |
| --- | --- | --- |
| `0` | 命令运行成功，且没有达到阻断阈值的问题 | 审查通过、没有可审查 diff |
| `1` | 命令运行成功，但审查结果达到 `failOn` 阈值 | 存在 high/critical finding，或用户取消高风险 push |
| `2` | 工具运行失败 | Git、配置、DeepSeek、路径、输出、交互输入失败 |

## 提交并推送

`push` 会审查准备提交的代码，生成中文提交信息，并在用户确认后执行 `git commit` 和 `git push`。

建议第一次使用 `acv push` 时先在测试仓库验证流程。该命令会真实创建提交并推送到当前分支的远程仓库，请先确认当前分支、远程地址和暂存区内容。

```bash
git add src/index.ts
acv push
```

非交互式环境使用：

```bash
git add src/index.ts
acv push --non-interactive
```

只预演审查和提交信息，不创建 commit、不执行 push：

```bash
git add src/index.ts
acv push --dry-run
```

`--dry-run` 不会发起风险确认或提交信息确认。若审查达到 `failOn` 阈值，会返回退出码 `1` 并输出审查报告。

只创建 commit，不推送到远程仓库：

```bash
git add src/index.ts
acv push --no-push
```

使用指定提交信息，跳过 AI 生成和用户确认：

```bash
git add src/index.ts
acv push --message "feat: 更新代码审查流程"
```

流程：

1. 读取 staged diff。
2. 如果没有 staged diff 但有未暂存修改，询问是否执行 `git add -A`。
3. 扫描疑似密钥。
4. 调用 DeepSeek 审查代码。
5. 如达到 `failOn` 阈值，询问是否继续。
6. 生成中文 commit message。
7. 用户确认、编辑或取消。
8. 执行 `git commit`。
9. 执行 `git push`。

注意：

- `push` 不会静默执行 `git add`；只有用户确认后才会执行 `git add -A`。
- `push --non-interactive` 不会发起任何暂存确认；没有 staged diff 但存在未暂存修改时，会返回退出码 `2`，请先手动执行 `git add`。
- `push --non-interactive` 不会发起风险确认或提交信息确认；审查达到 `failOn` 阈值时会直接中止。
- `push --non-interactive` 适合脚本或 CI；如要跳过 AI 提交信息生成，建议搭配 `--message`。
- `push --dry-run` 不会创建 commit，也不会执行 push；它会自动生成提交信息并输出预演结果。
- `push --no-push` 会创建 commit，但不会执行 push。
- 没有 staged diff 且没有未暂存修改时，不会提交也不会推送。
- 用户拒绝暂存未暂存修改时，不会提交也不会推送。
- 用户取消确认时，不会提交也不会推送。
- `git commit` 或 `git push` 失败时，命令返回退出码 `2`。

## 配置文件

生成默认配置文件：

```bash
acv init
```

如果配置文件已存在，默认不会覆盖。需要覆盖时使用：

```bash
acv init --force
```

查看最终生效配置：

```bash
acv config
```

AI Codeview 会查找以下配置文件：

- `.ai-codeview.json`
- `.ai-codeview.yaml`
- `.ai-codeview.yml`

示例：

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "baseUrl": "https://api.deepseek.com",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "reportLanguage": "zh-CN",
  "failOn": "high",
  "confidenceFloor": "medium",
  "security": {
    "allowSecrets": false
  },
  "output": {
    "format": "markdown",
    "file": null
  }
}
```

命令行参数优先级高于配置文件。

### 配置字段说明

| 字段 | 说明 |
| --- | --- |
| `provider` | AI provider 名称，当前默认使用 `deepseek`。 |
| `model` | DeepSeek 模型名称。 |
| `baseUrl` | DeepSeek API 地址，默认是 `https://api.deepseek.com`。 |
| `apiKeyEnv` | 读取 API Key 的环境变量名，默认是 `DEEPSEEK_API_KEY`。 |
| `reportLanguage` | AI 报告语言，可使用 `zh-CN` 或 `en-US`，默认 `zh-CN`。 |
| `failOn` | 严重等级 gate，达到该等级时返回退出码 `1`。 |
| `confidenceFloor` | finding 最低置信度过滤阈值。 |
| `security.allowSecrets` | 是否允许把疑似密钥内容发送给 provider，默认 `false`。 |
| `output.format` | 默认输出格式，可使用 `text`、`markdown` 或 `json`。 |
| `output.file` | 默认输出文件路径，`null` 表示只输出到终端。 |

## 敏感信息保护

AI Codeview 会在发送内容给 DeepSeek 前扫描疑似密钥。命中后默认中止审查，避免把敏感信息发送给外部 provider。

如果你确认本次内容可以发送，可以显式放行：

```bash
acv review --allow-secrets
```

或在配置文件中设置：

```json
{
  "security": {
    "allowSecrets": true
  }
}
```

请谨慎使用该选项。

## Help 命令

查看根命令帮助：

```bash
ai-codeview help
acv help
```

查看子命令帮助：

```bash
ai-codeview help review
ai-codeview help push
acv help review
acv help push
```

也可以使用：

```bash
acv --help
acv review --help
acv push --help
acv doctor --help
```

## 环境诊断

如果安装或运行失败，可以先执行：

```bash
acv doctor
```

`doctor` 会检查 Node.js 版本、Git 是否可用、当前目录是否是 Git 仓库、配置是否可加载、DeepSeek API Key 是否存在，以及 `push` 所需的 Git remote 是否配置。

检查结果中：

- `✓` 表示通过。
- `!` 表示提醒，例如未配置 remote；这不会影响 `review`，但会影响 `push`。
- `✗` 表示需要处理的问题，命令会返回退出码 `2`。

## 版本状态

当前版本：`0.4.0`

已支持：

- 本地 Git diff 审查。
- `acv review --changed` 审查 staged + unstaged 的全部本地变更。
- 暂存区 diff 审查。
- Text、Markdown、JSON 输出。
- `acv review --summary` 输出风险摘要和 finding 列表。
- `reportLanguage` 报告语言配置。
- DeepSeek provider。
- 严重等级 gate。
- 指定绝对路径文件或目录审查。
- 指定相对路径文件或目录审查。
- `acv` 推荐简写命令，兼容 `ac` 简写命令。
- `acv push` 提交前审查、中文提交信息生成、提交和推送。
- `acv push --non-interactive` 脚本模式。
- `acv push --dry-run` 预演模式。
- `acv push --no-push` 只提交不推送。
- `acv push --message` 指定提交信息。
- `acv doctor` 本地环境诊断。

计划中：

- Commit range 审查。
- GitHub PR / GitLab MR 审查。
- 行内审查评论。
- 本地模型模式。
- 自动修复建议和交互式修复流程。

## 常见问题

### 为什么 `acv push` 会询问是否执行 `git add -A`？

当没有 staged diff，但工作区存在未暂存修改时，`push` 会询问是否把这些修改加入暂存区。确认后会执行：

```bash
git add -A
```

然后继续审查、生成提交信息、提交和推送。

如果你只想提交部分文件，请先手动执行 `git add <file>`，再运行 `acv push`。

### 脚本或 CI 中如何使用 `acv push`？

请先手动暂存要提交的文件，然后使用非交互式模式：

```bash
git add <file>
acv push --non-interactive --message "feat: 自动提交"
```

非交互式模式不会询问是否执行 `git add -A`。如果没有 staged diff，即使工作区存在未暂存修改，命令也会直接返回退出码 `2`，避免脚本挂起。若审查达到 `failOn` 阈值，也会直接中止。

### 为什么提示缺少 `DEEPSEEK_API_KEY`？

请确认当前终端会话中已经设置环境变量：

```bash
echo $DEEPSEEK_API_KEY
```

PowerShell 可以用：

```powershell
$env:DEEPSEEK_API_KEY
```

### 为什么 `review --path` 报错？

`--path` 支持相对路径和绝对路径，但不能和 `--staged` 或 `--base` 一起使用。

### 为什么推荐 `acv` 而不是 `ac`？

`ac` 更短，但 PowerShell 默认也有一个 `ac` alias，指向 `Add-Content`。为了减少 Windows 用户的命令冲突，推荐优先使用 `acv`。如果你的终端里 `ac` 没有冲突，也可以继续使用 `ac`。

### 代码会发送到哪里？

AI Codeview 会把需要审查的 diff 或文件内容发送给你配置的 DeepSeek API 地址。默认地址是：

```text
https://api.deepseek.com
```

请不要审查不允许发送给外部 provider 的敏感代码，除非你已经确认风险。
