/**
 * POST /api/chat/retention — nightly chat clean-up (GitHub Actions cron).
 *
 * Requires `Authorization: Bearer <CRON_SECRET>` and FAILS CLOSED: with no
 * CRON_SECRET configured the endpoint refuses everything (unlike
 * /api/health, a read-only probe, this one deletes data). Constant-time
 * comparison. See lib/services/chat-retention.service.ts.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runChatRetention } from "@/lib/services/chat-retention.service";
import { handleRouteError } from "@/lib/utils/errors";

// Bounded batches can take a while on a large backlog.
export const maxDuration = 60;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  // Hash both sides: equal-length buffers for timingSafeEqual, no length leak.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await runChatRetention();
    console.log("[chat-retention]", JSON.stringify(result));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error, "POST /api/chat/retention");
  }
}
