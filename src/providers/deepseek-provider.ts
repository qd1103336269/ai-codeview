import OpenAI from "openai";
import { AppError, isAppError } from "../errors/app-error.js";
import { sanitizeCommitMessage } from "../review/commit-message.js";
import { reviewReportSchema, type ReviewReport } from "../review/review-schema.js";
import type { AiProvider, CommitMessageRequest, ReviewRequest } from "./ai-provider.js";

type ChatCompletionInput = {
  model: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  response_format?: { type: "json_object" };
  thinking?: { type: "enabled" | "disabled" };
  reasoning_effort?: "high" | "max";
  stream?: false;
  signal?: AbortSignal;
  [key: string]: unknown;
};

type ChatCompletionOutput = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export type CreateChatCompletion = (input: ChatCompletionInput) => Promise<ChatCompletionOutput>;

export interface DeepSeekProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  thinking?: boolean;
  reasoningEffort?: "high" | "max";
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  createChatCompletion?: CreateChatCompletion;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

export class DeepSeekProvider implements AiProvider {
  private readonly model: DeepSeekProviderOptions["model"];
  private readonly thinking: boolean;
  private readonly reasoningEffort: "high" | "max";
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly createChatCompletion: CreateChatCompletion;

  constructor(options: DeepSeekProviderOptions) {
    this.model = options.model;
    this.thinking = options.thinking ?? true;
    this.reasoningEffort = options.reasoningEffort ?? "high";
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;
    const client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: this.timeoutMs,
      maxRetries: 0,
    });
    this.createChatCompletion =
      options.createChatCompletion ??
      ((input) => client.chat.completions.create(input as never) as Promise<ChatCompletionOutput>);
  }

  async review(request: ReviewRequest): Promise<ReviewReport> {
    const completion = await this.createCompletionWithRetry(this.createReviewInput(request.prompt));

    try {
      return parseReviewCompletion(completion);
    } catch (error) {
      if (!isAppError(error) || error.code !== "AI_RESPONSE_INVALID") {
        throw error;
      }

      const repairCompletion = await this.createCompletionWithRetry(
        this.createRepairInput({
          originalPrompt: request.prompt,
          invalidContent: getCompletionContent(completion) ?? "",
          reason: error.message,
        }),
      );
      return parseReviewCompletion(repairCompletion);
    }
  }

  async generateCommitMessage(request: CommitMessageRequest): Promise<string> {
    const completion = await this.createCompletionWithRetry(this.createCommitMessageInput(request.prompt));
    const content = getCompletionContent(completion);

    if (!content) {
      throw new AppError({
        code: "AI_RESPONSE_INVALID",
        message: "DeepSeek 返回了空提交信息。",
        exitCode: 2,
        recoverable: true,
      });
    }

    return sanitizeCommitMessage(content);
  }

  private createReviewInput(prompt: string): ChatCompletionInput {
    return {
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      thinking: { type: this.thinking ? "enabled" : "disabled" },
      reasoning_effort: this.reasoningEffort,
      stream: false,
      signal: AbortSignal.timeout(this.timeoutMs),
    };
  }

  private createCommitMessageInput(prompt: string): ChatCompletionInput {
    return {
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      thinking: { type: this.thinking ? "enabled" : "disabled" },
      reasoning_effort: this.reasoningEffort,
      stream: false,
      signal: AbortSignal.timeout(this.timeoutMs),
    };
  }

  private createRepairInput(input: {
    originalPrompt: string;
    invalidContent: string;
    reason: string;
  }): ChatCompletionInput {
    return this.createReviewInput(
      [
        "请修复上一次 AI 代码审查响应。",
        "只返回符合审查报告 schema 的合法 JSON。",
        "不要包含 Markdown 代码块或额外说明文字。",
        "面向用户的文字必须使用中文。",
        "",
        `校验问题：${input.reason}`,
        "",
        "原始审查 prompt：",
        input.originalPrompt,
        "",
        "无效响应：",
        input.invalidContent,
      ].join("\n"),
    );
  }

  private async createCompletionWithRetry(input: ChatCompletionInput): Promise<ChatCompletionOutput> {
    let lastError: AppError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.createChatCompletion(input);
      } catch (error) {
        const appError = toProviderAppError(error);
        lastError = appError;
        if (!isRetryableProviderError(appError) || attempt === this.maxRetries) {
          throw appError;
        }
        const retryAfterMs = getRetryAfterMs(error);
        const backoff = retryAfterMs ?? Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        await this.sleep(backoff);
      }
    }

    throw lastError;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const headers = (error as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object") return undefined;
  const value = (headers as Record<string, unknown>)["retry-after"];
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num * 1000;
  }
  return undefined;
}

