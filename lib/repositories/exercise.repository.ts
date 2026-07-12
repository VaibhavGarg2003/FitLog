/**
 * Exercise Repository — Raw Prisma Queries for the Exercises Table
 * ═════════════════════════════════════════════════════════════════
 *
 * Read-only reference data (seeded once). Same rule as every repository:
 * all physical data access lives here; routes and services never import
 * prisma directly (enforced by ESLint no-restricted-imports).
 */

import { prisma } from "@/lib/supabase/prisma";
import type { ExerciseCategory } from "@prisma/client";

/**
 * List exercises with optional filters (muscle group, category, name search).
 * Capped at 200 rows — the full catalog is small, but an unbounded query
 * is a habit worth never forming.
 */
export async function findExercises(filters: {
  muscleGroup?: string | null;
  category?: ExerciseCategory | null;
  query?: string | null;
}) {
  const where: Record<string, unknown> = {};
  if (filters.muscleGroup) {
    where.muscleGroup = { equals: filters.muscleGroup, mode: "insensitive" };
  }
  if (filters.category) {
    where.category = filters.category;
  }
  if (filters.query && filters.query.length >= 2) {
    where.name = { contains: filters.query, mode: "insensitive" };
  }

  return prisma.exercise.findMany({
    where,
    orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      category: true,
      muscleGroup: true,
      equipment: true,
      metValue: true,
      isCompound: true,
      instructions: true,
    },
  });
}
