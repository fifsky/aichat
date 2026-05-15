import type { ToolSet } from "ai";

export type ProviderConfig = {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  thinking: {
    enabled: boolean;
    reasoningEffort: string;
    showReasoning: boolean;
  };
};

export type McpServerConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      type: "http" | "sse";
      url: string;
      headers?: Record<string, string>;
    };

export type AppConfig = {
  provider: ProviderConfig;
  mcpServers: Record<string, McpServerConfig>;
  skills: {
    enabled: boolean;
    dirs: string[];
  };
  tools: {
    ask: {
      enabled: boolean;
    };
    bash: {
      enabled: boolean;
      autoApprove: string[];
      timeoutMs: number;
    };
  };
  session: {
    path: string;
    maxMessages: number;
  };
};

export type SessionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SessionFile = {
  messages: SessionMessage[];
  updatedAt?: string;
};

export type Skill = {
  name: string;
  description: string;
  file: string;
  allowedBash: string[];
  bodyPreview: string;
};

export type LoadedTools = {
  tools: ToolSet;
  instructions: string[];
  close: () => Promise<void>;
};
