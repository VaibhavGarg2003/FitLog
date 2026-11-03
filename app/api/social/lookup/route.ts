/**
 * GET /api/social/lookup?handle=rahul_lifts — find a buddy by EXACT handle.
 *
 * Exact match only (no partial search), and only users who opted in, so the
 * user list can't be browsed. "Not found", "blocked you" and "you blocked
 * them" all look the same (404).
 */

import { NextRequest, NextResponse } from "next/server";
import { lookupByHandle } from "@/lib/services/social.service";
import { handleSchema } from "@/lib/validators/chat.schema";
import { checkHandleLookupLimit } from "@/lib/middleware/rate-limit";
import { guardRequest, validate } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: false });
    if (!auth.ok) return auth.response;
    const handle = validate(handleSchema, request.nextUrl.searchParams.get("handle") ?? "");
    if (!handle.ok) return handle.response;

    const limit = await checkHandleLookupLimit(auth.userId);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Too many searches. Try again in a little while." },
        { status: 429 }
      );
    }

    return NextResponse.json(await lookupByHandle(auth.userId, handle.data));
  } catch (error) {
    return handleRouteError(error, "GET /api/social/lookup");
  }
}
