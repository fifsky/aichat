import { loadConfig } from "../config";
import { loadSkills } from "../skills/loader";
import { runPrompt } from "../agent/run";

export async function runCommand(promptParts: string[]): Promise<void> {
  const prompt = promptParts.join(" ").trim();
  if (!prompt) {
    throw new Error("Missing prompt. Usage: ai 今天天气怎么样");
  }

  const config = await loadConfig();
  const skills = await loadSkills(config);
  await runPrompt(config, prompt, skills);
}
