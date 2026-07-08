# AI Codeview

AI Codeview 是一个本地优先的 AI 代码审查命令行工具，使用 DeepSeek 对本地 Git 变更进行审查。

## 安装与密钥

```powershell
pnpm install
$env:DEEPSEEK_API_KEY = "你的 DeepSeek API Key"
```

`DEEPSEEK_API_KEY` 建议配置为系统或终端环境变量，不建议写入项目配置文件或提交到仓库。

## 常用命令

已发布包可以直接使用：

```bash
ai-codeview review
ai-codeview review --staged
ai-codeview review --base main
ai-codeview review --path E:\code\demo\src\index.ts
ai-codeview review --format markdown --output review.md
ai-codeview push
ai-codeview init
ai-codeview config
```

本地开发时使用：

```bash
pnpm dev -- review
pnpm dev -- review --staged
pnpm dev -- review --base main
pnpm dev -- review --path E:\code\demo\src\index.ts
pnpm dev -- review --fail-on medium
pnpm dev -- review --format json
pnpm dev -- review --format markdown --output review.md
pnpm dev -- review --color
pnpm dev -- review --no-color
pnpm dev -- review --allow-secrets
pnpm dev -- push
pnpm dev -- init
pnpm dev -- init --force
pnpm dev -- config
```

`review` 默认读取当前 Git 工作区变更，并把 Markdown 审查报告输出到终端。需要写入文件时，显式传入 `--output <file>`。

`review --path` 用于审查指定绝对路径的文件或目录。路径必须是绝对路径，不能与 `--staged`、`--base` 同时使用。

`push` 用于提交和推送已暂存代码。它只处理 staged diff，不会自动执行 `git add`。流程是：审查已暂存代码；达到 `failOn` 阈值时询问是否继续；通过或用户确认后生成中文 commit message；用户确认或编辑后执行 `git commit` 和 `git push`。

完整设计见：`docs/superpowers/specs/2026-07-07-ai-codeview-path-review-and-push-design.md`。

## 配置文件

AI Codeview 会在项目中查找以下配置文件：

- `.ai-codeview.json`
- `.ai-codeview.yaml`
- `.ai-codeview.yml`

生成默认项目配置：

```bash
pnpm dev -- init
```

`init` 会写入 `.ai-codeview.json`。如果配置文件已经存在，默认不会覆盖；显式传入 `--force` 时才会覆盖。

配置示例：

```json
{
  "model": "deepseek-v4-pro",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "failOn": "high",
  "security": {
    "allowSecrets": false
  },
  "output": {
    "format": "markdown",
    "file": null
  }
}
```

命令行参数优先级高于项目配置。默认情况下，`review` 输出到终端；使用 `--output review.md` 时才会把报告写入文件。

## 构建

```bash
pnpm build
node dist/bin/ai-codeview.js config
```

## 当前能力

- 审查本地 Git 工作区变更。
- 审查暂存区变更和 `base...HEAD` 分支差异。
- 审查指定绝对路径的文件或目录。
- 审查已暂存代码后生成中文提交信息、提交并推送。
- 使用 DeepSeek 作为 AI 审查提供方。
- 支持文本、Markdown、JSON 三种报告格式。
- 支持通过 `--output` 把报告写入文件。
- 当审查结果达到配置的阻断阈值时，返回退出码 `1`。
- 当工具、配置、Git、DeepSeek 或输出流程失败时，返回退出码 `2`。

## DeepSeek 调用稳定性

- 401/403 响应会被识别为鉴权失败，不会重试。
- 429、5xx 和常见网络错误会最多额外重试 2 次。
- AI 返回非法 JSON 或不符合 schema 时，会触发一次修复请求。
- 修复后仍然无效时，命令返回 `AI_RESPONSE_INVALID`。

## 密钥保护

在把 diff 发送给 DeepSeek 之前，AI Codeview 会扫描新增 diff 行中疑似密钥的内容，例如：

- AWS access key
- API key 或 token 赋值
- private key 文件头

命中疑似密钥时，审查会中止，返回 `SECRET_DETECTED` 和退出码 `2`。删除行会被忽略，因此删除历史泄露密钥不会阻断审查。

如果用户已经确认风险，并希望允许包含疑似密钥的 diff 继续发送给 DeepSeek，可以使用：

```bash
pnpm dev -- review --allow-secrets
```

也可以在配置文件中设置：

```json
{
  "security": {
    "allowSecrets": true
  }
}
```

## 暂缓事项

- PR/MR 审查集成。
- 自动生成修复补丁。
- 已知问题基线和抑制规则。
