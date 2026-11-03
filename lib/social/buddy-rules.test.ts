import { describe, expect, it } from "vitest";
import {
  BLOCK_COOLDOWN_MS,
  CANCEL_COOLDOWN_MS,
  DECLINE_COOLDOWN_MS,
  REMOVE_COOLDOWN_MS,
  decideBlock,
  decideRemove,
  decideRequest,
  decideRespond,
  type BuddyRow,
} from "./buddy-rules";
import { orderPair, otherInPair } from "./pair";
import { isValidHandle, normalizeHandle } from "./handle";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-09T12:00:00Z");

const pending = (by: string): BuddyRow => ({
  status: "PENDING",
  requestedById: by,
  cooldownUserId: null,
  cooldownUntil: null,
});
const acceptedRow: BuddyRow = { ...pending(A), status: "ACCEPTED" };
const inactive = (cooldownUser: string | null, until: Date | null): BuddyRow => ({
  status: "INACTIVE",
  requestedById: A,
  cooldownUserId: cooldownUser,
  cooldownUntil: until,
});

describe("decideRequest", () => {
  it("creates a pending request when there is no row", () => {
    const d = decideRequest(null, A, NOW, { viaInvite: false });
    expect(d).toMatchObject({
      ok: true,
      outcome: "REQUESTED",
      write: { kind: "set", status: "PENDING", requestedById: A, newRequest: true },
    });
  });

  it("connects immediately with an invite code", () => {
    const d = decideRequest(null, A, NOW, { viaInvite: true });
    expect(d).toMatchObject({ ok: true, outcome: "CONNECTED", write: { status: "ACCEPTED" } });
  });

  it("is idempotent for a repeated request by the same user", () => {
    const d = decideRequest(pending(A), A, NOW, { viaInvite: false });
    expect(d).toEqual({ ok: true, write: { kind: "none" }, outcome: "ALREADY_REQUESTED" });
  });

  it("accepts a crossed request and keeps the original requester", () => {
    const d = decideRequest(pending(B), A, NOW, { viaInvite: false });
    expect(d).toMatchObject({
      ok: true,
      outcome: "CONNECTED",
      write: { status: "ACCEPTED", requestedById: B, responded: true },
    });
  });

  it("refuses when already buddies (handle) but is a no-op via invite", () => {
    expect(decideRequest(acceptedRow, A, NOW, { viaInvite: false })).toEqual({
      ok: false,
      error: "ALREADY_BUDDIES",
    });
    expect(decideRequest(acceptedRow, A, NOW, { viaInvite: true })).toMatchObject({
      ok: true,
      outcome: "ALREADY_CONNECTED",
      write: { kind: "none" },
    });
  });

  it("blocks the user on cooldown — even with an invite", () => {
    const row = inactive(A, new Date(NOW.getTime() + 1000));
    expect(decideRequest(row, A, NOW, { viaInvite: false })).toEqual({
      ok: false,
      error: "COOLDOWN",
    });
    expect(decideRequest(row, A, NOW, { viaInvite: true })).toEqual({
      ok: false,
      error: "COOLDOWN",
    });
  });

  it("lets the OTHER user request during someone else's cooldown", () => {
    const row = inactive(A, new Date(NOW.getTime() + 1000));
    expect(decideRequest(row, B, NOW, { viaInvite: false })).toMatchObject({
      ok: true,
      outcome: "REQUESTED",
      write: { requestedById: B, cooldownUserId: null, cooldownUntil: null },
    });
  });

  it("allows a new request once the cooldown has passed", () => {
    const row = inactive(A, new Date(NOW.getTime() - 1));
    expect(decideRequest(row, A, NOW, { viaInvite: false })).toMatchObject({
      ok: true,
      outcome: "REQUESTED",
    });
  });
});

