/**
 * Custom Food Repository — user-owned food entries
 * ═════════════════════════════════════════════════
 *
 * The seeded `foods` table is shared reference data with no owner, so it can't
 * answer "what are MY whey protein's macros". `custom_foods` can.
 *
 * OWNERSHIP IS ENFORCED IN THE QUERY, NOT AFTER IT.
 * ─────────────────────────────────────────────────
 * Every write is scoped by `userId` in the WHERE clause (updateMany /
 * deleteMany returning a count), so a caller cannot touch another user's row
 * even with a valid id. Same pattern as updateSetForUser in the workout
 * repository — see CONTEXT.md Rule 4: services never touch Prisma directly.
 */

import { prisma } from "@/lib/supabase/prisma";

export interface CustomFoodInput {
  name: string;
  category?: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number | null;
  defaultUnit?: string;
  defaultGrams?: number;
}

/** Every custom food this user has saved, newest edits first. */
export async function listCustomFoods(userId: string) {
  return prisma.customFood.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Search this user's custom foods by name — the custom-food half of the
 * merged food search.
 */
export async function searchCustomFoods(
  userId: string,
  query: string,
  limit: number
) {
  return prisma.customFood.findMany({
    where: {
      userId,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { name: "asc" },
  });
}

export async function findCustomFoodById(id: string, userId: string) {
  return prisma.customFood.findFirst({ where: { id, userId } });
}

/**
 * Create or replace this user's entry with the given name.
 *
 * Upsert on the (userId, name) unique index is what makes "I switched brands"
 * work: saving your whey macros again overwrites the one row instead of
 * leaving a stale duplicate behind for search to offer.
 */
export async function upsertCustomFood(userId: string, data: CustomFoodInput) {
  return prisma.customFood.upsert({
    where: { userId_name: { userId, name: data.name } },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Edit an existing entry by id (owner-scoped). Returns null when the row
 * isn't this user's — callers answer that as Not found.
 */
export async function updateCustomFoodForUser(
  id: string,
  userId: string,
  data: Partial<CustomFoodInput>
) {
  const result = await prisma.customFood.updateMany({
    where: { id, userId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.customFood.findUnique({ where: { id } });
}

export async function deleteCustomFoodForUser(id: string, userId: string) {
  const result = await prisma.customFood.deleteMany({ where: { id, userId } });
  return result.count > 0;
}
