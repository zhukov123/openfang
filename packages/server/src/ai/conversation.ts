import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getAnthropicClient } from "./anthropic.js";
import { getOpenAIClient } from "./openai.js";
import {
  executeToolCall,
  getEnabledOpenAIToolDefinitions,
  getEnabledToolDefinitions,
} from "./tools/index.js";
import { getDb } from "../db/index.js";
import { conversations, messages } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  getAiProvider,
  getConfiguredModel,
  getMaxContextMessages,
  getSystemPrompt,
} from "./config.js";

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

function parseStoredContent(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function extractTextFromStoredContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (!item || typeof item !== "object") {
          return "";
        }
        const record = item as Record<string, unknown>;
        if (typeof record.text === "string") {
          return record.text;
        }
        if (typeof record.content === "string") {
          return record.content;
        }
        return "";
      })
      .filter((part) => part.length > 0)
      .join("\n");
  }

  if (typeof content === "object") {
    const record = content as Record<string, unknown>;
    if (typeof record.content === "string") {
      return record.content;
    }
    if (typeof record.text === "string") {
      return record.text;
    }
  }

  return String(content);
}

function parseOpenAIToolInput(rawArguments: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { _raw_arguments: rawArguments };
  }
}

function normalizeOpenAIAssistantToolCalls(
  value: unknown
): OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = record.id;
    const functionObj = record.function;
    if (typeof id !== "string" || !functionObj || typeof functionObj !== "object") {
      continue;
    }

    const fn = functionObj as Record<string, unknown>;
    if (typeof fn.name !== "string") {
      continue;
    }

    normalized.push({
      id,
      type: "function",
      function: {
        name: fn.name,
        arguments:
          typeof fn.arguments === "string"
            ? fn.arguments
            : JSON.stringify(fn.arguments ?? {}),
      },
    });
  }

  return normalized;
}

function toOpenAIAssistantMessage(
  content: unknown
): OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    const toolCalls = normalizeOpenAIAssistantToolCalls(record.tool_calls);
    const text =
      typeof record.content === "string"
        ? record.content
        : extractTextFromStoredContent(record.content);

    const assistant: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: text.length > 0 ? text : null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    if (!assistant.content && !assistant.tool_calls) {
      assistant.content = "";
    }

    return assistant;
  }

  const fallbackText = extractTextFromStoredContent(content);
  return {
    role: "assistant",
    content: fallbackText.length > 0 ? fallbackText : "",
  };
}

function toOpenAIToolMessages(
  content: unknown
): OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] {
  if (!Array.isArray(content)) {
    return [];
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;

    if (record.role === "tool" && typeof record.tool_call_id === "string") {
      messages.push({
        role: "tool",
        tool_call_id: record.tool_call_id,
        content: extractTextFromStoredContent(record.content),
      });
      continue;
    }

    if (record.type === "tool_result" && typeof record.tool_use_id === "string") {
      messages.push({
        role: "tool",
        tool_call_id: record.tool_use_id,
        content: extractTextFromStoredContent(record.content),
      });
    }
  }

  return messages;
}

export async function getAnthropicConversationHistory(
  conversationId: string,
  limit?: number
): Promise<Anthropic.MessageParam[]> {
  const db = getDb();
  const maxMessages = limit ?? getMaxContextMessages();

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(maxMessages)
    .all()
    .reverse();

  const history: Anthropic.MessageParam[] = [];

  for (const row of rows) {
    const parsed = parseStoredContent(row.content);

    if (row.role === "user") {
      history.push({
        role: "user",
        content:
          typeof parsed === "string" ? parsed : extractTextFromStoredContent(parsed),
      });
    } else if (row.role === "assistant") {
      history.push({
        role: "assistant",
        content:
          typeof parsed === "string" || Array.isArray(parsed)
            ? (parsed as Anthropic.MessageParam["content"])
            : extractTextFromStoredContent(parsed),
      });
    }
  }

  return history;
}

