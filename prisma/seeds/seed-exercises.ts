/**
 * Exercise Database Seeder
 * ════════════════════════
 *
 * Imports 160+ exercises and inserts into the `exercises` table.
 * Idempotent — skips if table already has data.
 */

import { PrismaClient } from "@prisma/client";
import { exercises } from "./data/exercises";

export async function seedExercises(prisma: PrismaClient): Promise<number> {
  console.log("🏋️ Seeding exercise database...");

  const existingCount = await prisma.exercise.count();
  if (existingCount > 0) {
    console.log(`   ⏩ Exercises table already has ${existingCount} entries. Skipping.`);
    return existingCount;
  }

  const data = exercises.map((e) => ({
    name: e.name,
    category: e.category,
    muscleGroup: e.muscleGroup,
    equipment: e.equipment,
    metValue: e.metValue,
    isCompound: e.isCompound,
    instructions: e.instructions,
  }));

  const result = await prisma.exercise.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(`   ✅ Seeded ${result.count} exercises.`);
  return result.count;
}
