import { basename, dirname, resolve } from "node:path";
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
    "Local skills are available. Use them when their descriptions match the user request.",
    "If a skill allows Bash commands, call the bash tool with a command matching the allowed pattern.",
  ];

  for (const skill of skills) {
    const allowed = skill.allowedBash.length ? ` Allowed Bash: ${skill.allowedBash.join(", ")}.` : "";
    lines.push(`- ${skill.name}: ${skill.description}${allowed}`);
  }

  return lines.join("\n");
}

export function collectSkillBashPatterns(skills: Skill[]): string[] {
  return skills.flatMap((skill) => skill.allowedBash);
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
