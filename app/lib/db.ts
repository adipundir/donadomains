/**
 * Neon serverless Postgres + Drizzle ORM.
 * Uses HTTP driver — works on Vercel serverless with zero cold starts.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL. Create a free Postgres database at https://neon.tech",
    );
  }

  const sql = neon(url);
  db = drizzle(sql, { schema });
  return db;
}
