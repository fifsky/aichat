#!/usr/bin/env bun
import { Command } from "commander";
import { version } from "../package.json";
import { configureCommand } from "./commands/config";
import { cleanCommand } from "./commands/clean";
import { runCommand } from "./commands/run";
import { explainConfigError } from "./config";

const program = new Command();
const setValues: string[] = [];

program
  .name("ai")
  .description("Non-interactive AI command-line assistant with MCP and local skills.")
  .version(version)
  .option("--config", "configure provider, MCP, skills, and tools")
  .option("--clean", "clear the default session context")
  .option("--set <key=value>", "set a config value; can be repeated", (value) => {
    setValues.push(value);
    return setValues;
  })
  .argument("[prompt...]", "prompt to send")
  .action(async (prompt: string[], options: { config?: boolean; clean?: boolean }) => {
    try {
      if (options.clean) {
        await cleanCommand();
        return;
      }

      if (options.config) {
        await configureCommand(setValues);
        return;
      }

      await runCommand(prompt);
    } catch (error) {
      process.stderr.write(`${explainConfigError(error)}\n`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
