/**
 * Exercises API Route
 * ═══════════════════
 *
 * GET /api/exercises?muscle=Chest&category=COMPOUND
 *
 * Returns exercises, optionally filtered by muscle group or category.
 * Used by the workout logging feature.
 */

import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { findExercises } from "@/lib/repositories/exercise.repository";
import type { ExerciseCategory } from "@prisma/client";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(request: Request) {
  try {
    // Auth check
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const muscleGroup = searchParams.get("muscle");
    const rawCategory = searchParams.get("category");
    const category =
      rawCategory && ["COMPOUND", "ISOLATION", "CARDIO"].includes(rawCategory)
        ? (rawCategory as ExerciseCategory)
        : null;
    const query = searchParams.get("q")?.trim();

    const exercises = await findExercises({ muscleGroup, category, query });

    return NextResponse.json({ exercises, count: exercises.length });
  } catch (error) {
    return handleRouteError(error, "GET /api/exercises");
  }
}
