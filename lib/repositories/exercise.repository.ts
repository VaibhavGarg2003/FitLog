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

/** Shape every AI-workout matching path works with. */
export type ExerciseMatchRow = {
  id: string;
  name: string;
  muscleGroup: string;
  category: string;
  metValue: number;
  isCompound: boolean;
};

/**
 * The whole catalog, for the AI workout parser.
 *
 * WHY THE WHOLE THING AND NOT A PER-NAME QUERY: matching happens in memory
 * against a deterministic ladder (exact → alias → prefix → contains), and a
 * per-name `contains` query — the shape findFoodCandidates uses for food —
 * cannot answer "is this prefix match ambiguous?", which is exactly the check
 * that stops "rows" resolving to "Rowing Machine". The table is 155 seeded
 * rows that change only on a re-seed, so one unfiltered read is cheaper than
 * fifteen OR-ed LIKE scans and strictly more correct.
 *
 * Callers cache this per request; see ai-workout.service.ts.
 */
export async function findAllExercisesForMatching(): Promise<ExerciseMatchRow[]> {
  return prisma.exercise.findMany({
    orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      category: true,
      metValue: true,
      isCompound: true,
    },
  });
}

/**
 * Ownership-free existence check for a set of exercise ids.
 *
 * Used by the AI import right before it writes: the ids come back from the
 * client, which got them from a parse response, and a stale draft could name
 * an exercise that has since been removed. Writing a set with a dangling FK
 * would fail mid-transaction with a Prisma error instead of a clear message.
 */
export async function findExercisesByIds(
  ids: string[]
): Promise<ExerciseMatchRow[]> {
  if (ids.length === 0) return [];

  return prisma.exercise.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      category: true,
      metValue: true,
      isCompound: true,
    },
  });
}
