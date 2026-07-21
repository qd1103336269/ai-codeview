import type { AiCodeviewConfig } from "../config/config-schema.js";
import { AppError } from "../errors/app-error.js";
import type { AiProvider } from "./ai-provider.js";

export interface ProviderFactory {
  create(config: AiCodeviewConfig, apiKey: string): AiProvider;
}

const registry = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  registry.set(name, factory);
}

export function createProvider(config: AiCodeviewConfig, apiKey: string): AiProvider {
  const factory = registry.get(config.provider);
  if (!factory) {
    throw new AppError({
      code: "INVALID_CONFIG",
      message: `不支持的 provider：${config.provider}。当前支持：${[...registry.keys()].join(", ")}。`,
      exitCode: 2,
    });
  }
  return factory.create(config, apiKey);
}

export function getSupportedProviders(): string[] {
  return [...registry.keys()];
}
