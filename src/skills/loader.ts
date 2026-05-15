import { basename, dirname, resolve } from "node:path";
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
  const seenNames = new Set<string>();
  for (const file of new Set(files)) {
    const parsed = await parseSkillFile(file);
    if (parsed) {
      if (seenNames.has(parsed.name)) {
        continue;
      }
      seenNames.add(parsed.name);
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
    "## Skills",
    "",
    "Use the `loadSkill` tool to load a skill when the user's request would benefit from specialized instructions.",
    "",
    "Available skills:",
  ];

  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description}`);
  }

  return lines.join("\n");
}

export function collectSkillBashPatterns(skills: Skill[]): string[] {
  return skills.flatMap((skill) => skill.allowedBash);
}

export function createLoadSkillTool(): ToolSet {
  return {
    loadSkill: tool({
      description: "Load a skill to get specialized instructions.",
      inputSchema: z.object({
        name: z.string().describe("The skill name to load."),
      }),
      execute: async ({ name }, { experimental_context }) => {
        const context = experimental_context as { skills?: Skill[] } | undefined;
        return loadSkill(context?.skills ?? [], name);
      },
    }),
  };
}

export async function loadSkill(skills: Skill[], name: string) {
  const skill = skills.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!skill) {
    return { error: `Skill '${name}' not found` };
  }

  const content = await Bun.file(skill.file).text();
  const skillDir = dirname(skill.file);
  return {
    skillDirectory: skillDir,
    content: stripFrontmatter(content),
  };
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

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
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
