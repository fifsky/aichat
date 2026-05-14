import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AppConfig } from "../types";

export function createChatModel(config: AppConfig): LanguageModel {
  const provider = createOpenAICompatible({
    name: config.provider.name,
    baseURL: config.provider.baseURL,
    apiKey: config.provider.apiKey,
    includeUsage: true,
    transformRequestBody: (body) => {
      if (!config.provider.thinking.enabled) {
        return body;
      }

      return {
        ...body,
        reasoning_effort: config.provider.thinking.reasoningEffort,
      };
    },
  });

  return provider(config.provider.model);
}

export function providerOptions(config: AppConfig) {
  if (!config.provider.thinking.enabled) {
    return undefined;
  }
  return {
    [config.provider.name]: {
      reasoningEffort: config.provider.thinking.reasoningEffort,
    },
  };
}
