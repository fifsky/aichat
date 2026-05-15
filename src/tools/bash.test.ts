import { describe, expect, test } from "bun:test";
import { commandPrefixPattern } from "./bash";

describe("bash tool confirmation", () => {
  test("builds auto-approve patterns from command prefixes", () => {
    expect(commandPrefixPattern("tvly search 上海天气")).toBe("tvly *");
    expect(commandPrefixPattern("  npm run test")).toBe("npm *");
    expect(commandPrefixPattern('"my cli" run')).toBe("my cli *");
    expect(commandPrefixPattern("'custom tool' --version")).toBe("custom tool *");
  });
});
