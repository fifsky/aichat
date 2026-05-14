import { dirname } from "node:path";
import { z } from "zod";
import type { AppConfig } from "../types";
import { CONFIG_PATH, ensureDir, expandHome } from "./paths";
import { appConfigSchema, defaultConfig } from "./schema";

export function configPath(): string {
  return expandHome(CONFIG_PATH);
}

export async function loadConfig(): Promise<AppConfig> {
  const path = configPath();
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return defaultConfig;
  }

  const raw = await file.text();
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  return appConfigSchema.parse(parsed);
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const path = configPath();
  await ensureDir(dirname(path));
  await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
}

export async function ensureConfigFile(): Promise<AppConfig> {
  const path = configPath();
  const file = Bun.file(path);
  if (await file.exists()) {
    return loadConfig();
  }
  await saveConfig(defaultConfig);
  return defaultConfig;
}

export function redact(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 10) {
    return "<redacted>";
  }
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

export function applySet(config: AppConfig, pair: string): AppConfig {
  const index = pair.indexOf("=");
  if (index === -1) {
    throw new Error(`Invalid --set value "${pair}". Expected key=value.`);
  }

  const key = pair.slice(0, index).trim();
  const rawValue = pair.slice(index + 1);
  const value = parseScalar(rawValue);
  const next = structuredClone(config) as Record<string, unknown>;
  const parts = key.split(".").filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid --set key "${key}".`);
  }

  let current: Record<string, unknown> = next;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (existing == null || typeof existing !== "object" || Array.isArray(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;

  return appConfigSchema.parse(next);
}

function parseScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function explainConfigError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
