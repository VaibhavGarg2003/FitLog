/**
 * GET /api/chat/unread — total unread messages (capped at 100) for the
 * navigation badge.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUnreadTotal } from "@/lib/services/chat.service";
import { guardRequest } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: false });
    if (!auth.ok) return auth.response;

    return NextResponse.json({ unread: await getUnreadTotal(auth.userId) });
  } catch (error) {
    return handleRouteError(error, "GET /api/chat/unread");
  }
}
