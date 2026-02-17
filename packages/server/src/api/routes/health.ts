import type { FastifyInstance } from "fastify";
import { getDiscordClient } from "../../bot/client.js";
import { getDb } from "../../db/index.js";
import { conversations, messages, memories, schedules } from "../../db/schema.js";
import { count, eq } from "drizzle-orm";

const startTime = Date.now();

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    const client = getDiscordClient();
    const db = getDb();

    const [convoCount] = db.select({ count: count() }).from(conversations).all();
    const [msgCount] = db.select({ count: count() }).from(messages).all();
    const [memCount] = db.select({ count: count() }).from(memories).all();
    const [schedCount] = db
      .select({ count: count() })
      .from(schedules)
      .where(eq(schedules.enabled, true))
      .all();

    return {
      status: "ok",
      uptime: Date.now() - startTime,
      uptimeHuman: formatUptime(Date.now() - startTime),
      discord: {
        connected: client?.isReady() ?? false,
        username: client?.user?.tag ?? null,
        ping: client?.ws?.ping ?? null,
      },
      stats: {
        conversations: convoCount?.count ?? 0,
        messages: msgCount?.count ?? 0,
        memories: memCount?.count ?? 0,
        activeSchedules: schedCount?.count ?? 0,
      },
    };
  });
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
