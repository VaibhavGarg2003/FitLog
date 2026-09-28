/**
 * POST /api/progress/weight — Log today's weight
 * GET  /api/progress/weight — Get weight history + progress stats
 *
 * The weight log upserts — logging twice on the same day
 * overwrites the first entry. No duplicates.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  recordWeight,
  getProgressData,
} from "@/lib/services/progress.service";
import { logWeightSchema } from "@/lib/validators/api.schema";
import { userToday } from "@/lib/services/user-calendar.service";
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

    const parsed = logWeightSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid weight data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const log = await recordWeight(userId, {
      // Client normally sends the app's day; the fallback is the user's day in
      // their saved zone — never the server's UTC day (a 1 AM weigh-in in
      // India would land on yesterday).
      date: parsed.data.date ?? (await userToday(userId)),
      weightKg: parsed.data.weightKg,
      notes: parsed.data.notes,
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/progress/weight");
  }
}

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const progress = await getProgressData(userId);
    return NextResponse.json(progress);
  } catch (error) {
    return handleRouteError(error, "GET /api/progress/weight");
  }
}
