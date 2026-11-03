/**
 * GET  /api/chat/conversations/[id]/messages — a page of messages, oldest → newest
 *        ?before=<id>  older history (scrolling up)
 *        ?after=<id>   catch-up after a reconnect / poll (repeat while hasMore)
 *        (neither)     the newest page
 * POST /api/chat/conversations/[id]/messages — send { clientMessageId, body }
 *
 * POST answers 201 once the message is committed ("sent ✓"); a retry with the
 * same clientMessageId answers 200 with the original message.
 * Message ids are decimal strings.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { getMessages, sendMessage } from "@/lib/services/chat.service";
import { ringChatDoorbell } from "@/lib/services/chat-relay";
import {
  conversationIdSchema,
  messagesQuerySchema,
  sendMessageSchema,
} from "@/lib/validators/chat.schema";
import { guardRequest, parseJsonBody, validate } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Conversation not found" }, { status: 404 });

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await guardRequest(request, { mutating: false });
    if (!auth.ok) return auth.response;
    const id = validate(conversationIdSchema, (await params).id);
    if (!id.ok) return notFound();

    const search = request.nextUrl.searchParams;
    const query = validate(messagesQuerySchema, {
      before: search.get("before") ?? undefined,
      after: search.get("after") ?? undefined,
      limit: search.get("limit") ?? undefined,
    });
    if (!query.ok) return query.response;

    return NextResponse.json(await getMessages(auth.userId, id.data, query.data));
  } catch (error) {
    return handleRouteError(error, "GET /api/chat/conversations/[id]/messages");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const id = validate(conversationIdSchema, (await params).id);
    if (!id.ok) return notFound();
    const body = await parseJsonBody(request, sendMessageSchema);
    if (!body.ok) return body.response;

    const result = await sendMessage(auth.userId, id.data, body.data);
    if (result.created) {
      // Committed: tell the recipient's open tabs (best-effort, after the response).
      after(() =>
        ringChatDoorbell([
          {
            recipients: [result.recipientId],
            event: {
              type: "message.new",
              conversationId: result.message.conversationId,
              messageId: result.message.id,
            },
          },
        ])
      );
    }
    return NextResponse.json(
      { message: result.message, created: result.created },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    return handleRouteError(error, "POST /api/chat/conversations/[id]/messages");
  }
}
