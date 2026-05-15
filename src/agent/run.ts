import { stepCountIs, ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import type { AppConfig, SessionMessage, Skill } from "../types";
import { loadSession, saveSession } from "../session/store";
import { createChatModel, providerOptions } from "../providers/deepseek";
import { buildSkillsPrompt, collectSkillBashPatterns, createLoadSkillTool } from "../skills/loader";
import { createBashTool } from "../tools/bash";
import { loadMcpTools } from "../tools/mcp";
import { TerminalRenderer } from "./render";

const callOptionsSchema = z.object({
  skills: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      file: z.string(),
      allowedBash: z.array(z.string()),
      bodyPreview: z.string(),
    }),
  ),
});

type AgentCallOptions = z.infer<typeof callOptionsSchema>;

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
      ...createLoadSkillTool(),
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

    const agent = new ToolLoopAgent<AgentCallOptions, ToolSet>({
      model,
      tools,
      stopWhen: stepCountIs(8),
      providerOptions: providerOptions(config),
      instructions: buildBaseInstructions(mcp.instructions),
      callOptionsSchema,
      prepareCall: ({ options, ...settings }) => ({
        ...settings,
        instructions: `${settings.instructions ?? ""}\n\n${buildSkillsPrompt(options.skills)}`,
        experimental_context: {
          skills: options.skills,
        },
      }),
    });

    const result = await agent.stream({
      messages,
      options: { skills },
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
          if (shouldShowToolStatus(part.toolName)) {
            renderer.toolStatus(`[mcp:${part.toolName}] calling ${formatToolInput(part.input)}`);
          }
          break;
        case "tool-result":
          if (shouldShowToolStatus(part.toolName)) {
            renderer.toolStatus(`[mcp:${part.toolName}] completed`);
          }
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

function buildBaseInstructions(mcpInstructions: string[]): string {
  return [
    "You are a non-interactive command-line AI assistant.",
    "Answer in the same language as the user unless the user asks otherwise.",
    currentDatePrompt(),
    "Use available MCP tools and local skills when they materially improve the answer.",
    "For current facts such as weather, news, prices, or schedules, use configured tools instead of guessing.",
    ...mcpInstructions,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function shouldShowToolStatus(toolName: string): boolean {
  return toolName !== "bash" && toolName !== "loadSkill";
}

function formatToolInput(input: unknown): string {
  if (input == null) {
    return "";
  }
  try {
    const value = JSON.stringify(input);
    if (!value || value === "{}") {
      return "";
    }
    return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  } catch {
    return "";
  }
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
