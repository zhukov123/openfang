import { z } from "zod";
import "dotenv/config";

export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_AUTH_TOKEN: z.string().optional().default(""),
  ANTHROPIC_BASE_URL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? undefined : value,
    z
      .string()
      .url("ANTHROPIC_BASE_URL must be a valid URL")
      .optional()
      .default(DEFAULT_ANTHROPIC_BASE_URL)
  ),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? undefined : value,
    z
      .string()
      .url("OPENAI_BASE_URL must be a valid URL")
      .optional()
      .default(DEFAULT_OPENAI_BASE_URL)
  ),
  OPENAI_AUTH_MODE: z.enum(["api_key", "codex"]).default("api_key"),
  CODEX_AUTH_FILE: z.string().optional().default("~/.codex/auth.json"),
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
  WEB_PORT: z.coerce.number().default(3000),
  WEB_AUTH_PASSWORD: z.string().optional().default(""),
  DATABASE_URL: z.string().optional().default("./data/openfang.db"),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Environment validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
