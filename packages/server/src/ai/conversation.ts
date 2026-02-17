import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "./anthropic.js";
import { executeToolCall, getEnabledToolDefinitions } from "./tools/index.js";
import { getDb } from "../db/index.js";
import { config, conversations, messages } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; toolName: string; toolId: string; input: unknown }
  | {
      type: "tool_result";
      toolId: string;
      result: string;
      durationMs: number;
      isError: boolean;
    }
  | {
      type: "message_complete";
      content: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "memory_extracted"; facts: Array<{ content: string; category: string }> }
  | { type: "error"; message: string };

function getConfigValue(key: string): string | null {
  const db = getDb();
  const row = db.select().from(config).where(eq(config.key, key)).get();
  return row ? JSON.parse(row.value) : null;
}

export async function getConversationHistory(
  conversationId: string,
  limit?: number
): Promise<Anthropic.MessageParam[]> {
  const db = getDb();
  const maxMessages = limit ?? (getConfigValue("max_context_messages") as number | null) ?? 50;

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(maxMessages)
    .all()
    .reverse();

  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const row of rows) {
    const parsed = JSON.parse(row.content);

    if (row.role === "user") {
      anthropicMessages.push({ role: "user", content: parsed });
    } else if (row.role === "assistant") {
      anthropicMessages.push({ role: "assistant", content: parsed });
    } else if (row.role === "tool_use") {
      // Tool use is part of an assistant message -- handled via content blocks
      anthropicMessages.push({ role: "assistant", content: parsed });
    } else if (row.role === "tool_result") {
      anthropicMessages.push({ role: "user", content: parsed });
    }
  }

  return anthropicMessages;
}

export async function findOrCreateConversation(opts: {
  discordUserId?: string;
  discordUsername?: string;
  source: "discord" | "web";
  conversationId?: string;
}): Promise<string> {
  const db = getDb();

  if (opts.conversationId) {
    const existing = db
      .select()
      .from(conversations)
      .where(eq(conversations.id, opts.conversationId))
      .get();
    if (existing) return existing.id;
  }

  // For Discord, find most recent conversation for this user
  if (opts.source === "discord" && opts.discordUserId) {
    const recent = db
      .select()
      .from(conversations)
      .where(eq(conversations.discordUserId, opts.discordUserId))
      .orderBy(desc(conversations.updatedAt))
      .limit(1)
      .get();

    // Reuse if updated within last 6 hours
    if (recent && Date.now() - recent.updatedAt < 6 * 60 * 60 * 1000) {
      return recent.id;
    }
  }

  const id = nanoid();
  const now = Date.now();
  db.insert(conversations)
    .values({
      id,
      discordUserId: opts.discordUserId ?? null,
      discordUsername: opts.discordUsername ?? null,
      source: opts.source,
      title: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

function persistMessage(
  conversationId: string,
  role: string,
  content: unknown,
  model?: string,
  tokenCount?: number
) {
  const db = getDb();
  db.insert(messages)
    .values({
      id: nanoid(),
      conversationId,
      role,
      content: JSON.stringify(content),
      model: model ?? null,
      tokenCount: tokenCount ?? null,
      createdAt: Date.now(),
    })
    .run();

  // Update conversation timestamp
  db.update(conversations)
    .set({ updatedAt: Date.now() })
    .where(eq(conversations.id, conversationId))
    .run();
}

export async function* runConversation(
  conversationId: string,
  userMessage: string
): AsyncGenerator<StreamEvent> {
  const client = getAnthropicClient();

  const systemPrompt =
    getConfigValue("system_prompt") ??
    "You are OpenFang, a helpful personal AI assistant.";
  const model = getConfigValue("model") ?? "claude-sonnet-4-20250514";
  const toolDefs = getEnabledToolDefinitions();

  // Persist user message
  persistMessage(conversationId, "user", userMessage);

  // Load history
  const history = await getConversationHistory(conversationId);

  let currentMessages = [...history];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalText = "";

  // Tool-use loop
  while (true) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      messages: currentMessages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    let hasToolUse = false;
    const assistantContent: Anthropic.ContentBlock[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      assistantContent.push(block);

      if (block.type === "text") {
        finalText += block.text;
        yield { type: "text_delta", text: block.text };
      } else if (block.type === "tool_use") {
        hasToolUse = true;
        yield {
          type: "tool_use_start",
          toolName: block.name,
          toolId: block.id,
          input: block.input,
        };

        const start = Date.now();
        let result: string;
        let isError = false;
        try {
          result = await executeToolCall(block.name, block.input as Record<string, unknown>);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          isError = true;
        }
        const durationMs = Date.now() - start;

        yield { type: "tool_result", toolId: block.id, result, durationMs, isError };

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
          is_error: isError,
        });
      }
    }

    // Persist assistant message (with tool_use blocks)
    persistMessage(conversationId, "assistant", assistantContent, model);

    if (hasToolUse) {
      // Persist tool results and continue the loop
      persistMessage(conversationId, "tool_result", toolResults);

      currentMessages.push({ role: "assistant", content: assistantContent });
      currentMessages.push({ role: "user", content: toolResults });
    } else {
      // No tool use -- we're done
      break;
    }

    if (response.stop_reason === "end_turn") {
      break;
    }
  }

  yield {
    type: "message_complete",
    content: finalText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };

  // Update conversation title if it's the first message
  const db = getDb();
  const convo = db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (convo && !convo.title) {
    const title = userMessage.slice(0, 80) + (userMessage.length > 80 ? "..." : "");
    db.update(conversations)
      .set({ title })
      .where(eq(conversations.id, conversationId))
      .run();
  }
}
