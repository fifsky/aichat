import { resolve } from "node:path";
import { homedir } from "node:os";

export const CONFIG_PATH = "~/.config/aichat/aichat.json";
export const DEFAULT_SESSION_PATH = "~/.aichat/sessions/default.json";

export function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

export async function ensureDir(path: string): Promise<void> {
  await Bun.$`mkdir -p ${path}`.quiet();
}
