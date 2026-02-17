import { getAnthropicClient } from "../ai/anthropic.js";
import { executeToolCall, getEnabledToolDefinitions } from "../ai/tools/index.js";
import { getDb } from "../db/index.js";
import { config } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";

function getConfigValue(key: string): string | null {
  const db = getDb();
  const row = db.select().from(config).where(eq(config.key, key)).get();
  return row ? JSON.parse(row.value) : null;
}

/**
 * Execute a scheduled prompt through Claude, with optional tool access.
 * Returns the final text response.
 */
export async function executeScheduledPrompt(
  prompt: string,
  toolsEnabled: boolean
): Promise<string> {
  const client = getAnthropicClient();
  const model = getConfigValue("model") ?? "claude-sonnet-4-20250514";
  const systemPrompt =
    getConfigValue("system_prompt") ??
    "You are OpenFang, a helpful personal AI assistant.";

  const toolDefs = toolsEnabled ? getEnabledToolDefinitions() : [];

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  let finalText = "";

  // Tool-use loop (max 10 iterations to prevent runaway)
  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: `${systemPrompt}\n\nThis is a scheduled task running automatically. Provide a concise, useful response.`,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      messages,
    });

    let hasToolUse = false;
    const assistantContent: Anthropic.ContentBlock[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      assistantContent.push(block);

      if (block.type === "text") {
        finalText += block.text;
      } else if (block.type === "tool_use") {
        hasToolUse = true;

        let result: string;
        let isError = false;
        try {
          result = await executeToolCall(block.name, block.input as Record<string, unknown>);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          isError = true;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
          is_error: isError,
        });
      }
    }

    if (hasToolUse) {
      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });
    } else {
      break;
    }

    if (response.stop_reason === "end_turn") {
      break;
    }
  }

  return finalText;
}
