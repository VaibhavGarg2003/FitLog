/**
 * Prisma Client Singleton (Prisma 7 — Driver Adapter Pattern)
 * ════════════════════════════════════════════════════════════
 *
 * WHAT CHANGED IN PRISMA 7?
 * ─────────────────────────
 * Before: `new PrismaClient()` connected to the DB automatically
 *         using the `url` in schema.prisma.
 * Now:    You must provide a "driver adapter" that handles the
 *         actual database connection. This gives you control over
 *         connection pooling, timeouts, and which driver to use.
 *
 * WHAT IS A DRIVER ADAPTER?
 * ─────────────────────────
 * It's a bridge between Prisma and a specific database driver.
 * @prisma/adapter-pg → connects Prisma to the `pg` (node-postgres) library.
 * The `pg` library is the standard PostgreSQL client for Node.js.
 *
 * WHY A SINGLETON?
 * ────────────────
 * (Same as before) In development, Next.js hot-reloads your code.
 * Each hot-reload would create a NEW connection pool. After 10 saves,
 * you'd exhaust the database connection limit. The singleton stores
 * the client in `globalThis` so it survives hot-reloads.
 *
 * USAGE:
 *   import { prisma } from "@/lib/supabase/prisma";
 *   const users = await prisma.user.findMany();
 */
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Extend globalThis to hold our singleton
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Step 1: Create a PostgreSQL connection pool
  // Pool manages multiple database connections efficiently.
  // Instead of opening a new connection for every query (slow),
  // Pool reuses existing connections (fast).
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    // EACH serverless instance is an isolated process with its OWN pool —
    // instances share nothing. Ten concurrent instances × max = that many
    // real connection attempts. The actual concurrency control is Supabase's
    // pooler (pgbouncer) in front of Postgres, which lends a small set of
    // real connections out per-query; this per-instance max just needs to
    // cover one request's parallel queries. 2 is plenty.
    //
    // (Related: migrations can NOT run through the pooler — transaction-mode
    // pgbouncer can't hold the session state DDL needs. That's why
    // migrate deploy uses DIRECT_URL, port 5432.)
  });

  // Step 2: Create the adapter that bridges pg ↔ Prisma
  const adapter = new PrismaPg(pool);

  // Step 3: Create PrismaClient with the adapter
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// Singleton: reuse existing client or create new one
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
