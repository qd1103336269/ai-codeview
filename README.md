# AI Codeview

AI Codeview 是一个本地优先的 AI 代码审查命令行工具。它可以审查本地 Git 变更，也可以审查指定绝对路径的代码文件或目录，并使用 DeepSeek 输出中文代码审查报告。

安装后可以使用两个等价命令：

- `ai-codeview`：完整命令名，适合脚本和文档。
- `ac`：简写命令，适合日常终端使用。

例如：

```bash
ai-codeview review --staged
ac review --staged
```

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
在脚本或 CI 等非交互式环境中，请使用 `ac push --non-interactive`，并在运行前手动暂存要提交的文件。

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
ac --help
ai-codeview --help
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

## 快速开始

审查当前工作区变更：

```bash
ac review
```

只审查已暂存变更：

```bash
git add src/index.ts
ac review --staged
```

审查指定绝对路径的文件：

```bash
ac review --path E:\code\demo\src\index.ts
```

审查指定绝对路径的目录：

```bash
ac review --path E:\code\demo\src
```

提交并推送已暂存代码：

```bash
git add src/index.ts
ac push
```

脚本或 CI 中禁用交互确认：

```bash
git add src/index.ts
ac push --non-interactive
```

## 常用命令

```bash
ac review
ac review --staged
ac review --base main
ac review --path E:\code\demo\src\index.ts
ac review --format markdown --output review.md
ac review --format json
ac review --fail-on high
ac push
ac push --non-interactive
ac init
ac config
ac help
```

完整命令名也可以使用：

```bash
ai-codeview review
ai-codeview push
ai-codeview push --non-interactive
ai-codeview help
```

## 审查 Git 变更

默认审查当前工作区 diff：

```bash
ac review
```

等价于审查 `git diff` 的内容。

只审查暂存区 diff：

```bash
ac review --staged
```

适合在提交前审查已经 `git add` 的代码。

审查当前分支相对 base 分支的差异：

```bash
ac review --base main
```

## 审查指定路径

审查单个文件：

```bash
ac review --path E:\code\demo\src\index.ts
```

审查目录：

```bash
ac review --path E:\code\demo\src
```

路径审查规则：

- `--path` 必须传入绝对路径。
- 可以传文件，也可以传目录。
- 可以重复传入多个 `--path`。
- `--path` 不能和 `--staged` 同时使用。
- `--path` 不能和 `--base` 同时使用。

## 输出报告

输出 Markdown：

```bash
ac review --format markdown
```

输出 JSON：

```bash
ac review --format json
```

写入文件：

```bash
ac review --format markdown --output review.md
ac review --format json --output review.json
```

JSON 输出适合脚本处理；Markdown 输出适合阅读和归档。

## 严重等级 Gate

可以通过 `--fail-on` 设置阻断阈值：

```bash
ac review --fail-on high
```

严重等级：

- `critical`
- `high`
- `medium`
- `low`

退出码：

- `0`：命令运行成功，且没有达到阈值的问题。
- `1`：命令运行成功，但审查结果达到阈值。
- `2`：工具、配置、Git、DeepSeek 或输出流程失败。

## 提交并推送

`push` 会审查准备提交的代码，生成中文提交信息，并在用户确认后执行 `git commit` 和 `git push`。

```bash
git add src/index.ts
ac push
```

非交互式环境使用：

```bash
git add src/index.ts
ac push --non-interactive
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
- 没有 staged diff 且没有未暂存修改时，不会提交也不会推送。
- 用户拒绝暂存未暂存修改时，不会提交也不会推送。
- 用户取消确认时，不会提交也不会推送。
- `git commit` 或 `git push` 失败时，命令返回退出码 `2`。

## 配置文件

生成默认配置文件：

```bash
ac init
```

如果配置文件已存在，默认不会覆盖。需要覆盖时使用：

```bash
ac init --force
```

查看最终生效配置：

```bash
ac config
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

## 敏感信息保护

AI Codeview 会在发送内容给 DeepSeek 前扫描疑似密钥。命中后默认中止审查，避免把敏感信息发送给外部 provider。

如果你确认本次内容可以发送，可以显式放行：

```bash
ac review --allow-secrets
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
ac help
```

查看子命令帮助：

```bash
ai-codeview help review
ai-codeview help push
ac help review
ac help push
```

也可以使用：

```bash
ac --help
ac review --help
ac push --help
```

## 常见问题

### 为什么 `ac push` 会询问是否执行 `git add -A`？

当没有 staged diff，但工作区存在未暂存修改时，`push` 会询问是否把这些修改加入暂存区。确认后会执行：

```bash
git add -A
```

然后继续审查、生成提交信息、提交和推送。

如果你只想提交部分文件，请先手动执行 `git add <file>`，再运行 `ac push`。

### 脚本或 CI 中如何使用 `ac push`？

请先手动暂存要提交的文件，然后使用非交互式模式：

```bash
git add <file>
ac push --non-interactive
```

非交互式模式不会询问是否执行 `git add -A`。如果没有 staged diff，即使工作区存在未暂存修改，命令也会直接返回退出码 `2`，避免脚本挂起。

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

`--path` 必须使用绝对路径，并且不能和 `--staged` 或 `--base` 一起使用。

### 代码会发送到哪里？

AI Codeview 会把需要审查的 diff 或文件内容发送给你配置的 DeepSeek API 地址。默认地址是：

```text
https://api.deepseek.com
```

请不要审查不允许发送给外部 provider 的敏感代码，除非你已经确认风险。
