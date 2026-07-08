export interface BuildCommitMessagePromptInput {
  diff: string;
}

export function buildCommitMessagePrompt(input: BuildCommitMessagePromptInput): string {
  return [
    "你是一个帮助开发者生成 Git 提交信息的助手。",
    "请根据下面的 staged diff 生成一条中文 commit message。",
    "要求使用 Conventional Commits 类型前缀，例如 feat、fix、docs、refactor、test、chore。",
    "第一行必须是简短 subject，不超过 72 个字符。",
    "如果确实需要正文，可以在第二行空行后补充，但不要输出 Markdown 代码块。",
    "只返回 commit message 本身。",
    "",
    "Staged diff:",
    input.diff,
  ].join("\n");
}

export function sanitizeCommitMessage(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}
