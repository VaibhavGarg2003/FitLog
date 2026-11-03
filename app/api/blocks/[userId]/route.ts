/**
 * DELETE /api/blocks/[userId] — unblock. Does not restore the buddyship;
 * either person can send a new request.
 */

import { NextRequest, NextResponse } from "next/server";
import { unblockUser } from "@/lib/services/social.service";
import { userIdSchema } from "@/lib/validators/chat.schema";
import { guardRequest, validate } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const other = validate(userIdSchema, (await params).userId);
    if (!other.ok) return other.response;

    await unblockUser(auth.userId, other.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/blocks/[userId]");
  }
}
