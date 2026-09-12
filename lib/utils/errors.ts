/**
 * Error Taxonomy + Route Error Handler
 * ═════════════════════════════════════
 *
 * THE RULE: API routes must not echo arbitrary error.message values to
 * clients — internal errors can carry infrastructure details (provider
 * error bodies, database hints). Only messages written FOR users cross
 * the boundary; everything else becomes a generic message + a correlation
 * ID, with the real error captured in Sentry.
 *
 * THE TAXONOMY (deliberately capped — doc 08 B4's "no 20 error classes"
 * rule; extend only when proven insufficient). Originally four classes;
 * ServiceUnavailableError is a justified fifth for account-deletion
 * provisioning failures (missing env, missing function/schema, missing
 * EXECUTE privilege). Those are operational "not wired up yet" states,
 * not bugs in the request, and must surface as 503 rather than a generic
 * 500 so the client can hide/disable the control instead of looking broken.
 *
 *   UserFacingError         — base: message is safe to show (500 by default)
 *   ValidationError         — bad input that survived schema checks (400)
 *   NotFoundError           — missing/unowned resource (404; also the IDOR
 *                             answer: "not found", never "forbidden", so we
 *                             don't reveal that the resource exists)
 *   UpstreamError           — a dependency (LLM, Redis) failed (502)
 *   ConflictError           — valid request that collides with something
 *                             already written (409); the client must be able
 *                             to tell this apart from a 400 to recover
 *   ServiceUnavailableError — feature not provisioned / ops gap (503)
 *
 * USAGE in every route's catch block:
 *   } catch (error) {
 *     return handleRouteError(error, "POST /api/nutrition/log");
 *   }
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export class UserFacingError extends Error {
  /** HTTP status this error maps to when it reaches a route boundary */
  readonly httpStatus: number = 500;

  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class ValidationError extends UserFacingError {
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends UserFacingError {
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UpstreamError extends UserFacingError {
  readonly httpStatus = 502;
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

/**
 * The request is valid, but it collides with something already written (409).
 *
 * A sixth class, and not a ValidationError, because the CLIENT must be able to
 * tell the two apart to recover correctly. A 400 means "fix your input". This
 * means "part of this was already saved — your draft is stale". The AI workout
 * import recovers from it by starting a fresh import id, which it must never do
 * on an ordinary validation failure. A shared status would force the client to
 * match on message text to decide, which breaks the day the copy changes.
 */
export class ConflictError extends UserFacingError {
  readonly httpStatus = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ServiceUnavailableError extends UserFacingError {
  readonly httpStatus = 503;
  constructor(
    message = "This action is temporarily unavailable. Please try again later."
  ) {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * One catch-block to rule them all.
 *
 * Known (UserFacingError family) → its status + its message.
 * Unknown → Sentry.captureException + generic 500 + correlation ID the
 * user can quote in a bug report ("support code: abc123") that links
 * straight to the Sentry event.
 */
export function handleRouteError(
  error: unknown,
  context: string
): NextResponse {
  if (error instanceof UserFacingError) {
    // Expected failure — log for visibility, no Sentry noise.
    console.warn(`[${context}] ${error.name}: ${error.message}`);
    return NextResponse.json(
      { error: error.message },
      { status: error.httpStatus }
    );
  }

  // Unknown failure — full details to Sentry + server log, generic to user.
  const correlationId = Sentry.captureException(error, {
    tags: { route: context },
  });
  console.error(`[${context}] Unhandled (${correlationId}):`, error);

  return NextResponse.json(
    {
      error: "Something went wrong. Please try again.",
      correlationId,
    },
    { status: 500 }
  );
}
