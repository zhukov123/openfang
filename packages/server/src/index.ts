import { env } from "./env.js";
import { runMigrations, seedDefaults } from "./db/migrate.js";
import { getDb } from "./db/index.js";
import { createServer } from "./api/server.js";
import { createDiscordClient, loginDiscordClient } from "./bot/client.js";
import { startScheduler, stopScheduler } from "./scheduler/index.js";

async function main() {
  console.log("[OpenFang] Starting...");

  // 1. Database setup
  const dbPath = env.DATABASE_URL;
  runMigrations(dbPath);
  seedDefaults(dbPath);
  getDb(dbPath);
  console.log(`[OpenFang] Database ready (${dbPath})`);

  // 2. Start API server
  const server = await createServer();
  await server.listen({ port: env.WEB_PORT, host: "0.0.0.0" });
  console.log(
    `[OpenFang] Web UI + API running at http://localhost:${env.WEB_PORT}`
  );

  // 3. Connect Discord bot
  const discordClient = createDiscordClient();
  try {
    await loginDiscordClient(discordClient);
  } catch (err) {
    console.error(
      "[OpenFang] Failed to connect Discord bot:",
      err instanceof Error ? err.message : err
    );
    console.log("[OpenFang] Continuing without Discord (web chat still works)");
  }

  // 4. Start scheduler
  startScheduler(discordClient);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[OpenFang] Shutting down...");
    stopScheduler();
    discordClient.destroy();
    await server.close();
    console.log("[OpenFang] Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[OpenFang] Fatal error:", err);
  process.exit(1);
});
