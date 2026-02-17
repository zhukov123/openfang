import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  discordUserId: text("discord_user_id"),
  discordUsername: text("discord_username"),
  source: text("source").notNull().default("discord"), // "discord" | "web"
  title: text("title"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant" | "tool_use" | "tool_result"
  content: text("content").notNull(), // JSON for structured content
  model: text("model"),
  tokenCount: integer("token_count"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  category: text("category").notNull(), // "preference" | "fact" | "project" | "person" | "general"
  source: text("source").notNull().default("auto"), // "auto" | "manual"
  conversationId: text("conversation_id"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  discordUserId: text("discord_user_id"),
  type: text("type").notNull(), // "cron" | "reminder"
  prompt: text("prompt").notNull(),
  cronExpr: text("cron_expr"),
  runAt: integer("run_at", { mode: "number" }),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "number" }),
  nextRunAt: integer("next_run_at", { mode: "number" }).notNull(),
  toolsEnabled: integer("tools_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});
