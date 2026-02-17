import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

export function runMigrations(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      discord_user_id TEXT,
      discord_username TEXT,
      source TEXT NOT NULL DEFAULT 'discord',
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      token_count INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      conversation_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      discord_user_id TEXT,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      cron_expr TEXT,
      run_at INTEGER,
      timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER NOT NULL,
      tools_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(discord_user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at);
  `);

  // Create FTS5 virtual table for memory search
  const ftsExists = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
    )
    .get();

  if (!ftsExists) {
    sqlite.exec(`
      CREATE VIRTUAL TABLE memories_fts USING fts5(
        content,
        category,
        content='memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, category)
        VALUES (new.rowid, new.content, new.category);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, category)
        VALUES ('delete', old.rowid, old.content, old.category);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, category)
        VALUES ('delete', old.rowid, old.content, old.category);
        INSERT INTO memories_fts(rowid, content, category)
        VALUES (new.rowid, new.content, new.category);
      END;
    `);
  }

  sqlite.close();
  console.log("[OpenFang] Database migrations complete");
}

export function seedDefaults(dbPath: string) {
  const sqlite = new Database(dbPath);

  const defaults: Record<string, string> = {
    ai_provider: JSON.stringify("anthropic"),
    system_prompt: JSON.stringify(
      "You are OpenFang, a helpful personal AI assistant. You have persistent memory that stores facts from past conversations. Use the recall_memory tool when you think past context would help. You can search the web, run shell commands, and manage scheduled tasks. Be concise but thorough."
    ),
    model: JSON.stringify("claude-sonnet-4-20250514"),
    openai_auth_mode: JSON.stringify("api_key"),
    max_context_messages: JSON.stringify(50),
    shell_working_directory: JSON.stringify(process.env.HOME ?? "/tmp"),
    shell_timeout_ms: JSON.stringify(30000),
    memory_auto_extract: JSON.stringify(true),
    tools_enabled: JSON.stringify({
      web_search: true,
      web_read: true,
      calculator: true,
      shell_exec: true,
      recall_memory: true,
      save_memory: true,
      list_memories: true,
      forget_memory: true,
      create_schedule: true,
      set_reminder: true,
      list_schedules: true,
      delete_schedule: true,
    }),
  };

  const insert = sqlite.prepare(
    "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)"
  );

  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value);
  }

  sqlite.close();
  console.log("[OpenFang] Default config seeded");
}
