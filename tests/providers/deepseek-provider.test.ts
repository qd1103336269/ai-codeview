import { describe, expect, test, vi } from "vitest";
import { DeepSeekProvider, type CreateChatCompletion } from "../../src/providers/deepseek-provider.js";
import type { ReviewReport } from "../../src/review/review-schema.js";

describe("DeepSeekProvider", () => {
  test("sends DeepSeek request with configured model and parses JSON response", async () => {
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

    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      createChatCompletion: create,
    });

    const result = await provider.review({ prompt: "review this" });

    expect(result.summary).toBe("No issues.");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-v4-pro",
        messages: expect.any(Array),
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        response_format: { type: "json_object" },
        stream: false,
      }),
    );
  });

  test("sends disabled thinking and max reasoning effort when configured", async () => {
    const create = vi.fn().mockResolvedValue(completion(JSON.stringify(validReport())));
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      thinking: false,
      reasoningEffort: "max",
      createChatCompletion: create,
    });

    await provider.review({ prompt: "review this" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-v4-flash",
        thinking: { type: "disabled" },
        reasoning_effort: "max",
      }),
    );
  });

  test("maps 401 and 403 errors to PROVIDER_AUTH_FAILED without retrying", async () => {
    const create = vi.fn().mockRejectedValue(apiError(401));
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "review this" })).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
      exitCode: 2,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("maps 4xx request errors to PROVIDER_BAD_REQUEST without retrying", async () => {
    const create = vi.fn().mockRejectedValue(apiError(400));
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "review this" })).rejects.toMatchObject({
      code: "PROVIDER_BAD_REQUEST",
      exitCode: 2,
      recoverable: false,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("retries rate limit errors and returns a later successful response", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValueOnce(completion(JSON.stringify(validReport({ summary: "Recovered." }))));
    const provider = createProvider(create);

    const result = await provider.review({ prompt: "review this" });

    expect(result.summary).toBe("Recovered.");
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("maps exhausted 429 errors to PROVIDER_RATE_LIMITED", async () => {
    const create = vi.fn().mockRejectedValue(apiError(429));
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "review this" })).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      exitCode: 2,
    });
    expect(create).toHaveBeenCalledTimes(3);
  });

  test("maps exhausted 5xx and network errors to PROVIDER_UNAVAILABLE", async () => {
    const serverErrorCreate = vi.fn().mockRejectedValue(apiError(503));
    const networkErrorCreate = vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));

    await expect(createProvider(serverErrorCreate).review({ prompt: "review this" })).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    await expect(createProvider(networkErrorCreate).review({ prompt: "review this" })).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(serverErrorCreate).toHaveBeenCalledTimes(3);
    expect(networkErrorCreate).toHaveBeenCalledTimes(3);
  });

  test("repairs non-JSON responses once", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completion("not json"))
      .mockResolvedValueOnce(completion(JSON.stringify(validReport({ summary: "Repaired JSON." }))));
    const provider = createProvider(create);

    const result = await provider.review({ prompt: "review this" });

    expect(result.summary).toBe("Repaired JSON.");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages[0].content).toContain("修复");
  });

  test("repairs schema-invalid JSON responses once", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completion(JSON.stringify({ summary: "missing required fields" })))
      .mockResolvedValueOnce(completion(JSON.stringify(validReport({ summary: "Repaired schema." }))));
    const provider = createProvider(create);

    const result = await provider.review({ prompt: "review this" });

    expect(result.summary).toBe("Repaired schema.");
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("throws AI_RESPONSE_INVALID when repair response is still invalid", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completion("not json"))
      .mockResolvedValueOnce(completion(JSON.stringify({ summary: "still invalid" })));
    const provider = createProvider(create);

    await expect(provider.review({ prompt: "review this" })).rejects.toMatchObject({
      code: "AI_RESPONSE_INVALID",
      exitCode: 2,
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("generates sanitized Chinese commit message", async () => {
    const create = vi.fn().mockResolvedValue(completion("```text\nfeat: 增加推送前审查\n```"));
    const provider = createProvider(create);

    const message = await provider.generateCommitMessage({ prompt: "生成中文提交信息" });

    expect(message).toBe("feat: 增加推送前审查");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "生成中文提交信息" }],
        stream: false,
      }),
    );
  });
});

function createProvider(createChatCompletion: CreateChatCompletion) {
  return new DeepSeekProvider({
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    createChatCompletion,
  });
}

function completion(content: string) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

function validReport(overrides: Partial<ReviewReport> = {}): ReviewReport {
  return {
    risk: "low",
    status: "pass",
    summary: "No issues.",
    findingCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    findings: [],
    ...overrides,
  };
}

function apiError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}
