/**
 * Template Repository — Raw Prisma Queries for Workout Templates
 * ═══════════════════════════════════════════════════════════════
 *
 * The WorkoutTemplate table has existed since Step 1 with zero UI — this
 * repository finally puts it to work. Templates store their exercise list
 * as JSONB (see schema.prisma): a template is a frozen, read-only,
 * schema-flexible snapshot — the three conditions under which JSON columns
 * are the right call. The live workout log stays fully normalized.
 */

import { prisma } from "@/lib/supabase/prisma";
import type { Prisma } from "@prisma/client";

/** One exercise inside a template's JSONB payload */
export interface TemplateExercise {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  category: string;
  metValue: number;
  isCompound: boolean;
  /** How many sets the user did when this template was saved */
  targetSets: number;
}

export async function createTemplate(
  userId: string,
  data: {
    name: string;
    splitType?: "PPL" | "UPPER_LOWER" | "BRO" | "FULL_BODY" | "CUSTOM" | null;
    exercises: TemplateExercise[];
  }
) {
  return prisma.workoutTemplate.create({
    data: {
      userId,
      name: data.name,
      splitType: data.splitType ?? null,
      exercises: data.exercises as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getTemplatesByUser(userId: string) {
  return prisma.workoutTemplate.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Owner-scoped single-template lookup. Returns null for another user's
 * template — the caller answers "not found", never "forbidden" (IDOR rule).
 */
export async function findTemplateForUser(templateId: string, userId: string) {
  return prisma.workoutTemplate.findFirst({
    where: { id: templateId, userId },
  });
}

/**
 * Owner-scoped delete. deleteMany (not delete) so a non-owner id is a
 * silent zero-row no-op we can turn into a 404, not a Prisma throw.
 */
export async function deleteTemplateForUser(templateId: string, userId: string) {
  const result = await prisma.workoutTemplate.deleteMany({
    where: { id: templateId, userId },
  });
  return result.count > 0;
}
