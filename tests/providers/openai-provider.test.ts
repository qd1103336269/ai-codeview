import { describe, expect, test, vi } from "vitest";
import { OpenAIProvider, type CreateOpenAIChatCompletion } from "../../src/providers/openai-provider.js";

describe("OpenAIProvider", () => {
  test("sends request with configured model and parses JSON response", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              risk: "low",
              status: "pass",
              summary: "No issues.",
              findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
              findings: [],
            }),
          },
        },
      ],
    });

    const provider = new OpenAIProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com",
      model: "gpt-4o",
      createChatCompletion: create,
      sleep: noopSleep,
    });

    const result = await provider.review({ prompt: "review this" });

    expect(result.summary).toBe("No issues.");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        stream: false,
      }),
    );
  });

  test("maps 401 to PROVIDER_AUTH_FAILED", async () => {
    const create = vi.fn().mockRejectedValue(apiError(401));
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "x" })).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
      exitCode: 2,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("maps 429 to PROVIDER_RATE_LIMITED with retry", async () => {
    const create = vi.fn().mockRejectedValue(apiError(429));
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "x" })).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
    });
    expect(create).toHaveBeenCalledTimes(3);
  });

  test("maps AbortError to PROVIDER_TIMEOUT", async () => {
    const create = vi.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "x" })).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });

  test("generates sanitized commit message", async () => {
    const create = vi.fn().mockResolvedValue(completion("```text\nfeat: update\n```"));
    const provider = createProvider(create);

    const message = await provider.generateCommitMessage({ prompt: "generate" });

    expect(message).toBe("feat: update");
  });

  test("throws AI_RESPONSE_INVALID for non-JSON response", async () => {
    const create = vi.fn().mockResolvedValue(completion("not json"));
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "x" })).rejects.toMatchObject({
      code: "AI_RESPONSE_INVALID",
    });
  });
});

function createProvider(createChatCompletion: CreateOpenAIChatCompletion) {
  return new OpenAIProvider({
    apiKey: "test-key",
    baseUrl: "https://api.openai.com",
    model: "gpt-4o",
    createChatCompletion,
    sleep: noopSleep,
  });
}

function noopSleep(): Promise<void> {
  return Promise.resolve();
}

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

function apiError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}
