/**
 * GET   /api/social/profile — my buddy profile (handle, invite code, prefs) or null
 * PUT   /api/social/profile — choose or change my @handle   { handle }
 * PATCH /api/social/profile — update preferences            { readReceipts }
 *
 * Choosing a handle is the opt-in to the buddy feature.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  claimHandle,
  getMySocialProfile,
  updateReadReceipts,
} from "@/lib/services/social.service";
import { claimHandleSchema, socialPreferencesSchema } from "@/lib/validators/chat.schema";
import { guardRequest, parseJsonBody } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: false });
    if (!auth.ok) return auth.response;

    return NextResponse.json({ profile: await getMySocialProfile(auth.userId) });
  } catch (error) {
    return handleRouteError(error, "GET /api/social/profile");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const body = await parseJsonBody(request, claimHandleSchema);
    if (!body.ok) return body.response;

    return NextResponse.json({ profile: await claimHandle(auth.userId, body.data.handle) });
  } catch (error) {
    return handleRouteError(error, "PUT /api/social/profile");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const body = await parseJsonBody(request, socialPreferencesSchema);
    if (!body.ok) return body.response;

    return NextResponse.json({
      profile: await updateReadReceipts(auth.userId, body.data.readReceipts),
    });
  } catch (error) {
    return handleRouteError(error, "PATCH /api/social/profile");
  }
}
