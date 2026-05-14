import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../config/schema";
import { loadSession, saveSession } from "./store";

describe("session store", () => {
  test("trims messages to maxMessages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aichat-session-"));
    const config = structuredClone(defaultConfig);
    config.session.path = join(dir, "default.json");
    config.session.maxMessages = 3;

    await saveSession(config, [
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
      { role: "assistant", content: "4" },
    ]);

    const session = await loadSession(config);
    expect(session.messages.map((message) => message.content)).toEqual(["2", "3", "4"]);
  });
});
