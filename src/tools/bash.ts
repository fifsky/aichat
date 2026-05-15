import { stderr as output, stdout as terminalOutput } from "node:process";
import { isCancel, select } from "@clack/prompts";
import { z } from "zod";
import { tool, type ToolSet } from "ai";
import type { AppConfig } from "../types";
import { saveConfig } from "../config";

type ConfirmAction = "approve" | "approve-and-remember" | "deny";
type TerminalWriter = {
  write(chunk: string): boolean;
};

export function createBashTool(config: AppConfig, extraPatterns: string[]): ToolSet {
  if (!config.tools.bash.enabled) {
    return {};
  }

  const autoApprove = [...config.tools.bash.autoApprove, ...extraPatterns];

  return {
    bash: tool({
      description:
        "Execute a bash command on the local machine. Use this only when a matching skill or MCP workflow requires shell execution.",
      inputSchema: z.object({
        command: z.string().min(1).describe("Command to execute via bash -lc."),
        cwd: z.string().optional().describe("Working directory. Defaults to the current process directory."),
        timeoutMs: z.number().int().positive().optional().describe("Optional timeout in milliseconds."),
      }),
      execute: async ({ command, cwd, timeoutMs }) => {
        const workingDir = cwd ?? process.cwd();
        const approved = isAutoApproved(autoApprove, command);
        if (!approved) {
          const action = await confirmCommand(command);
          if (action === "deny") {
            return {
              ok: false,
              denied: true,
              stdout: "",
              stderr: "Command execution denied by user.",
              exitCode: null,
            };
          }
          if (action === "approve-and-remember") {
            const pattern = commandPrefixPattern(command);
            await addAutoApprovePattern(config, autoApprove, pattern);
            output.write(`[tool:bash] added auto-approve pattern: ${pattern}\n`);
          }
        } else {
          output.write(`\nExecute command: ${command}\n`);
        }

        return runCommand(command, workingDir, timeoutMs ?? config.tools.bash.timeoutMs);
      },
    }),
  };
}

async function runCommand(command: string, cwd: string, timeoutMs: number) {
  const proc = Bun.spawn(["bash", "-lc", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  const stdoutPromise = readAndForward(proc.stdout, terminalOutput);
  const stderrPromise = readAndForward(proc.stderr, output);
  const timeout = setTimeout(() => {
    proc.kill();
  }, timeoutMs);

  try {
    const exitCode = await proc.exited;
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    return {
      ok: exitCode === 0,
      timedOut: false,
      exitCode,
      stdout,
      stderr,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readAndForward(stream: ReadableStream<Uint8Array>, writer: TerminalWriter): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      result += chunk;
      writer.write(chunk);
    }
  }

  const tail = decoder.decode();
  if (tail) {
    result += tail;
    writer.write(tail);
  }

  return result;
}

async function confirmCommand(command: string): Promise<ConfirmAction> {
  const action = await select<ConfirmAction>({
    message: `Execute command: ${command}`,
    options: [
      { value: "approve", label: "确认执行" },
      {
        value: "approve-and-remember",
        label: "执行并记住前缀",
        hint: commandPrefixPattern(command),
      },
      { value: "deny", label: "取消执行" },
    ],
  });

  if (isCancel(action)) {
    return "deny";
  }
  return action;
}

export function commandPrefixPattern(command: string): string {
  const firstToken = command.trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const commandName = firstToken?.[1] ?? firstToken?.[2] ?? firstToken?.[3] ?? command.trim();
  return `${commandName} *`;
}

async function addAutoApprovePattern(config: AppConfig, currentPatterns: string[], pattern: string): Promise<void> {
  if (!config.tools.bash.autoApprove.includes(pattern)) {
    config.tools.bash.autoApprove = [...config.tools.bash.autoApprove, pattern];
    await saveConfig(config);
  }
  if (!currentPatterns.includes(pattern)) {
    currentPatterns.push(pattern);
  }
}

function matchesPattern(pattern: string, command: string): boolean {
  const regex = new RegExp(`^${globToRegex(pattern)}$`, "s");
  return regex.test(normalizeCommand(command));
}

export function isAutoApproved(patterns: string[], command: string): boolean {
  return isSimpleCommand(command) && patterns.some((pattern) => matchesPattern(pattern, command));
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

function globToRegex(pattern: string): string {
  return escapeRegExp(normalizeCommand(pattern)).replaceAll("\\*", ".*");
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function isSimpleCommand(command: string): boolean {
  return !/(^|[^&|;])(&&|\|\||;|\|)([^&|;]|$)/.test(command);
}
