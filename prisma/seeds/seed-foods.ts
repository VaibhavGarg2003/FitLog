/**
 * Food Database Seeder
 * ════════════════════
 *
 * Imports food data from all sources and inserts into the `foods` table.
 *
 * IDEMPOTENT: Checks for existing foods by name+source before inserting.
 * Running this twice won't create duplicates.
 *
 * SOURCES:
 * ────────
 * 1. Indian prepared dishes (~120 items) — INDB source
 * 2. Manual/gym foods (~65 items) — MANUAL source
 *
 * Total: ~185 foods seeded.
 */

import { PrismaClient } from "@prisma/client";
import { indianPreparedFoods } from "./data/foods-indian-prepared";
import { manualFoods } from "./data/foods-manual";

interface FoodCreateInput {
  name: string;
  nameHindi: string | null;
  source: "INDB" | "IFCT" | "USDA" | "MANUAL";
  category: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  defaultUnit: string;
  defaultQuantity: number;
  defaultGrams: number;
  restaurantMultiplier: number;
  isVerified: boolean;
}

function normalizeFoods(
  foods: typeof indianPreparedFoods,
  source: "INDB" | "IFCT" | "USDA" | "MANUAL"
): FoodCreateInput[] {
  return foods.map((f) => ({
    name: f.name,
    nameHindi: f.nameHindi ?? null,
    source,
    category: f.category ?? null,
    caloriesPer100g: f.caloriesPer100g,
    proteinPer100g: f.proteinPer100g,
    carbsPer100g: f.carbsPer100g,
    fatPer100g: f.fatPer100g,
    fiberPer100g: f.fiberPer100g ?? null,
    defaultUnit: f.defaultUnit,
    defaultQuantity: f.defaultQuantity,
    defaultGrams: f.defaultGrams,
    restaurantMultiplier: f.restaurantMultiplier ?? 1.5,
    isVerified: true, // Seeded data is verified by default
  }));
}

export async function seedFoods(prisma: PrismaClient): Promise<number> {
  console.log("🍛 Seeding food database...");

  // Check how many foods already exist
  const existingCount = await prisma.food.count();
  if (existingCount > 0) {
    console.log(`   ⏩ Foods table already has ${existingCount} entries. Skipping.`);
    return existingCount;
  }

  // Combine all sources
  const allFoods: FoodCreateInput[] = [
    ...normalizeFoods(indianPreparedFoods, "INDB"),
    ...normalizeFoods(manualFoods, "MANUAL"),
  ];

  // Bulk insert
  const result = await prisma.food.createMany({
    data: allFoods,
    skipDuplicates: true,
  });

  console.log(`   ✅ Seeded ${result.count} foods.`);
  return result.count;
}
