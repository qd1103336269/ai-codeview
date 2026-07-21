import { describe, expect, test } from "vitest";
import "../../src/providers/index.js";
import { createProvider, getSupportedProviders } from "../../src/providers/registry.js";
import { loadConfigFromObject } from "../../src/config/load-config.js";

describe("provider registry", () => {
  test("supports deepseek and openai", () => {
    const providers = getSupportedProviders();
    expect(providers).toContain("deepseek");
    expect(providers).toContain("openai");
  });

  test("createProvider returns provider for deepseek", () => {
    const config = loadConfigFromObject({});
    const provider = createProvider(config, "test-key");
    expect(provider).toBeDefined();
    expect(typeof provider.review).toBe("function");
    expect(typeof provider.generateCommitMessage).toBe("function");
  });

  test("createProvider returns provider for openai", () => {
    const config = loadConfigFromObject({ provider: "openai", model: "gpt-4o", apiKeyEnv: "OPENAI_API_KEY" });
    const provider = createProvider(config, "test-key");
    expect(provider).toBeDefined();
    expect(typeof provider.review).toBe("function");
  });

  test("createProvider throws INVALID_CONFIG for unknown provider", () => {
    const config = loadConfigFromObject({});
    (config as { provider: string }).provider = "unknown";
    expect(() => createProvider(config, "test-key")).toThrow("不支持的 provider");
  });
});
