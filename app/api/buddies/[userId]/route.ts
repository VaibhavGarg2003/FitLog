/**
 * POST   /api/buddies/[userId] — answer a pending request { action }
 *          accept / decline: I am the one who was asked
 *          cancel:           I am the one who asked
 * DELETE /api/buddies/[userId] — stop being buddies
 */

import { NextRequest, NextResponse, after } from "next/server";
import { removeBuddy, respondToBuddyRequest } from "@/lib/services/social.service";
import { ringChatDoorbell } from "@/lib/services/chat-relay";
import { buddyRespondSchema, userIdSchema } from "@/lib/validators/chat.schema";
import { guardRequest, parseJsonBody, validate } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

type Params = { params: Promise<{ userId: string }> };

/** The other person's buddy list / chat permissions changed (after commit). */
function notifyOther(userId: string) {
  after(() =>
    ringChatDoorbell([{ recipients: [userId], event: { type: "buddies.changed" } }])
  );
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const other = validate(userIdSchema, (await params).userId);
    if (!other.ok) return other.response;
    const body = await parseJsonBody(request, buddyRespondSchema);
    if (!body.ok) return body.response;

    const result = await respondToBuddyRequest(auth.userId, other.data, body.data.action);
    notifyOther(other.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "POST /api/buddies/[userId]");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const other = validate(userIdSchema, (await params).userId);
    if (!other.ok) return other.response;

    const result = await removeBuddy(auth.userId, other.data);
    notifyOther(other.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "DELETE /api/buddies/[userId]");
  }
}
