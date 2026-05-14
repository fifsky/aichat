import { dirname } from "node:path";
import type { AppConfig, SessionFile, SessionMessage } from "../types";
import { ensureDir, expandHome } from "../config/paths";

export async function loadSession(config: AppConfig): Promise<SessionFile> {
  const path = expandHome(config.session.path);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { messages: [] };
  }

  const raw = await file.text();
  if (!raw.trim()) {
    return { messages: [] };
  }

  const parsed = JSON.parse(raw) as SessionFile;
  return {
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    updatedAt: parsed.updatedAt,
  };
}

export async function saveSession(config: AppConfig, messages: SessionMessage[]): Promise<void> {
  const path = expandHome(config.session.path);
  await ensureDir(dirname(path));
  const maxMessages = config.session.maxMessages;
  const trimmed = messages.slice(Math.max(0, messages.length - maxMessages));
  await Bun.write(
    path,
    `${JSON.stringify(
      {
        messages: trimmed,
        updatedAt: new Date().toISOString(),
      } satisfies SessionFile,
      null,
      2,
    )}\n`,
  );
}

export async function cleanSession(config: AppConfig): Promise<void> {
  const path = expandHome(config.session.path);
  await ensureDir(dirname(path));
  await Bun.write(path, `${JSON.stringify({ messages: [], updatedAt: new Date().toISOString() }, null, 2)}\n`);
}
