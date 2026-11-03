/**
 * GET  /api/chat/conversations — my conversations, newest activity first,
 *        50 per page: pass ?cursor=<nextCursor> for the next page
 * POST /api/chat/conversations — open (or create) a chat with a buddy { userId }
 */

import { NextRequest, NextResponse } from "next/server";
import { listConversations, startConversation } from "@/lib/services/chat.service";
import { startConversationSchema } from "@/lib/validators/chat.schema";
import { decodeConversationCursor } from "@/lib/chat/conversation-cursor";
import { guardRequest, parseJsonBody } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: false });
    if (!auth.ok) return auth.response;

    const raw = request.nextUrl.searchParams.get("cursor");
    const cursor = raw === null ? undefined : decodeConversationCursor(raw);
    if (cursor === null) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    return NextResponse.json(await listConversations(auth.userId, cursor));
  } catch (error) {
    return handleRouteError(error, "GET /api/chat/conversations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const body = await parseJsonBody(request, startConversationSchema);
    if (!body.ok) return body.response;

    const id = await startConversation(auth.userId, body.data.userId);
    return NextResponse.json({ id });
  } catch (error) {
    return handleRouteError(error, "POST /api/chat/conversations");
  }
}
