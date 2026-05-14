import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolSet } from "ai";
import type { AppConfig, LoadedTools, McpServerConfig } from "../types";

export async function loadMcpTools(config: AppConfig): Promise<LoadedTools> {
  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const instructions: string[] = [];

  for (const [name, server] of Object.entries(config.mcpServers)) {
    try {
      const client = await createMcpClient(name, server);
      clients.push(client);
      if (client.instructions) {
        instructions.push(`MCP ${name}: ${client.instructions}`);
      }

      const serverTools = await client.tools();
      for (const [toolName, value] of Object.entries(serverTools)) {
        const key = tools[toolName] == null ? toolName : `${sanitizeName(name)}_${toolName}`;
        tools[key] = value;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[mcp:${name}] failed to load: ${message}\n`);
    }
  }

  return {
    tools,
    instructions,
    close: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
  };
}

async function createMcpClient(name: string, server: McpServerConfig): Promise<MCPClient> {
  if (server.type === "stdio") {
    return createMCPClient({
      clientName: `aichat-${name}`,
      transport: new StdioClientTransport({
        command: server.command,
        args: server.args ?? [],
        env: { ...process.env, ...(server.env ?? {}) } as Record<string, string>,
      }),
    });
  }

  return createMCPClient({
    clientName: `aichat-${name}`,
    transport: {
      type: server.type,
      url: server.url,
      headers: server.headers,
    },
  });
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
