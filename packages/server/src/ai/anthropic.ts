import Anthropic from "@anthropic-ai/sdk";
import { env, DEFAULT_ANTHROPIC_BASE_URL } from "../env.js";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const baseURL = env.ANTHROPIC_BASE_URL.trim();
    const apiKey =
      env.ANTHROPIC_API_KEY.trim().length > 0
        ? env.ANTHROPIC_API_KEY
        : "gateway-no-key";

    _client = new Anthropic({
      apiKey,
      // Allow custom Anthropic-compatible gateways (OpenClaw-style bridges, local relays, etc.).
      baseURL:
        baseURL === DEFAULT_ANTHROPIC_BASE_URL || baseURL.length === 0
          ? undefined
          : baseURL,
    });
  }
  return _client;
}

export function resetAnthropicClient() {
  _client = null;
}
