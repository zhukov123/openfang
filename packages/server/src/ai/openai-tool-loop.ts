import OpenAI from "openai";
import { executeToolCall } from "./tools/index.js";

interface OpenAIToolUseStartEvent {
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
}

interface OpenAIToolResultEvent {
  toolId: string;
  result: string;
  durationMs: number;
  isError: boolean;
}

export interface OpenAIToolLoopCallbacks {
  onText?: (text: string) => void;
  onToolUseStart?: (event: OpenAIToolUseStartEvent) => void;
  onToolResult?: (event: OpenAIToolResultEvent) => void;
  onAssistantMessage?: (
    message: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam
  ) => void;
  onToolMessages?: (
    messages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[]
  ) => void;
}

export interface OpenAIToolLoopOptions {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  maxIterations?: number;
  callbacks?: OpenAIToolLoopCallbacks;
}

export interface OpenAIToolLoopResult {
  finalText: string;
  inputTokens: number;
  outputTokens: number;
}

function parseToolInput(rawArguments: string): Record<string, unknown> {
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

export async function runOpenAIToolLoop(
  options: OpenAIToolLoopOptions
): Promise<OpenAIToolLoopResult> {
  const workingMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...options.messages,
  ];
  const maxIterations = options.maxIterations ?? 10;
  const toolDefs = options.tools ?? [];

  let finalText = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < maxIterations; i++) {
    const response = await options.client.chat.completions.create({
      model: options.model,
      messages: [
        { role: "system", content: options.systemPrompt },
        ...workingMessages,
      ],
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

    const assistantText = choice.message.content ?? "";
    const functionToolCalls = (choice.message.tool_calls ?? []).filter(
      (toolCall) => toolCall.type === "function"
    );

    const assistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =
      {
        role: "assistant",
        content: assistantText.length > 0 ? assistantText : null,
        tool_calls: functionToolCalls.length > 0 ? functionToolCalls : undefined,
      };

    if (!assistantMessage.content && !assistantMessage.tool_calls) {
      assistantMessage.content = "";
    }

    options.callbacks?.onAssistantMessage?.(assistantMessage);
    workingMessages.push(assistantMessage);

    if (assistantText.length > 0) {
      finalText += assistantText;
      options.callbacks?.onText?.(assistantText);
    }

    if (functionToolCalls.length === 0) {
      break;
    }

    const toolMessages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] =
      [];

    for (const toolCall of functionToolCalls) {
      const input = parseToolInput(toolCall.function.arguments);
      options.callbacks?.onToolUseStart?.({
        toolName: toolCall.function.name,
        toolId: toolCall.id,
        input,
      });

      const startedAt = Date.now();
      let result: string;
      let isError = false;

      try {
        result = await executeToolCall(toolCall.function.name, input);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }

      const durationMs = Date.now() - startedAt;
      options.callbacks?.onToolResult?.({
        toolId: toolCall.id,
        result,
        durationMs,
        isError,
      });

      toolMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    options.callbacks?.onToolMessages?.(toolMessages);
    workingMessages.push(...toolMessages);
  }

  return {
    finalText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
