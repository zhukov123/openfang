import type { FastifyInstance } from "fastify";
import {
  findOrCreateConversation,
  runConversation,
} from "../../ai/conversation.js";
import { processMemoryExtraction } from "../../memory/index.js";

export function registerChatRoutes(app: FastifyInstance) {
  // SSE streaming chat endpoint
  app.post("/api/chat", async (request, reply) => {
    const body = request.body as {
      message: string;
      conversationId?: string;
    };

    if (!body.message?.trim()) {
      return reply.code(400).send({ error: "message is required" });
    }

    const conversationId = await findOrCreateConversation({
      source: "web",
      conversationId: body.conversationId,
    });

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": conversationId,
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send conversation ID first
    sendEvent("conversation_id", { conversationId });

    let fullResponse = "";
    const userMessage = body.message.trim();

    try {
      for await (const event of runConversation(conversationId, userMessage)) {
        switch (event.type) {
          case "text_delta":
            fullResponse += event.text;
            sendEvent("text_delta", { text: event.text });
            break;
          case "tool_use_start":
            sendEvent("tool_use_start", {
              toolName: event.toolName,
              toolId: event.toolId,
              input: event.input,
            });
            break;
          case "tool_result":
            sendEvent("tool_result", {
              toolId: event.toolId,
              result: event.result,
              durationMs: event.durationMs,
              isError: event.isError,
            });
            break;
          case "message_complete":
            sendEvent("message_complete", {
              content: event.content,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
            });
            break;
          case "error":
            sendEvent("error", { message: event.message });
            break;
        }
      }

      // Background memory extraction
      processMemoryExtraction(
        [
          { role: "user", content: userMessage },
          { role: "assistant", content: fullResponse },
        ],
        conversationId
      )
        .then((facts) => {
          if (facts.length > 0) {
            sendEvent("memory_extracted", { facts });
          }
          reply.raw.write("event: done\ndata: {}\n\n");
          reply.raw.end();
        })
        .catch(() => {
          reply.raw.write("event: done\ndata: {}\n\n");
          reply.raw.end();
        });
    } catch (err) {
      sendEvent("error", {
        message: err instanceof Error ? err.message : "Unknown error",
      });
      reply.raw.write("event: done\ndata: {}\n\n");
      reply.raw.end();
    }
  });
}
