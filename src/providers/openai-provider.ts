// experimental: OpenAI provider 骨架，功能最小化，不做 thinking mode / repair。
import OpenAI from "openai";
import type { AiCodeviewConfig } from "../config/config-schema.js";
import { AppError, isAppError } from "../errors/app-error.js";
import { sanitizeCommitMessage } from "../review/commit-message.js";
import { reviewReportSchema, type ReviewReport } from "../review/review-schema.js";
import type { AiProvider, CommitMessageRequest, ReviewRequest } from "./ai-provider.js";
import type { ProviderFactory } from "./registry.js";

type ChatCompletionInput = {
  model: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  response_format?: { type: "json_object" };
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

export type CreateOpenAIChatCompletion = (input: ChatCompletionInput) => Promise<ChatCompletionOutput>;

export interface OpenAIProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  createChatCompletion?: CreateOpenAIChatCompletion;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

export class OpenAIProvider implements AiProvider {
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly createChatCompletion: CreateOpenAIChatCompletion;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;
    const client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl || undefined,
      timeout: this.timeoutMs,
      maxRetries: 0,
    });
    this.createChatCompletion =
      options.createChatCompletion ??
      ((input) => client.chat.completions.create(input as never) as Promise<ChatCompletionOutput>);
  }

  async review(request: ReviewRequest): Promise<ReviewReport> {
    const completion = await this.createCompletionWithRetry({
      model: this.model,
      messages: [{ role: "user", content: request.prompt }],
      response_format: { type: "json_object" },
      stream: false,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError({
        code: "AI_RESPONSE_INVALID",
        message: "OpenAI 返回了空响应。",
        exitCode: 2,
      });
    }

    try {
      return reviewReportSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new AppError({
        code: "AI_RESPONSE_INVALID",
        message: "OpenAI 响应不符合预期的审查 schema。",
        exitCode: 2,
        details: error,
      });
    }
  }

  async generateCommitMessage(request: CommitMessageRequest): Promise<string> {
    const completion = await this.createCompletionWithRetry({
      model: this.model,
      messages: [{ role: "user", content: request.prompt }],
      stream: false,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError({
        code: "AI_RESPONSE_INVALID",
        message: "OpenAI 返回了空提交信息。",
        exitCode: 2,
      });
    }

    return sanitizeCommitMessage(content);
  }

  private async createCompletionWithRetry(input: ChatCompletionInput): Promise<ChatCompletionOutput> {
    let lastError: AppError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.createChatCompletion(input);
      } catch (error) {
        const appError = toOpenAIAppError(error);
        lastError = appError;
        if (!isRetryable(appError) || attempt === this.maxRetries) {
          throw appError;
        }
        const backoff = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        await this.sleep(backoff);
      }
    }

    throw lastError;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: AppError): boolean {
  return (
    error.code === "PROVIDER_RATE_LIMITED" ||
    error.code === "PROVIDER_UNAVAILABLE" ||
    error.code === "PROVIDER_TIMEOUT"
  );
}

function toOpenAIAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (isAbortError(error)) {
    return new AppError({
      code: "PROVIDER_TIMEOUT",
      message: "OpenAI 请求超时。",
      exitCode: 2,
    });
  }

  const status = getErrorStatus(error);
  if (status === 401 || status === 403) {
    return new AppError({
      code: "PROVIDER_AUTH_FAILED",
      message: "OpenAI 鉴权失败。",
      exitCode: 2,
      suggestion: "请检查配置的 OpenAI API key。",
    });
  }
  if (status === 429) {
    return new AppError({
      code: "PROVIDER_RATE_LIMITED",
      message: "OpenAI 请求触发限流。",
      exitCode: 2,
    });
  }
  if (status && status >= 400 && status < 500) {
    return new AppError({
      code: "PROVIDER_BAD_REQUEST",
      message: "OpenAI 拒绝了本次审查请求。",
      exitCode: 2,
    });
  }
  if (status && status >= 500) {
    return new AppError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenAI 暂时不可用。",
      exitCode: 2,
    });
  }
  return new AppError({
    code: "PROVIDER_UNAVAILABLE",
    message: "OpenAI 请求失败。",
    exitCode: 2,
  });
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  if (name === "AbortError") return true;
  const code = (error as { code?: unknown }).code;
  return code === "ABORT_ERR";
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = candidate.status ?? candidate.statusCode;
  return typeof status === "number" ? status : undefined;
}

export const openaiFactory: ProviderFactory = {
  create(config: AiCodeviewConfig, apiKey: string): AiProvider {
    return new OpenAIProvider({
      apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
  },
};
