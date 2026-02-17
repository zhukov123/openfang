import Anthropic from "@anthropic-ai/sdk";
import { getDb, getRawDb } from "../../db/index.js";
import { memories } from "../../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export const recallMemoryTool: Anthropic.Tool = {
  name: "recall_memory",
  description:
    "Search your persistent memory for facts from past conversations. Use when past context might help answer the current question.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "What to search for in memory",
      },
      category: {
        type: "string",
        enum: ["preference", "fact", "project", "person", "general"],
        description: "Optional: filter by category",
      },
      limit: {
        type: "number",
        description: "Max results to return (default: 10)",
      },
    },
    required: ["query"],
  },
};

export async function recallMemoryExecute(
  input: Record<string, unknown>
): Promise<string> {
  const query = input.query as string;
  const category = input.category as string | undefined;
  const limit = (input.limit as number) || 10;

  try {
    const rawDb = getRawDb();

    let sql = `
      SELECT m.id, m.content, m.category, m.source, m.created_at, m.updated_at
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ?
    `;
    const params: unknown[] = [query];

    if (category) {
      sql += ` AND m.category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    const results = rawDb.prepare(sql).all(...params);
    rawDb.close();

    if (results.length === 0) {
      return JSON.stringify({ results: [], message: "No matching memories found." });
    }

    return JSON.stringify({ results });
  } catch (err) {
    return JSON.stringify({
      results: [],
      error: `Memory search failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export const saveMemoryTool: Anthropic.Tool = {
  name: "save_memory",
  description:
    "Manually save a fact or note to persistent memory. Use when the user explicitly asks you to remember something.",
  input_schema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "The fact or note to remember",
      },
      category: {
        type: "string",
        enum: ["preference", "fact", "project", "person", "general"],
        description: "Category for this memory",
      },
    },
    required: ["content", "category"],
  },
};

export async function saveMemoryExecute(
  input: Record<string, unknown>
): Promise<string> {
  const content = input.content as string;
  const category = input.category as string;

  const db = getDb();
  const now = Date.now();
  const id = nanoid();

  db.insert(memories)
    .values({
      id,
      content,
      category,
      source: "manual",
      conversationId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return JSON.stringify({ success: true, id, content, category });
}

export const listMemoriesTool: Anthropic.Tool = {
  name: "list_memories",
  description:
    "List stored memories. Use when the user asks what you remember about them or a topic.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        enum: ["preference", "fact", "project", "person", "general"],
        description: "Optional: filter by category",
      },
      limit: {
        type: "number",
        description: "Max results (default: 20)",
      },
    },
    required: [],
  },
};

export async function listMemoriesExecute(
  input: Record<string, unknown>
): Promise<string> {
  const db = getDb();
  const category = input.category as string | undefined;
  const limit = (input.limit as number) || 20;

  let query = db.select().from(memories).orderBy(desc(memories.updatedAt)).$dynamic();

  if (category) {
    query = query.where(eq(memories.category, category));
  }

  const results = query.limit(limit).all();
  return JSON.stringify({ count: results.length, memories: results });
}

export const forgetMemoryTool: Anthropic.Tool = {
  name: "forget_memory",
  description:
    "Delete a memory by ID. Use when the user asks you to forget something specific.",
  input_schema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "The memory ID to delete",
      },
    },
    required: ["id"],
  },
};

export async function forgetMemoryExecute(
  input: Record<string, unknown>
): Promise<string> {
  const id = input.id as string;
  const db = getDb();

  const existing = db.select().from(memories).where(eq(memories.id, id)).get();
  if (!existing) {
    return JSON.stringify({ success: false, error: "Memory not found" });
  }

  db.delete(memories).where(eq(memories.id, id)).run();
  return JSON.stringify({
    success: true,
    deleted: { id, content: existing.content },
  });
}
