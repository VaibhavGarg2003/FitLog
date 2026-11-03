/**
 * WebSocket admission tickets — signing (Next.js side)
 * ═════════════════════════════════════════════════════
 *
 * A ticket is a standard compact JWT, HS256, so the Django side verifies it
 * with PyJWT. It admits ONE WebSocket connection for the user in `sub`:
 *
 *   header  { alg: "HS256", typ: "JWT", kid }
 *   payload { iss: "fitlog-web", aud, sub, iat, exp: iat + 60, jti }
 *
 * `jti` is 128 random bits. The database stores only sha256(jti), and Django
 * consumes that row atomically, so the ticket is single-use even if stolen.
 * The browser sends it as the FIRST WebSocket frame — never in the URL,
 * where proxies and logs would keep it.
 *
 * Why not the Supabase access token? It would put a general-purpose session
 * credential in browser JavaScript; this one can only open a chat inbox,
 * once, within a minute.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { TICKET_ISSUER, TICKET_TTL_SECONDS } from "@/lib/chat/live-config";

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

export function newJti(): string {
  return randomBytes(16).toString("base64url");
}

export function hashJti(jti: string): string {
  return createHash("sha256").update(jti).digest("hex");
}

export function signTicket(
  claims: { sub: string; jti: string; aud: string; iat: number },
  key: { secret: string; kid: string }
): { ticket: string; expiresAt: number } {
  const exp = claims.iat + TICKET_TTL_SECONDS;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: key.kid }));
  const payload = b64url(
    JSON.stringify({
      iss: TICKET_ISSUER,
      aud: claims.aud,
      sub: claims.sub,
      iat: claims.iat,
      exp,
      jti: claims.jti,
    })
  );
  const signature = createHmac("sha256", key.secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return { ticket: `${header}.${payload}.${signature}`, expiresAt: exp };
}
