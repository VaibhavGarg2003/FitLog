/**
 * POST /api/reports — report a user (optionally one of their messages).
 *
 * Body: { userId, messageId?, reason, details? }. A copy of the reported
 * message is stored with the report, so it survives the message being
 * deleted. Reports are kept 90 days.
 */

import { NextRequest, NextResponse } from "next/server";
import { reportUser } from "@/lib/services/social.service";
import { reportSchema } from "@/lib/validators/chat.schema";
import { guardRequest, parseJsonBody } from "@/lib/utils/route-guards";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const auth = await guardRequest(request, { mutating: true });
    if (!auth.ok) return auth.response;
    const body = await parseJsonBody(request, reportSchema);
    if (!body.ok) return body.response;

    const report = await reportUser(auth.userId, body.data);
    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/reports");
  }
}
