import { z } from "zod";
import dotenv from "dotenv";
import { resolve } from "path";

// Load .env from workspace root (two levels up from packages/server)
dotenv.config({ path: resolve(import.meta.dirname ?? ".", "../../.env") });
dotenv.config({ path: resolve(import.meta.dirname ?? ".", "../../../.env") });
dotenv.config(); // also try cwd

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
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
