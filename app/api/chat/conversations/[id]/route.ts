/**
 * GET /api/chat/conversations/[id] — one conversation's header: the other
 * person, unread count, read markers, and whether I can still message.
 * 404 for a conversation I'm not in.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/services/chat.service";
import { conversationIdSchema } from "@/lib/validators/chat.schema";
import { guardRequest, validate } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await guardRequest(request, { mutating: false });
    if (!auth.ok) return auth.response;
    const id = validate(conversationIdSchema, (await params).id);
    if (!id.ok) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    return NextResponse.json({ conversation: await getConversation(auth.userId, id.data) });
  } catch (error) {
    return handleRouteError(error, "GET /api/chat/conversations/[id]");
  }
}
