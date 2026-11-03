/**
 * POST /api/chat/ws-ticket — a 60-second, single-use admission ticket for
 * the live-chat WebSocket, plus the socket URL.
 *
 * POST (not GET): issuing records a ticket. The answer is never cached. The
 * browser keeps the ticket in memory only and sends it as the socket's first
 * frame. 503 = live delivery not configured (the client keeps polling).
 */

import { NextRequest, NextResponse } from "next/server";
import { issueWsTicket } from "@/lib/services/chat.service";
import { guardRequest } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;

    const result = await issueWsTicket(auth.userId);
    return NextResponse.json(
      { ...result, userId: auth.userId },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleRouteError(error, "POST /api/chat/ws-ticket");
  }
}
