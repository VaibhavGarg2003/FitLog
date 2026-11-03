/**
 * Shared guards for the buddy + chat API routes
 * ══════════════════════════════════════════════
 *
 * Every buddy/chat route opens the same way. Rather than repeat it in a dozen
 * files, the routes call:
 *
 *   const auth = await guardRequest(request, { mutating: true });
 *   if (!auth.ok) return auth.response;
 *   const body = await parseJsonBody(request, someSchema);
 *   if (!body.ok) return body.response;
 *
 * guardRequest:
 *   1. Session — local JWT verification (getAuthUserId), 401 otherwise.
 *   2. Expected user — a tab still running as a previous account is refused
 *      (lib/utils/expected-user.ts), 401 like the workout routes.
 *   3. Same origin — mutating calls only (lib/utils/same-origin.ts), 403.
 *
 * parseJsonBody bounds the body size BEFORE parsing (the largest valid body
 * is a 2000-character message, well under 16 KB), then validates with Zod.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { isExpectedUserMismatch } from "@/lib/utils/expected-user";
import { isCrossSiteRequest } from "@/lib/utils/same-origin";

export const MAX_JSON_BODY_BYTES = 16 * 1024;

type Guarded = { ok: true; userId: string } | { ok: false; response: NextResponse };

export async function guardRequest(
  request: Request,
  opts: { mutating: boolean }
): Promise<Guarded> {
  if (opts.mutating && isCrossSiteRequest(request.headers, request.url)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Cross-site request refused" }, { status: 403 }),
    };
  }

  const userId = await getAuthUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (isExpectedUserMismatch(request.headers, userId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Signed in as a different user" }, { status: 401 }),
    };
  }

  return { ok: true, userId };
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<Parsed<z.output<S>>> {
  const tooLarge = () => ({
    ok: false as const,
    response: NextResponse.json({ error: "Request body too large" }, { status: 413 }),
  });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BODY_BYTES) return tooLarge();

  // Content-Length can be absent (chunked) or wrong, so count while reading
  // and stop the moment the limit is passed — never buffer an oversized body.
  let text: string;
  try {
    const read = await readBodyWithLimit(request, MAX_JSON_BODY_BYTES);
    if (read === null) return tooLarge();
    text = read;
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  return validate(schema, json, "Invalid request");
}

/** Validate already-extracted input (query params, route params). */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
  error = "Invalid request"
): Parsed<z.output<S>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const first = flat.formErrors[0] ?? Object.values(flat.fieldErrors).flat()[0];
    return {
      ok: false,
      response: NextResponse.json(
        { error: typeof first === "string" ? first : error, details: flat.fieldErrors },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** The body as UTF-8 text, or null as soon as it exceeds `maxBytes`. */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
