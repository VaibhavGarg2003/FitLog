/**
 * AI Workout Import API Route
 * ═══════════════════════════
 *
 * POST /api/workout/ai-import
 *
 * The WRITE half of the AI workout logger. The parse route reads language;
 * this one only writes numbers.
 *
 * WHAT IT ACCEPTS: exercise ids the server itself resolved during the parse,
 * sets with bounds identical to manual logging, and a per-set clientRequestId
 * so a retry is a no-op. No free text, no LLM call, nothing to rate-limit
 * against a provider quota.
 *
 * WHY IT IS NOT /api/workout/[id]/... : the session may not exist yet. The
 * import appends to the day's in-progress session if there is one and creates
 * a RECALL session otherwise, inside the same transaction as the sets.
 *
 * REQUEST BODY:
 * {
 *   importId: "<uuid>",              // identifies this import, for replays
 *   date: "2026-09-12",
 *   finish: false,                   // also complete the session?
 *   durationMin: 55,                 // required when finish is true
 *   notes: "push day",
 *   exercises: [
 *     { exerciseId: "...", sets: [{ weight: 60, reps: 8, isWarmup: false,
 *                                   clientRequestId: "<uuid>" }] }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { importWorkout } from "@/lib/services/workout.service";
import { getProfileByUserId } from "@/lib/repositories/profile.repository";
import { aiImportSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = aiImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid workout import",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    // Only needed when the import also finishes the session; fetched here
    // rather than inside the transaction so the write stays short. 70kg is the
    // same fallback the manual finish route uses.
    const profile = parsed.data.finish
      ? await getProfileByUserId(userId)
      : null;

    const result = await importWorkout(userId, {
      ...parsed.data,
      userWeightKg: profile?.weightKg ?? 70,
    });

    // 200 on a replay, 201 on a real write: a retry did not create anything.
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    // A stale draft naming a deleted exercise throws NotFoundError → 404.
    return handleRouteError(error, "POST /api/workout/ai-import");
  }
}
