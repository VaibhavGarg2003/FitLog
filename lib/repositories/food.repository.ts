/**
 * Food Repository — Raw Prisma Queries for the Foods Table
 * ══════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 * ────────────────
 * Services must not query Prisma directly (CONTEXT.md Rule 4) — all
 * physical data access lives in lib/repositories/. Before this file,
 * nutrition.service.ts and ai.service.ts reached into prisma.food
 * themselves. When food lookups grow (caching, soft-deletes, verified-only
 * filters), the change happens HERE, once — not scattered across services.
 */

import { prisma } from "@/lib/supabase/prisma";

/**
 * Fetch a single food by id. Used when logging a food the user selected.
 */
export async function findFoodById(id: string) {
  return prisma.food.findUnique({ where: { id } });
}

/**
 * Search foods by name / Hindi name / category (case-insensitive).
 * Used by the food search API (manual logging flow).
 */
export async function searchFoodsByName(query: string, limit: number) {
  return prisma.food.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { nameHindi: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      nameHindi: true,
      category: true,
      caloriesPer100g: true,
      proteinPer100g: true,
      carbsPer100g: true,
      fatPer100g: true,
      fiberPer100g: true,
      defaultUnit: true,
      defaultQuantity: true,
      defaultGrams: true,
      restaurantMultiplier: true,
      source: true,
    },
  });
}

/**
 * Batch-fetch candidate foods for a list of parsed names in ONE query.
 *
 * Used by the AI meal parser. Instead of one findFirst per item (N+1),
 * we fetch every food whose name/Hindi name contains ANY of the parsed
 * names, then the service ranks them in memory with a deterministic
 * match ladder (exact → prefix → substring).
 */
export async function findFoodCandidates(
  names: Array<{ name: string; nameHindi?: string | null }>
) {
  if (names.length === 0) return [];

  return prisma.food.findMany({
    where: {
      OR: names.flatMap((n) => [
        { name: { contains: n.name, mode: "insensitive" as const } },
        ...(n.nameHindi
          ? [
              {
                nameHindi: {
                  contains: n.nameHindi,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ]),
    },
  });
}
