import type { FastifyInstance } from "fastify";
import { getDb, getRawDb } from "../../db/index.js";
import { memories } from "../../db/schema.js";
import { eq, desc, count } from "drizzle-orm";

export function registerMemoryRoutes(app: FastifyInstance) {
  // Search/list memories
  app.get("/api/memories", async (request) => {
    const query = request.query as {
      q?: string;
      category?: string;
      limit?: string;
      offset?: string;
    };

    const limit = parseInt(query.limit ?? "50", 10);
    const offset = parseInt(query.offset ?? "0", 10);

    // If search query provided, use FTS5
    if (query.q) {
      try {
        const rawDb = getRawDb();

        let sql = `
          SELECT m.id, m.content, m.category, m.source, m.conversation_id, m.created_at, m.updated_at
          FROM memories_fts
          JOIN memories m ON memories_fts.rowid = m.rowid
          WHERE memories_fts MATCH ?
        `;
        const params: unknown[] = [query.q];

        if (query.category) {
          sql += ` AND m.category = ?`;
          params.push(query.category);
        }

        sql += ` ORDER BY rank LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const results = rawDb.prepare(sql).all(...params);
        rawDb.close();

        return { memories: results, query: query.q };
      } catch (err) {
        return {
          memories: [],
          error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Otherwise, list with optional category filter
    const db = getDb();
    let dbQuery = db
      .select()
      .from(memories)
      .orderBy(desc(memories.updatedAt))
      .$dynamic();

    if (query.category) {
      dbQuery = dbQuery.where(eq(memories.category, query.category));
    }

    const results = dbQuery.limit(limit).offset(offset).all();
    const [total] = db.select({ count: count() }).from(memories).all();

    return {
      memories: results,
      total: total?.count ?? 0,
      limit,
      offset,
    };
  });

  // Delete a memory
  app.delete<{ Params: { id: string } }>(
    "/api/memories/:id",
    async (request) => {
      const db = getDb();

      const existing = db
        .select()
        .from(memories)
        .where(eq(memories.id, request.params.id))
        .get();

      if (!existing) {
        return { error: "Memory not found" };
      }

      db.delete(memories).where(eq(memories.id, request.params.id)).run();
      return { success: true, deleted: request.params.id };
    }
  );
}
