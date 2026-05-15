import { streamText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import type { AppConfig, SessionMessage, Skill } from "../types";
import { loadSession, saveSession } from "../session/store";
import { createChatModel, providerOptions } from "../providers/deepseek";
import { buildSkillsPrompt, collectSkillBashPatterns, createSkillActivationTool } from "../skills/loader";
import { createBashTool } from "../tools/bash";
import { loadMcpTools } from "../tools/mcp";
import { TerminalRenderer } from "./render";

export async function runPrompt(config: AppConfig, prompt: string, skills: Skill[]): Promise<void> {
  if (!config.provider.apiKey) {
    throw new Error("Missing provider.apiKey. Run `ai --config` or set it in ~/.config/aichat/aichat.json.");
  }

  const session = await loadSession(config);
  const model = createChatModel(config);
  const mcp = await loadMcpTools(config);

  try {
    const tools: ToolSet = {
      ...mcp.tools,
      ...createSkillActivationTool(skills),
      ...createBashTool(config, collectSkillBashPatterns(skills)),
    };

    const messages: ModelMessage[] = [
      ...session.messages,
      {
        role: "user",
        content: prompt,
      },
    ];

    const renderer = new TerminalRenderer(config.provider.thinking.showReasoning);
    let finalText = "";

    const result = streamText({
      model,
      messages,
      tools,
      stopWhen: stepCountIs(8),
      providerOptions: providerOptions(config),
      system: buildSystemPrompt(skills, mcp.instructions),
      onError: ({ error }) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`\n[error] ${message}\n`);
      },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          finalText += part.text;
          renderer.appendText(part.text);
          break;
        case "reasoning-delta":
          renderer.appendReasoning(part.text);
          break;
        case "tool-call":
          break;
        case "tool-result":
          break;
        case "tool-error":
          renderer.toolStatus(`[tool:${part.toolName}] failed`);
          break;
        case "error": {
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          renderer.toolStatus(`[error] ${message}`);
          break;
        }
      }
    }

    renderer.finish();

    if (finalText.trim()) {
      const nextMessages: SessionMessage[] = [
        ...session.messages,
        { role: "user", content: prompt },
        { role: "assistant", content: finalText },
      ];
      await saveSession(config, nextMessages);
    }
  } finally {
    await mcp.close();
  }
}

function buildSystemPrompt(skills: Skill[], mcpInstructions: string[]): string {
  return [
    "You are a non-interactive command-line AI assistant.",
    "Answer in the same language as the user unless the user asks otherwise.",
    currentDatePrompt(),
    "Use available MCP tools and local skills when they materially improve the answer.",
    "For current facts such as weather, news, prices, or schedules, use configured tools instead of guessing.",
    buildSkillsPrompt(skills),
    ...mcpInstructions,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function currentDatePrompt(): string {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetRemainder = Math.abs(offsetMinutes) % 60;
  const offset = `GMT${offsetSign}${pad(offsetHours)}:${pad(offsetRemainder)}`;
  const localDateTime = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-");
  const localTime = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(":");

  return `Current local date/time: ${localDateTime} ${localTime} ${offset}. Use this when interpreting relative dates such as today, tomorrow, and yesterday.`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