describe("decideRespond", () => {
  it("lets only the recipient accept", () => {
    expect(decideRespond(pending(A), B, "accept", NOW)).toMatchObject({
      ok: true,
      outcome: "CONNECTED",
      write: { status: "ACCEPTED", requestedById: A },
    });
    expect(decideRespond(pending(A), A, "accept", NOW)).toEqual({
      ok: false,
      error: "NO_PENDING_REQUEST",
    });
  });

  it("puts the requester on a 7-day cooldown when declined", () => {
    const d = decideRespond(pending(A), B, "decline", NOW);
    expect(d).toMatchObject({
      ok: true,
      outcome: "DECLINED",
      write: {
        status: "INACTIVE",
        cooldownUserId: A,
        cooldownUntil: new Date(NOW.getTime() + DECLINE_COOLDOWN_MS),
      },
    });
  });

  it("lets only the requester cancel, with a 1-day cooldown", () => {
    expect(decideRespond(pending(A), B, "cancel", NOW)).toEqual({
      ok: false,
      error: "NO_PENDING_REQUEST",
    });
    expect(decideRespond(pending(A), A, "cancel", NOW)).toMatchObject({
      ok: true,
      outcome: "CANCELLED",
      write: { cooldownUserId: A, cooldownUntil: new Date(NOW.getTime() + CANCEL_COOLDOWN_MS) },
    });
  });

  it("refuses when nothing is pending", () => {
    expect(decideRespond(null, B, "accept", NOW)).toEqual({ ok: false, error: "NO_PENDING_REQUEST" });
    expect(decideRespond(acceptedRow, B, "decline", NOW)).toEqual({
      ok: false,
      error: "NO_PENDING_REQUEST",
    });
  });
});

describe("decideRemove / decideBlock", () => {
  it("puts the removed buddy on cooldown", () => {
    expect(decideRemove(acceptedRow, A, B, NOW)).toMatchObject({
      ok: true,
      outcome: "REMOVED",
      write: {
        status: "INACTIVE",
        cooldownUserId: B,
        cooldownUntil: new Date(NOW.getTime() + REMOVE_COOLDOWN_MS),
      },
    });
  });

  it("refuses to remove someone who isn't a buddy", () => {
    expect(decideRemove(pending(A), A, B, NOW)).toEqual({ ok: false, error: "NOT_BUDDIES" });
    expect(decideRemove(null, A, B, NOW)).toEqual({ ok: false, error: "NOT_BUDDIES" });
  });

  it("ends any relationship and puts the blocked person on cooldown", () => {
    const until = new Date(NOW.getTime() + BLOCK_COOLDOWN_MS);
    expect(decideBlock(acceptedRow, A, B, NOW)).toMatchObject({
      kind: "set",
      status: "INACTIVE",
      responded: true,
      cooldownUserId: B,
      cooldownUntil: until,
    });
    expect(decideBlock(pending(B), A, B, NOW)).toMatchObject({ status: "INACTIVE", cooldownUserId: B });
    // No row yet: one is created to carry the cooldown.
    expect(decideBlock(null, A, B, NOW)).toMatchObject({
      kind: "set",
      status: "INACTIVE",
      requestedById: A,
      responded: false,
      cooldownUserId: B,
    });
  });

  it("never lets block → unblock wipe the blocker's own cooldown", () => {
    const declined = inactive(A, new Date(NOW.getTime() + 1000));
    expect(decideBlock(declined, A, B, NOW)).toEqual({ kind: "none" });
    const reopened = { ...pending(B), cooldownUserId: A, cooldownUntil: declined.cooldownUntil };
    expect(decideBlock(reopened, A, B, NOW)).toMatchObject({
      status: "INACTIVE",
      cooldownUserId: A,
      cooldownUntil: declined.cooldownUntil,
    });
  });

  it("does not shorten a longer cooldown the blocked person already has", () => {
    const longer = new Date(NOW.getTime() + 30 * 24 * 3600 * 1000);
    expect(decideBlock(inactive(B, longer), A, B, NOW)).toMatchObject({ cooldownUntil: longer });
  });
});

describe("pair + handle helpers", () => {
  it("orders a pair the same way regardless of argument order", () => {
    expect(orderPair(B, A)).toEqual({ low: A, high: B });
    expect(orderPair(A, B)).toEqual({ low: A, high: B });
    expect(otherInPair({ low: A, high: B }, A)).toBe(B);
    expect(() => orderPair(A, A)).toThrow();
    expect(() => otherInPair({ low: A, high: B }, "x")).toThrow();
  });

  it("normalizes and validates handles", () => {
    expect(normalizeHandle("  @@Rahul_Lifts ")).toBe("rahul_lifts");
    expect(isValidHandle("rahul_lifts")).toBe(true);
    expect(isValidHandle("ab")).toBe(false);
    expect(isValidHandle("has space")).toBe(false);
    expect(isValidHandle("a".repeat(21))).toBe(false);
  });
});
