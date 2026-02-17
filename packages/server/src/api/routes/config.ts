import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export function registerConfigRoutes(app: FastifyInstance) {
  // Get all config
  app.get("/api/config", async () => {
    const db = getDb();
    const rows = db.select().from(config).all();

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }

    return result;
  });

  // Update config (bulk)
  app.put("/api/config", async (request) => {
    const body = request.body as Record<string, unknown>;
    const db = getDb();

    for (const [key, value] of Object.entries(body)) {
      const serialized = JSON.stringify(value);

      db.insert(config)
        .values({ key, value: serialized })
        .onConflictDoUpdate({
          target: config.key,
          set: { value: serialized },
        })
        .run();
    }

    return { success: true, updated: Object.keys(body) };
  });

  // Get single config key
  app.get<{ Params: { key: string } }>("/api/config/:key", async (request) => {
    const db = getDb();
    const row = db
      .select()
      .from(config)
      .where(eq(config.key, request.params.key))
      .get();

    if (!row) {
      return { error: "Not found", key: request.params.key };
    }

    try {
      return { key: row.key, value: JSON.parse(row.value) };
    } catch {
      return { key: row.key, value: row.value };
    }
  });
}
