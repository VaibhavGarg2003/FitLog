import { describe, expect, it } from "vitest";
import { decodeConversationCursor, encodeConversationCursor } from "./conversation-cursor";

const ID = "3f2c1b7e-9d1a-4c55-8e2f-1a2b3c4d5e6f";

describe("conversation cursor", () => {
  it("round-trips with millisecond precision", () => {
    const activity = new Date("2026-10-09T12:34:56.789Z");
    const raw = encodeConversationCursor({ activity, id: ID });
    expect(raw).toBe(`${activity.getTime()}.${ID}`);
    expect(decodeConversationCursor(raw)).toEqual({ activity, id: ID });
  });

  it("rejects malformed cursors", () => {
    for (const bad of ["", "abc", `x.${ID}`, "123.not-a-uuid", `123.${ID}.extra`, `-1.${ID}`]) {
      expect(decodeConversationCursor(bad)).toBeNull();
    }
  });
});
