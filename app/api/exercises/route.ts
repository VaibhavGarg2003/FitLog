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
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/supabase/prisma";
import type { ExerciseCategory } from "@prisma/client";

export async function GET(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const muscleGroup = searchParams.get("muscle");
    const category = searchParams.get("category") as ExerciseCategory | null;
    const query = searchParams.get("q")?.trim();

    // Build filter
    const where: Record<string, unknown> = {};
    if (muscleGroup) {
      where.muscleGroup = { equals: muscleGroup, mode: "insensitive" };
    }
    if (category && ["COMPOUND", "ISOLATION", "CARDIO"].includes(category)) {
      where.category = category;
    }
    if (query && query.length >= 2) {
      where.name = { contains: query, mode: "insensitive" };
    }

    const exercises = await prisma.exercise.findMany({
      where,
      orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
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

    return NextResponse.json({ exercises, count: exercises.length });
  } catch (error) {
    console.error("[GET /api/exercises] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
