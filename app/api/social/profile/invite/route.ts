/**
 * POST /api/social/profile/invite — replace my invite code.
 *
 * Every QR code / invite link shared so far stops working.
 */

import { NextRequest, NextResponse } from "next/server";
import { rotateInviteCode } from "@/lib/services/social.service";
import { guardRequest } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;

    return NextResponse.json({ profile: await rotateInviteCode(auth.userId) });
  } catch (error) {
    return handleRouteError(error, "POST /api/social/profile/invite");
  }
}
