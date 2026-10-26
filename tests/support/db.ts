import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

/** A database for integration tests: migrated once, emptied before each test. */
export function createTestDb() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
  const db = drizzle(pool, { schema, casing: "snake_case" });

  async function setup() {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await migrate(db, { migrationsFolder: "./drizzle" });
  }

  async function reset() {
    const { rows } = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
    if (tables) await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }

  return { db, pool, setup, reset, close: () => pool.end() };
}
