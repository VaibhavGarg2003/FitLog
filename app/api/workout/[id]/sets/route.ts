/**
 * POST /api/workout/[id]/sets — Add a set to a session
 * PUT  /api/workout/[id]/sets — Finish session (calculates burn)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { logSet, finishSession } from "@/lib/services/workout.service";
import { getProfileByUserId } from "@/lib/repositories/profile.repository";
import {
  logSetSchema,
  finishSessionSchema,
} from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = logSetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid set data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const set = await logSet(sessionId, userId, parsed.data);

    return NextResponse.json(set, { status: 201 });
  } catch (error) {
    // Ownership failures throw NotFoundError → 404 via handleRouteError
    // (don't reveal whether the id exists for another user).
    return handleRouteError(error, "POST /api/workout/[id]/sets");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = finishSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid session data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    // Get user's weight for calorie burn calculation
    const profile = await getProfileByUserId(userId);
    const userWeightKg = profile?.weightKg ?? 70;

    const session = await finishSession(sessionId, userId, {
      ...parsed.data,
      userWeightKg,
    });

    return NextResponse.json(session);
  } catch (error) {
    return handleRouteError(error, "PUT /api/workout/[id]/sets");
  }
}
