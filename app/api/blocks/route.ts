/**
 * POST /api/blocks — block someone { userId }.
 *
 * Ends any buddyship or pending request, and stops messages and requests in
 * BOTH directions until unblocked. The blocked person is never told.
 */

import { NextRequest, NextResponse } from "next/server";
import { blockUser } from "@/lib/services/social.service";
import { blockSchema } from "@/lib/validators/chat.schema";
import { guardRequest, parseJsonBody } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const body = await parseJsonBody(request, blockSchema);
    if (!body.ok) return body.response;

    return NextResponse.json({ user: await blockUser(auth.userId, body.data.userId) });
  } catch (error) {
    return handleRouteError(error, "POST /api/blocks");
  }
}
