/**
 * Prisma CLI Configuration (Prisma 7+)
 * ═════════════════════════════════════
 *
 * WHAT CHANGED IN PRISMA 7?
 * ─────────────────────────
 * Before Prisma 7: Database URL was in schema.prisma (url = env("DATABASE_URL"))
 * After Prisma 7:  Database URL is in THIS file (prisma.config.ts)
 *
 * WHY THE CHANGE?
 * ───────────────
 * schema.prisma is now purely for defining your DATA MODEL (tables,
 * columns, relations). Connection logic is separated into this
 * TypeScript config file, which gives you more flexibility:
 * - TypeScript (not Prisma's custom language)
 * - Can use environment variables with proper dotenv loading
 * - Can configure migrations directory
 *
 * WHEN DOES THIS FILE RUN?
 * ────────────────────────
 * Only during Prisma CLI commands:
 *   npx prisma migrate dev  → reads DATABASE_URL from here
 *   npx prisma generate     → reads schema path from here
 *   npx prisma validate     → reads schema from here
 *
 * It does NOT run at application runtime. The app uses the
 * PrismaClient adapter (see lib/supabase/prisma.ts).
 */
// dotenv/config only reads `.env` by default, NOT `.env.local`.
// Next.js uses `.env.local` for local secrets, so we load it explicitly.
import { config } from "dotenv";
config({ path: ".env.local" });

import { defineConfig } from "prisma/config";

export default defineConfig({
  // Path to the schema file
  schema: "prisma/schema.prisma",

  // Use DIRECT_URL for migrations (not the pooled DATABASE_URL).
  // WHY: Supabase's PgBouncer (pooler, port 6543) runs in "transaction mode"
  // which doesn't support DDL statements (CREATE TABLE, ALTER TABLE, etc).
  // Migrations ARE DDL statements. So we bypass the pooler and connect directly.
  // DIRECT_URL → port 5432, no ?pgbouncer=true → supports full SQL.
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,

    // Shadow database — used by `migrate diff --from-migrations` (the CI
    // drift check) and `migrate dev`. Prisma replays every migration into
    // it to compute the schema they produce, then WIPES it — so this must
    // NEVER point at a real database. In CI it's a throwaway Postgres
    // service container; locally it's unset (Prisma auto-creates one when
    // it has permission, and the drift check normally only runs in CI).
    // NOTE (Prisma 7): this replaced the old --shadow-database-url CLI flag.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },

  // Where migration files are stored
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
});
