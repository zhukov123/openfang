import { getAnthropicClient } from "../ai/anthropic.js";
import { getOpenAIClient } from "../ai/openai.js";
import { runOpenAIToolLoop } from "../ai/openai-tool-loop.js";
import {
  executeToolCall,
  getEnabledOpenAIToolDefinitions,
  getEnabledToolDefinitions,
} from "../ai/tools/index.js";
import { getAiProvider, getConfiguredModel, getSystemPrompt } from "../ai/config.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Execute a scheduled prompt through the configured model provider, with optional tool access.
 * Returns the final text response.
 */
export async function executeScheduledPrompt(
  prompt: string,
  toolsEnabled: boolean
): Promise<string> {
  const provider = getAiProvider();
  const model = getConfiguredModel();
  const systemPrompt = getSystemPrompt();
  const scheduledSystemPrompt = `${systemPrompt}\n\nThis is a scheduled task running automatically. Provide a concise, useful response.`;

  if (provider === "openai-codex") {
    const client = getOpenAIClient();
    const toolDefs = toolsEnabled ? getEnabledOpenAIToolDefinitions() : [];
    const result = await runOpenAIToolLoop({
      client,
      model,
      systemPrompt: scheduledSystemPrompt,
      tools: toolDefs,
      messages: [{ role: "user", content: prompt }],
      maxIterations: 10,
    });
    return result.finalText;
  }

  const client = getAnthropicClient();
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
      system: scheduledSystemPrompt,
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
