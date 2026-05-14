import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../config/schema";
import { collectSkillBashPatterns, loadSkills } from "./loader";

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
});
