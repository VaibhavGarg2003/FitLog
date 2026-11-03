import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashJti, newJti, signTicket } from "./ws-ticket";

const SECRET = "s".repeat(40);

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("ws tickets", () => {
  it("produces a verifiable HS256 JWT with the agreed claims", () => {
    const jti = newJti();
    const { ticket, expiresAt } = signTicket(
      { sub: "user-1", jti, aud: "fitlog-chat-ws", iat: 1_000 },
      { secret: SECRET, kid: "7" }
    );
    const [h, p, sig] = ticket.split(".");
    expect(decode(h)).toEqual({ alg: "HS256", typ: "JWT", kid: "7" });
    expect(decode(p)).toEqual({
      iss: "fitlog-web",
      aud: "fitlog-chat-ws",
      sub: "user-1",
      iat: 1_000,
      exp: 1_060,
      jti,
    });
    expect(expiresAt).toBe(1_060);
    const expected = createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
    expect(sig).toBe(expected);
  });

  it("uses 128-bit random ids and stores only their hash", () => {
    const a = newJti();
    expect(Buffer.from(a, "base64url")).toHaveLength(16);
    expect(newJti()).not.toBe(a);
    expect(hashJti(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashJti(a)).toBe(hashJti(a));
  });
});
