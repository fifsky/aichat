import { describe, expect, test } from "bun:test";
import { applySet } from ".";
import { defaultConfig } from "./schema";

describe("config", () => {
  test("defaults to DeepSeek compatible settings", () => {
    expect(defaultConfig.provider.baseURL).toBe("https://api.deepseek.com");
    expect(defaultConfig.provider.model).toBe("deepseek-v4-pro");
    expect(defaultConfig.provider.thinking.enabled).toBe(true);
    expect(defaultConfig.tools.bash.autoApprove).toContain("tvly *");
  });

  test("applies dotted --set values", () => {
    const next = applySet(defaultConfig, "provider.thinking.showReasoning=false");
    expect(next.provider.thinking.showReasoning).toBe(false);
  });
});
