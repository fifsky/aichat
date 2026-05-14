import { intro, outro, password, text, isCancel, confirm } from "@clack/prompts";
import type { AppConfig } from "../types";
import { applySet, configPath, loadConfig, redact, saveConfig } from "../config";

export async function configureCommand(setValues: string[]): Promise<void> {
  let config = await loadConfig();

  if (setValues.length > 0) {
    for (const pair of setValues) {
      config = applySet(config, pair);
    }
    await saveConfig(config);
    console.log(`Config updated: ${configPath()}`);
    return;
  }

  intro("aichat config");
  const baseURL = await text({
    message: "OpenAI-compatible endpoint",
    initialValue: config.provider.baseURL,
    placeholder: "https://api.deepseek.com",
  });
  cancelIfNeeded(baseURL);

  const model = await text({
    message: "Model name",
    initialValue: config.provider.model,
    placeholder: "deepseek-v4-pro",
  });
  cancelIfNeeded(model);

  const apiKey = await password({
    message: `API key (${config.provider.apiKey ? redact(config.provider.apiKey) : "empty"})`,
  });
  cancelIfNeeded(apiKey);

  const showReasoning = await confirm({
    message: "Show reasoning_content in terminal output?",
    initialValue: config.provider.thinking.showReasoning,
  });
  cancelIfNeeded(showReasoning);

  const next: AppConfig = {
    ...config,
    provider: {
      ...config.provider,
      baseURL: String(baseURL),
      model: String(model),
      apiKey: String(apiKey || config.provider.apiKey),
      thinking: {
        ...config.provider.thinking,
        enabled: true,
        showReasoning: Boolean(showReasoning),
      },
    },
  };

  await saveConfig(next);
  outro(`Config saved: ${configPath()}`);
}

function cancelIfNeeded(value: unknown): asserts value {
  if (isCancel(value)) {
    outro("Cancelled.");
    process.exit(1);
  }
}
