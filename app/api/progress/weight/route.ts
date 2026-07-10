/**
 * POST /api/progress/weight — Log today's weight
 * GET  /api/progress/weight — Get weight history + progress stats
 *
 * The weight log upserts — logging twice on the same day
 * overwrites the first entry. No duplicates.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  recordWeight,
  getProgressData,
} from "@/lib/services/progress.service";

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.weightKg || body.weightKg < 30 || body.weightKg > 300) {
      return NextResponse.json(
        { error: "Weight must be between 30 and 300 kg" },
        { status: 400 }
      );
    }

    const log = await recordWeight(userId, {
      date: body.date || new Date().toISOString().split("T")[0],
      weightKg: body.weightKg,
      notes: body.notes,
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("[POST /api/progress/weight]", error);
    return NextResponse.json(
      { error: "Failed to log weight" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const progress = await getProgressData(userId);
    return NextResponse.json(progress);
  } catch (error) {
    console.error("[GET /api/progress/weight]", error);
    return NextResponse.json(
      { error: "Failed to fetch progress" },
      { status: 500 }
    );
  }
}
