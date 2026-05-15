import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../config/schema";
import { activateSkill, buildSkillsPrompt, collectSkillBashPatterns, loadSkills } from "./loader";

describe("skills loader", () => {
  test("loads SKILL.md frontmatter and bash patterns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aichat-skills-"));
    const skillDir = join(dir, "tavily-search");
    await Bun.$`mkdir -p ${skillDir}`.quiet();
    await Bun.write(
      join(skillDir, "SKILL.md"),
      `---
name: tavily-search
description: Search the web using Tavily.
allowed-tools: Bash(tvly *)
---

# Tavily Search
`,
    );

    const config = structuredClone(defaultConfig);
    config.skills.dirs = [dir];

    const skills = await loadSkills(config);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("tavily-search");
    expect(collectSkillBashPatterns(skills)).toEqual(["tvly *"]);
  });

  test("builds a progressive-disclosure catalog with skill locations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aichat-skills-"));
    const skillDir = join(dir, "tavily-search");
    await Bun.$`mkdir -p ${skillDir}`.quiet();
    await Bun.write(
      join(skillDir, "SKILL.md"),
      `---
name: tavily-search
description: Search the web using Tavily.
---

# Tavily Search
`,
    );

    const config = structuredClone(defaultConfig);
    config.skills.dirs = [dir];

    const skills = await loadSkills(config);
    const prompt = buildSkillsPrompt(skills);

    expect(prompt).toContain("activate_skill");
    expect(prompt).toContain("tavily-search");
    expect(prompt).toContain(join(skillDir, "SKILL.md"));
  });

  test("activates a skill with full instructions and resource listing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aichat-skills-"));
    const skillDir = join(dir, "tavily-search");
    await Bun.$`mkdir -p ${join(skillDir, "references")}`.quiet();
    await Bun.write(
      join(skillDir, "SKILL.md"),
      `---
name: tavily-search
description: Search the web using Tavily.
allowed-tools: Bash(tvly *)
---

# Tavily Search

Use \`tvly search "AI news" --topic news --json\`.
`,
    );
    await Bun.write(join(skillDir, "references", "usage.md"), "# Usage");

    const config = structuredClone(defaultConfig);
    config.skills.dirs = [dir];

    const skills = await loadSkills(config);
    const content = await activateSkill(skills, "tavily-search");

    expect(content).toContain('<skill_content name="tavily-search">');
    expect(content).toContain('tvly search "AI news" --topic news --json');
    expect(content).toContain(`Skill directory: ${skillDir}`);
    expect(content).toContain("<file>references/usage.md</file>");
  });
});
