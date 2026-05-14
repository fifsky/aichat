import { createInterface } from "node:readline/promises";
import { stdin as input, stderr as output } from "node:process";
import { z } from "zod";
import { tool, type ToolSet } from "ai";
import type { AppConfig } from "../types";

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
        const approved = autoApprove.some((pattern) => matchesPattern(pattern, command));
        if (!approved) {
          const ok = await confirmCommand(command, workingDir);
          if (!ok) {
            return {
              ok: false,
              denied: true,
              stdout: "",
              stderr: "Command execution denied by user.",
              exitCode: null,
            };
          }
        }

        output.write(`\n[tool:bash] ${approved ? "auto-approved" : "approved"} ${command}\n`);
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

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
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
      stdout: truncate(stdout),
      stderr: truncate(stderr),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function confirmCommand(command: string, cwd: string): Promise<boolean> {
  output.write(`\n[tool:bash] The model wants to run a command.\n`);
  output.write(`cwd: ${cwd}\n`);
  output.write(`command: ${command}\n`);
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Execute this command? [y/N] ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

function matchesPattern(pattern: string, command: string): boolean {
  const regex = new RegExp(`^${escapeRegExp(pattern).replaceAll("\\*", ".*")}$`);
  return regex.test(command.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function truncate(value: string, max = 16_000): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`;
}
