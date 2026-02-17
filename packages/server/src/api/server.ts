import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { join, resolve } from "path";
import { existsSync } from "fs";
import { env } from "../env.js";

import { registerHealthRoutes } from "./routes/health.js";
import { registerConfigRoutes } from "./routes/config.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerMemoryRoutes } from "./routes/memories.js";
import { registerScheduleRoutes } from "./routes/schedules.js";

export async function createServer() {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Simple auth middleware (optional)
  if (env.WEB_AUTH_PASSWORD) {
    app.addHook("preHandler", async (request, reply) => {
      // Skip auth for health check
      if (request.url === "/api/health") return;
      // Skip for static files
      if (!request.url.startsWith("/api/")) return;

      const authHeader = request.headers.authorization;
      if (authHeader !== `Bearer ${env.WEB_AUTH_PASSWORD}`) {
        reply.code(401).send({ error: "Unauthorized" });
      }
    });
  }

  // Register API routes
  registerHealthRoutes(app);
  registerConfigRoutes(app);
  registerConversationRoutes(app);
  registerChatRoutes(app);
  registerMemoryRoutes(app);
  registerScheduleRoutes(app);

  // Serve static web UI (built React app)
  const webDistPath = resolve(
    import.meta.dirname ?? ".",
    "../../web/dist"
  );
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/",
      wildcard: false,
    });

    // SPA fallback: serve index.html for all non-API, non-file routes
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
      } else {
        reply.sendFile("index.html");
      }
    });
  }

  return app;
}
