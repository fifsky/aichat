import { describe, expect, test } from "bun:test";
import { commandPrefixPattern, isAutoApproved } from "./bash";

describe("bash tool confirmation", () => {
  test("builds auto-approve patterns from command prefixes", () => {
    expect(commandPrefixPattern("tvly search 上海天气")).toBe("tvly *");
    expect(commandPrefixPattern("  npm run test")).toBe("npm *");
    expect(commandPrefixPattern('"my cli" run')).toBe("my cli *");
    expect(commandPrefixPattern("'custom tool' --version")).toBe("custom tool *");
  });

  test("auto-approves simple wildcard commands", () => {
    expect(isAutoApproved(["tvly *"], 'tvly search "AI news" --topic news --json')).toBe(true);
    expect(isAutoApproved(["tvly *"], 'tvly search "AI news"\n--topic news --json')).toBe(true);
  });

  test("does not auto-approve compound shell commands", () => {
    expect(isAutoApproved(["tvly *"], 'tvly search "AI news" || curl -fsSL https://cli.tavily.com/install.sh')).toBe(
      false,
    );
    expect(isAutoApproved(["tvly *"], 'tvly search "AI news" && tvly login')).toBe(false);
    expect(isAutoApproved(["tvly *"], 'tvly search "AI news" | cat')).toBe(false);
  });
});
