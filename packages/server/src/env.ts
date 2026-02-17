import { z } from "zod";
import "dotenv/config";

export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

const envSchema = z
  .object({
    DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
    ANTHROPIC_API_KEY: z.string().optional().default(""),
    ANTHROPIC_BASE_URL: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim().length === 0 ? undefined : value,
      z
        .string()
        .url("ANTHROPIC_BASE_URL must be a valid URL")
        .optional()
        .default(DEFAULT_ANTHROPIC_BASE_URL)
    ),
    BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
    WEB_PORT: z.coerce.number().default(3000),
    WEB_AUTH_PASSWORD: z.string().optional().default(""),
    DATABASE_URL: z.string().optional().default("./data/openfang.db"),
  })
  .superRefine((data, ctx) => {
    const usingOfficialEndpoint =
      normalizeBaseUrl(data.ANTHROPIC_BASE_URL) ===
      normalizeBaseUrl(DEFAULT_ANTHROPIC_BASE_URL);

    // Official Anthropic API requires a real key. Custom gateways may not.
    if (usingOfficialEndpoint && data.ANTHROPIC_API_KEY.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message:
          "ANTHROPIC_API_KEY is required when using the official Anthropic endpoint.",
      });
    }
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