export async function getOpenAIConversationHistory(
  conversationId: string,
  limit?: number
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
  const db = getDb();
  const maxMessages = limit ?? getMaxContextMessages();

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(maxMessages)
    .all()
    .reverse();

  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  for (const row of rows) {
    const parsed = parseStoredContent(row.content);

    if (row.role === "user") {
      history.push({
        role: "user",
        content: extractTextFromStoredContent(parsed),
      });
      continue;
    }

    if (row.role === "assistant" || row.role === "tool_use") {
      history.push(toOpenAIAssistantMessage(parsed));
      continue;
    }

    if (row.role === "tool_result") {
      history.push(...toOpenAIToolMessages(parsed));
    }
  }

  return history;
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

function updateConversationTitleIfMissing(conversationId: string, userMessage: string) {
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

async function* runAnthropicConversation(
  conversationId: string,
  userMessage: string
): AsyncGenerator<StreamEvent> {
  const client = getAnthropicClient();
  const systemPrompt = getSystemPrompt();
  const model = getConfiguredModel();
  const toolDefs = getEnabledToolDefinitions();

  // Persist user message
  persistMessage(conversationId, "user", userMessage);

  // Load history
  const history = await getAnthropicConversationHistory(conversationId);

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

  updateConversationTitleIfMissing(conversationId, userMessage);
}

async function* runOpenAIConversation(
  conversationId: string,
  userMessage: string
): AsyncGenerator<StreamEvent> {
  const client = getOpenAIClient();
  const systemPrompt = getSystemPrompt();
  const model = getConfiguredModel();
  const toolDefs = getEnabledOpenAIToolDefinitions();

  persistMessage(conversationId, "user", userMessage);

  const history = await getOpenAIConversationHistory(conversationId);
  const currentMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...history,
  ];

  let finalText = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < 10; i++) {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...currentMessages],
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      tool_choice: toolDefs.length > 0 ? "auto" : undefined,
      parallel_tool_calls: false,
    });

    totalInputTokens += response.usage?.prompt_tokens ?? 0;
    totalOutputTokens += response.usage?.completion_tokens ?? 0;

    const choice = response.choices[0];
    if (!choice?.message) {
      break;
    }

    const functionToolCalls = (choice.message.tool_calls ?? []).filter(
      (toolCall): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
        toolCall.type === "function"
    );
    const assistantText = choice.message.content ?? "";

    const assistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =
      {
        role: "assistant",
        content: assistantText.length > 0 ? assistantText : null,
        tool_calls: functionToolCalls.length > 0 ? functionToolCalls : undefined,
      };

    if (!assistantMessage.content && !assistantMessage.tool_calls) {
      assistantMessage.content = "";
    }

    persistMessage(conversationId, "assistant", assistantMessage, model);
    currentMessages.push(assistantMessage);

    if (assistantText.length > 0) {
      finalText += assistantText;
      yield { type: "text_delta", text: assistantText };
    }

    if (functionToolCalls.length === 0) {
      break;
    }

    const toolMessages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];
    for (const toolCall of functionToolCalls) {
      const input = parseOpenAIToolInput(toolCall.function.arguments);
      yield {
        type: "tool_use_start",
        toolName: toolCall.function.name,
        toolId: toolCall.id,
        input,
      };

      const start = Date.now();
      let result: string;
      let isError = false;
      try {
        result = await executeToolCall(toolCall.function.name, input);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }
      const durationMs = Date.now() - start;

      yield { type: "tool_result", toolId: toolCall.id, result, durationMs, isError };

      toolMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    persistMessage(conversationId, "tool_result", toolMessages);
    currentMessages.push(...toolMessages);
  }

  yield {
    type: "message_complete",
    content: finalText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };

  updateConversationTitleIfMissing(conversationId, userMessage);
}

export async function* runConversation(
  conversationId: string,
  userMessage: string
): AsyncGenerator<StreamEvent> {
  const provider = getAiProvider();
  if (provider === "openai-codex") {
    for await (const event of runOpenAIConversation(conversationId, userMessage)) {
      yield event;
    }
    return;
  }

  for await (const event of runAnthropicConversation(conversationId, userMessage)) {
    yield event;
  }
}
