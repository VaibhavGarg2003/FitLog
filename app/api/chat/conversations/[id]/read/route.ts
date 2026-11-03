/**
 * POST /api/chat/conversations/[id]/read — I've seen up to { lastReadMessageId }.
 *
 * The marker only moves forward and never past the newest message here.
 * Clients send it for messages actually visible on screen, at most once
 * every few seconds per conversation.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { markConversationRead } from "@/lib/services/chat.service";
import { ringChatDoorbell } from "@/lib/services/chat-relay";
import { conversationIdSchema, markReadSchema } from "@/lib/validators/chat.schema";
import { guardRequest, parseJsonBody, validate } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const id = validate(conversationIdSchema, (await params).id);
    if (!id.ok) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    const body = await parseJsonBody(request, markReadSchema);
    if (!body.ok) return body.response;

    const result = await markConversationRead(auth.userId, id.data, body.data.lastReadMessageId);
    if (result.notifyOther) {
      after(() =>
        ringChatDoorbell([
          {
            recipients: [result.otherUserId],
            event: { type: "conversation.read", conversationId: id.data },
          },
        ])
      );
    }
    return NextResponse.json({
      lastReadMessageId: result.lastReadMessageId,
      advanced: result.advanced,
    });
  } catch (error) {
    return handleRouteError(error, "POST /api/chat/conversations/[id]/read");
  }
}
