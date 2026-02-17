import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { config } from "../db/schema.js";

export type AiProvider = "anthropic" | "openai-codex";
export type OpenAIAuthMode = "api_key" | "codex";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_OPENAI_CODEX_MODEL = "gpt-5.3-codex";

export function getConfigValue<T = unknown>(key: string): T | null {
  const db = getDb();
  const row = db.select().from(config).where(eq(config.key, key)).get();
  if (!row) return null;
  return JSON.parse(row.value) as T;
}

export function getAiProvider(): AiProvider {
  const value = getConfigValue<string>("ai_provider");
  return value === "openai-codex" ? "openai-codex" : "anthropic";
}

export function getConfiguredModel(): string {
  const configured = getConfigValue<string>("model");
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  return getAiProvider() === "openai-codex"
    ? DEFAULT_OPENAI_CODEX_MODEL
    : DEFAULT_ANTHROPIC_MODEL;
}

export function getSystemPrompt(): string {
  return (
    getConfigValue<string>("system_prompt") ??
    "You are OpenFang, a helpful personal AI assistant."
  );
}

export function getMaxContextMessages(): number {
  return getConfigValue<number>("max_context_messages") ?? 50;
}

export function getOpenAIAuthMode(defaultMode: OpenAIAuthMode): OpenAIAuthMode {
  const configured = getConfigValue<string>("openai_auth_mode");
  if (configured === "codex" || configured === "api_key") {
    return configured;
  }
  return defaultMode;
}
