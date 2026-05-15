import { z } from "zod";
import type { AppConfig } from "../types";
import { DEFAULT_SESSION_PATH } from "./paths";

const mcpServerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
  }),
  z.object({
    type: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
  }),
  z.object({
    type: z.literal("sse"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
  }),
]);

export const appConfigSchema = z.object({
  provider: z
    .object({
      name: z.string().default("deepseek"),
      baseURL: z.url().default("https://api.deepseek.com"),
      apiKey: z.string().default(""),
      model: z.string().default("deepseek-v4-pro"),
      thinking: z
        .object({
          enabled: z.boolean().default(true),
          reasoningEffort: z.string().default("high"),
          showReasoning: z.boolean().default(true),
        })
        .default({ enabled: true, reasoningEffort: "high", showReasoning: true }),
    })
    .default({
      name: "deepseek",
      baseURL: "https://api.deepseek.com",
      apiKey: "",
      model: "deepseek-v4-pro",
      thinking: { enabled: true, reasoningEffort: "high", showReasoning: true },
    }),
  mcpServers: z.record(z.string(), mcpServerSchema).default({}),
  skills: z
    .object({
      enabled: z.boolean().default(true),
      dirs: z.array(z.string()).default(["~/.agents/skills"]),
    })
    .default({ enabled: true, dirs: ["~/.agents/skills"] }),
  tools: z
    .object({
      ask: z
        .object({
          enabled: z.boolean().default(true),
        })
        .default({ enabled: true }),
      bash: z
        .object({
          enabled: z.boolean().default(true),
          autoApprove: z.array(z.string()).default(["tvly *"]),
          timeoutMs: z.number().int().positive().default(60_000),
        })
        .default({ enabled: true, autoApprove: ["tvly *"], timeoutMs: 60_000 }),
    })
    .default({ ask: { enabled: true }, bash: { enabled: true, autoApprove: ["tvly *"], timeoutMs: 60_000 } }),
  session: z
    .object({
      path: z.string().default(DEFAULT_SESSION_PATH),
      maxMessages: z.number().int().positive().default(100),
    })
    .default({ path: DEFAULT_SESSION_PATH, maxMessages: 100 }),
});

export const defaultConfig: AppConfig = appConfigSchema.parse({});
