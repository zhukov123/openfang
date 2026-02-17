import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { conversations, messages } from "../../db/schema.js";
import { eq, desc, count } from "drizzle-orm";

export function registerConversationRoutes(app: FastifyInstance) {
  // List conversations
  app.get("/api/conversations", async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = parseInt(query.limit ?? "20", 10);
    const offset = parseInt(query.offset ?? "0", 10);

    const db = getDb();

    const rows = db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset)
      .all();

    const [total] = db.select({ count: count() }).from(conversations).all();

    // Get message count for each conversation
    const result = rows.map((convo) => {
      const [msgCount] = db
        .select({ count: count() })
        .from(messages)
        .where(eq(messages.conversationId, convo.id))
        .all();

      return {
        ...convo,
        messageCount: msgCount?.count ?? 0,
      };
    });

    return {
      conversations: result,
      total: total?.count ?? 0,
      limit,
      offset,
    };
  });

  // Get conversation messages
  app.get<{ Params: { id: string } }>(
    "/api/conversations/:id/messages",
    async (request) => {
      const db = getDb();

      const convo = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, request.params.id))
        .get();

      if (!convo) {
        return { error: "Conversation not found" };
      }

      const msgs = db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, request.params.id))
        .orderBy(messages.createdAt)
        .all();

      // Parse JSON content for each message
      const parsed = msgs.map((m) => {
        let content: unknown;
        try {
          content = JSON.parse(m.content);
        } catch {
          content = m.content;
        }
        return { ...m, content };
      });

      return {
        conversation: convo,
        messages: parsed,
      };
    }
  );

  // Delete conversation
  app.delete<{ Params: { id: string } }>(
    "/api/conversations/:id",
    async (request) => {
      const db = getDb();

      const convo = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, request.params.id))
        .get();

      if (!convo) {
        return { error: "Conversation not found" };
      }

      // Messages are cascade-deleted
      db.delete(conversations)
        .where(eq(conversations.id, request.params.id))
        .run();

      return { success: true, deleted: request.params.id };
    }
  );
}
