import OpenAI from "openai";
import { DEFAULT_OPENAI_BASE_URL, env } from "../env.js";
import { getOpenAIAuthMode, type OpenAIAuthMode } from "./config.js";
import { loadCodexAuthData } from "./codex-auth.js";

function resolveOpenAIAuthMode(): OpenAIAuthMode {
  return getOpenAIAuthMode(env.OPENAI_AUTH_MODE);
}

export function getOpenAIClient(): OpenAI {
  const authMode = resolveOpenAIAuthMode();
  const baseURL = env.OPENAI_BASE_URL.trim() || DEFAULT_OPENAI_BASE_URL;

  if (authMode === "codex") {
    // Validate early so users get an actionable startup/runtime error.
    const authData = loadCodexAuthData(env.CODEX_AUTH_FILE);
    return new OpenAI({
      apiKey: async () => loadCodexAuthData(env.CODEX_AUTH_FILE).accessToken,
      baseURL,
      defaultHeaders: authData.accountId
        ? { "ChatGPT-Account-Id": authData.accountId }
        : undefined,
    });
  }

  if (env.OPENAI_API_KEY.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY is empty. Set OPENAI_API_KEY or switch openai_auth_mode to codex."
    );
  }

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL,
  });
}