function parseReviewCompletion(completion: ChatCompletionOutput): ReviewReport {
  const content = getCompletionContent(completion);
  if (!content) {
    throw new AppError({
      code: "AI_RESPONSE_INVALID",
      message: "DeepSeek 返回了空响应。",
      exitCode: 2,
      recoverable: true,
    });
  }

  try {
    return reviewReportSchema.parse(JSON.parse(content));
  } catch (error) {
    throw new AppError({
      code: "AI_RESPONSE_INVALID",
      message: "DeepSeek 响应不符合预期的审查 schema。",
      exitCode: 2,
      recoverable: true,
      details: error,
    });
  }
}

function getCompletionContent(completion: ChatCompletionOutput): string | null | undefined {
  const content = completion.choices?.[0]?.message?.content;
  return content;
}

function toProviderAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (isAbortError(error)) {
    return new AppError({
      code: "PROVIDER_TIMEOUT",
      message: "DeepSeek 请求超时。",
      exitCode: 2,
      recoverable: true,
      suggestion: "请增大 timeoutMs 配置，或缩小本次审查范围后重试。",
      details: sanitizeError(error),
    });
  }

  const status = getErrorStatus(error);
  if (status === 401 || status === 403) {
    return new AppError({
      code: "PROVIDER_AUTH_FAILED",
      message: "DeepSeek 鉴权失败。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请检查配置的 DeepSeek API key。",
      details: sanitizeError(error),
    });
  }
  if (status === 429) {
    return new AppError({
      code: "PROVIDER_RATE_LIMITED",
      message: "DeepSeek 请求触发限流。",
      exitCode: 2,
      recoverable: true,
      suggestion: "请稍后重试，或缩小本次审查范围。",
      details: sanitizeError(error),
    });
  }
  if (status && status >= 400 && status < 500) {
    return new AppError({
      code: "PROVIDER_BAD_REQUEST",
      message: "DeepSeek 拒绝了本次审查请求。",
      exitCode: 2,
      recoverable: false,
      suggestion: "请检查配置的模型、baseUrl 和 DeepSeek 请求参数。",
      details: sanitizeError(error),
    });
  }
  if (status && status >= 500) {
    return new AppError({
      code: "PROVIDER_UNAVAILABLE",
      message: "DeepSeek 暂时不可用。",
      exitCode: 2,
      recoverable: true,
      suggestion: "请稍后重试。",
      details: sanitizeError(error),
    });
  }
  if (isNetworkError(error)) {
    return new AppError({
      code: "PROVIDER_UNAVAILABLE",
      message: "无法连接 DeepSeek。",
      exitCode: 2,
      recoverable: true,
      suggestion: "请检查网络、DNS、代理或防火墙设置。",
      details: sanitizeError(error),
    });
  }

  return new AppError({
    code: "PROVIDER_UNAVAILABLE",
    message: "DeepSeek 请求失败。",
    exitCode: 2,
    recoverable: true,
    details: sanitizeError(error),
  });
}

function isRetryableProviderError(error: AppError): boolean {
  return (
    error.code === "PROVIDER_RATE_LIMITED" ||
    error.code === "PROVIDER_UNAVAILABLE" ||
    error.code === "PROVIDER_TIMEOUT"
  );
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  if (name === "AbortError") return true;
  const code = (error as { code?: unknown }).code;
  return code === "ABORT_ERR";
}

function sanitizeError(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  return {
    status: typeof status === "number" ? status : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
  };
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  return typeof status === "number" ? status : undefined;
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return (
    typeof code === "string" &&
    ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(code)
  );
}
