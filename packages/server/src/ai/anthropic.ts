import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function resetAnthropicClient() {
  _client = null;
}
