import Anthropic from "@anthropic-ai/sdk";
import { env, DEFAULT_ANTHROPIC_BASE_URL } from "../env.js";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const baseURL = env.ANTHROPIC_BASE_URL.trim();
    const apiKey = env.ANTHROPIC_API_KEY.trim();
    const authToken = env.ANTHROPIC_AUTH_TOKEN.trim();
    const hasApiKey = apiKey.length > 0;
    const hasAuthToken = authToken.length > 0;
    const usingDefaultEndpoint =
      baseURL === DEFAULT_ANTHROPIC_BASE_URL || baseURL.length === 0;

    _client = new Anthropic({
      apiKey: hasApiKey ? apiKey : !usingDefaultEndpoint && !hasAuthToken ? "gateway-no-key" : undefined,
      authToken: hasAuthToken ? authToken : undefined,
      // Allow custom Anthropic-compatible gateways (OpenClaw-style bridges, local relays, etc.).
      baseURL: usingDefaultEndpoint ? undefined : baseURL,
    });
  }
  return _client;
}

export function resetAnthropicClient() {
  _client = null;
}
