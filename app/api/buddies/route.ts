/**
 * GET /api/buddies — my buddies, incoming and outgoing requests, and the
 * people I've blocked.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBuddyOverview } from "@/lib/services/social.service";
import { guardRequest } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: false });
    if (!auth.ok) return auth.response;

    return NextResponse.json(await getBuddyOverview(auth.userId));
  } catch (error) {
    return handleRouteError(error, "GET /api/buddies");
  }
}
