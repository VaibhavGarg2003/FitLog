/**
 * POST /api/buddies/requests — ask someone to be my buddy.
 *
 * Body: { handle } (exact @handle) or { inviteCode } (their QR / link —
 * connects immediately, since sharing an invite is consent). Always POST:
 * opening an invite link must never connect anyone by itself.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { sendBuddyRequest } from "@/lib/services/social.service";
import { ringChatDoorbell } from "@/lib/services/chat-relay";
import { buddyRequestSchema } from "@/lib/validators/chat.schema";
import { checkHandleLookupLimit } from "@/lib/middleware/rate-limit";
import { guardRequest, parseJsonBody } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const body = await parseJsonBody(request, buddyRequestSchema);
    if (!body.ok) return body.response;

    // A request by handle also reveals whether the handle exists, so it
    // shares the lookup limiter (invite codes are unguessable — no limit).
    if ("handle" in body.data) {
      const limit = await checkHandleLookupLimit(auth.userId);
      if (limit.limited) {
        return NextResponse.json(
          { error: "Too many searches. Try again in a little while." },
          { status: 429 }
        );
      }
    }

    const result = await sendBuddyRequest(auth.userId, body.data);
    if (result.outcome === "REQUESTED" || result.outcome === "CONNECTED") {
      after(() =>
        ringChatDoorbell([
          { recipients: [result.user.userId], event: { type: "buddies.changed" } },
        ])
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "POST /api/buddies/requests");
  }
}
