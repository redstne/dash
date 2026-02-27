import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.ts";

const DB_PATH = process.env["DB_PATH"] ?? "data/redstne.db";

const sqlite = new Database(DB_PATH, { create: true });
// Enable WAL for better concurrent read performance
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });
export { schema };
