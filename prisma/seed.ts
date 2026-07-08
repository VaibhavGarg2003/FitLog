/**
 * Master Seed Script
 * ══════════════════
 *
 * Entry point for `npx prisma db seed`.
 * Runs all seeders in sequence.
 *
 * Prisma 7 requires a driver adapter for PrismaClient.
 * Since this is a CLI script (not the Next.js app), we create
 * the adapter directly here instead of using the singleton.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { seedFoods } from "./seeds/seed-foods";
import { seedExercises } from "./seeds/seed-exercises";

// Create a direct connection (not pooled) for seeding
const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   🌱 FitLog Database Seed — Starting   ║");
  console.log("╚════════════════════════════════════════╝");
  console.log();

  const foodCount = await seedFoods(prisma);
  const exerciseCount = await seedExercises(prisma);

  console.log();
  console.log("╔════════════════════════════════════════╗");
  console.log("║   ✅ Seed Complete                     ║");
  console.log(`║   Foods:     ${String(foodCount).padStart(4)} entries             ║`);
  console.log(`║   Exercises: ${String(exerciseCount).padStart(4)} entries             ║`);
  console.log("╚════════════════════════════════════════╝");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
