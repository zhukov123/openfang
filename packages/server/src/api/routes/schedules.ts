import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { schedules } from "../../db/schema.js";
import { desc } from "drizzle-orm";

export function registerScheduleRoutes(app: FastifyInstance) {
  app.get("/api/schedules", async () => {
    const db = getDb();
    const all = db
      .select()
      .from(schedules)
      .orderBy(desc(schedules.createdAt))
      .all();

    return {
      schedules: all.map((s) => ({
        ...s,
        nextRunAtHuman: new Date(s.nextRunAt).toISOString(),
        lastRunAtHuman: s.lastRunAt
          ? new Date(s.lastRunAt).toISOString()
          : null,
      })),
      count: all.length,
    };
  });
}
