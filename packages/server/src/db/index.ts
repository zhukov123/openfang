import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { mkdirSync } from "fs";
import { dirname } from "path";

let _db: ReturnType<typeof createDb> | null = null;

function createDb(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

export function getDb(dbPath?: string): ReturnType<typeof createDb> {
  if (!_db) {
    _db = createDb(dbPath ?? "./data/openfang.db");
  }
  return _db;
}

export function getRawDb(dbPath?: string): Database.Database {
  mkdirSync(dirname(dbPath ?? "./data/openfang.db"), { recursive: true });
  const sqlite = new Database(dbPath ?? "./data/openfang.db");
  return sqlite;
}

export type AppDatabase = ReturnType<typeof getDb>;
