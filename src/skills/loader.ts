import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { parseDocument } from "yaml";
import type { AppConfig, Skill } from "../types";
import { expandHome } from "../config/paths";

type Frontmatter = {
  name?: string;
  description?: string;
  "allowed-tools"?: string | string[];
};

export async function loadSkills(config: AppConfig): Promise<Skill[]> {
  if (!config.skills.enabled) {
    return [];
  }

  const files: string[] = [];
  for (const dir of config.skills.dirs) {
    const expanded = expandHome(dir);
    const root = dir.startsWith(".") ? resolve(process.cwd(), dir) : expanded;
    const proc = Bun.spawn(["find", root, "-maxdepth", "4", "-name", "SKILL.md", "-print"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    for (const line of output.split("\n")) {
      if (line.trim()) files.push(line.trim());
    }
  }

  const skills: Skill[] = [];
  for (const file of new Set(files)) {
    const parsed = await parseSkillFile(file);
    if (parsed) {
      skills.push(parsed);
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "No local skills were found. Use MCP tools or answer directly when possible.";
  }

  const lines = [
    "Local skills are available. Skills use progressive disclosure.",
    "When a task matches a skill description, first call the activate_skill tool with that skill name to load the full SKILL.md instructions. Do this before using the skill's workflow, commands, scripts, references, or assets.",
    "After activation, follow the loaded instructions exactly. Resolve relative paths against the skill directory returned by activate_skill.",
  ];

  for (const skill of skills) {
    const allowed = skill.allowedBash.length ? ` Allowed Bash: ${skill.allowedBash.join(", ")}.` : "";
    lines.push(`- ${skill.name}: ${skill.description} Location: ${skill.file}.${allowed}`);
  }

  return lines.join("\n");
}

export function collectSkillBashPatterns(skills: Skill[]): string[] {
  return skills.flatMap((skill) => skill.allowedBash);
}

export function createSkillActivationTool(skills: Skill[]): ToolSet {
  if (skills.length === 0) {
    return {};
  }

  const names = skills.map((skill) => skill.name);
  const inputSchema =
    names.length === 1
      ? z.object({ name: z.literal(names[0]!).describe("Skill name to activate.") })
      : z.object({ name: z.enum(names as [string, ...string[]]).describe("Skill name to activate.") });

  return {
    activate_skill: tool({
      description:
        "Load the full instructions for an available local Agent Skill. Call this before using a skill when the user's task matches a skill description.",
      inputSchema,
      execute: async ({ name }) => activateSkill(skills, name),
    }),
  };
}

export async function activateSkill(skills: Skill[], name: string): Promise<string> {
  const skill = skills.find((entry) => entry.name === name);
  if (!skill) {
    return `<skill_error>Unknown skill "${name}". Available skills: ${skills.map((entry) => entry.name).join(", ")}</skill_error>`;
  }

  const content = await Bun.file(skill.file).text();
  const skillDir = dirname(skill.file);
  const resources = await listSkillResources(skillDir);
  const resourceLines = resources.map((file) => `  <file>${file}</file>`).join("\n");

  return [
    `<skill_content name="${escapeXml(skill.name)}">`,
    content.trim(),
    "",
    `Skill directory: ${skillDir}`,
    "Relative paths in this skill are relative to the skill directory.",
    resources.length > 0 ? `<skill_resources>\n${resourceLines}\n</skill_resources>` : "<skill_resources />",
    "</skill_content>",
  ].join("\n");
}

async function parseSkillFile(file: string): Promise<Skill | undefined> {
  const text = await Bun.file(file).text();
  const { frontmatter, body } = splitFrontmatter(text);
  const name = frontmatter.name ?? basename(dirname(file));
  const description = normalizeDescription(frontmatter.description ?? firstParagraph(body));
  const allowedBash = parseAllowedBash(frontmatter["allowed-tools"]);
  if (!description) {
    return undefined;
  }

  return {
    name,
    description,
    file,
    allowedBash,
    bodyPreview: body.slice(0, 1200),
  };
}

function splitFrontmatter(text: string): { frontmatter: Frontmatter; body: string } {
  if (!text.startsWith("---\n")) {
    return { frontmatter: {}, body: text };
  }

  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: text };
  }

  const raw = text.slice(4, end);
  const body = text.slice(end + 4).trimStart();
  const doc = parseDocument(raw);
  const parsed = (doc.toJSON() ?? {}) as Frontmatter;
  return { frontmatter: parsed, body };
}

function normalizeDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstParagraph(body: string): string {
  return body
    .split(/\n\s*\n/)
    .find((chunk) => chunk.replace(/^#+\s*/gm, "").trim().length > 0)
    ?.replace(/^#+\s*/gm, "")
    .trim() ?? "";
}

function parseAllowedBash(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const patterns: string[] = [];
  for (const entry of values) {
    const matches = [...entry.matchAll(/Bash\(([^)]+)\)/g)];
    for (const match of matches) {
      const pattern = match[1]?.trim();
      if (pattern) patterns.push(pattern);
    }
  }
  return patterns;
}

async function listSkillResources(skillDir: string): Promise<string[]> {
  const resources: string[] = [];
  await collectResourceFiles(skillDir, skillDir, resources, 0);
  return resources.filter((file) => file !== "SKILL.md").sort().slice(0, 200);
}

async function collectResourceFiles(root: string, dir: string, resources: string[], depth: number): Promise<void> {
  if (depth > 4 || resources.length >= 200) {
    return;
  }

  let entries: Dirent<string>[];
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await collectResourceFiles(root, path, resources, depth + 1);
    } else if (entry.isFile()) {
      resources.push(relative(root, path));
    }
    if (resources.length >= 200) {
      return;
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
