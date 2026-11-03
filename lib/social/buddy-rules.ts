/**
 * Buddy state machine — pure rules, no database
 * ══════════════════════════════════════════════
 *
 * One `buddyships` row per user pair. The repository locks the pair, reads
 * the row (or null), asks these functions what to do, and writes the answer.
 * Keeping the rules pure makes every transition unit-testable.
 *
 *   (none) ──request──▶ PENDING ──accept──▶ ACCEPTED
 *                          │ decline / cancel      │ remove / block
 *                          ▼                       ▼
 *                       INACTIVE ◀─────────────────┘
 *                          │ request (after any cooldown)
 *                          └──────▶ PENDING
 *
 * COOLDOWNS stop request spam without deleting history:
 *   decline → the requester waits 7 days before asking again
 *   cancel  → the requester waits 1 day (stops request/cancel ping-pong)
 *   remove  → the removed buddy waits 7 days
 *   block   → the blocked person waits 7 days after any unblock
 * The other person is never on cooldown — they can always reach out.
 *
 * CROSSED REQUESTS: if B asks A while A's request to B is pending, they both
 * want it — the second request accepts the first.
 *
 * INVITES: requesting with someone's invite code (their QR / link) counts as
 * their consent, so it connects immediately — but never past a cooldown.
 */

export type BuddyStatus = "PENDING" | "ACCEPTED" | "INACTIVE";

export interface BuddyRow {
  status: BuddyStatus;
  requestedById: string;
  cooldownUserId: string | null;
  cooldownUntil: Date | null;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DECLINE_COOLDOWN_MS = 7 * DAY_MS;
export const CANCEL_COOLDOWN_MS = 1 * DAY_MS;
export const REMOVE_COOLDOWN_MS = 7 * DAY_MS;
export const BLOCK_COOLDOWN_MS = 7 * DAY_MS;

/** What the repository should write. */
export type BuddyWrite =
  | { kind: "none" } // nothing changes (idempotent repeat)
  | {
      kind: "set";
      status: BuddyStatus;
      requestedById: string;
      /** Touch requested_at (a new request was made). */
      newRequest: boolean;
      /** Touch responded_at (an answer or removal happened). */
      responded: boolean;
      cooldownUserId: string | null;
      cooldownUntil: Date | null;
    };

/** Rule violations — the service maps these to HTTP errors. */
export type BuddyRuleError =
  | "ALREADY_BUDDIES"
  | "COOLDOWN"
  | "NO_PENDING_REQUEST"
  | "NOT_BUDDIES";

export type BuddyDecision =
  | { ok: true; write: BuddyWrite; outcome: BuddyOutcome }
  | { ok: false; error: BuddyRuleError };

/** What the user sees as the result of their action. */
export type BuddyOutcome =
  | "REQUESTED"
  | "ALREADY_REQUESTED"
  | "CONNECTED"
  | "ALREADY_CONNECTED"
  | "DECLINED"
  | "CANCELLED"
  | "REMOVED";

function onCooldown(row: BuddyRow, userId: string, now: Date): boolean {
  return (
    row.cooldownUserId === userId &&
    row.cooldownUntil !== null &&
    row.cooldownUntil.getTime() > now.getTime()
  );
}

function accepted(requestedById: string): BuddyWrite {
  return {
    kind: "set",
    status: "ACCEPTED",
    requestedById,
    newRequest: false,
    responded: true,
    cooldownUserId: null,
    cooldownUntil: null,
  };
}

/**
 * `actorId` asks `otherId` to be buddies (by handle, or with otherId's
 * invite code when `viaInvite`).
 */
export function decideRequest(
  row: BuddyRow | null,
  actorId: string,
  now: Date,
  opts: { viaInvite: boolean }
): BuddyDecision {
  if (row?.status === "ACCEPTED") {
    return opts.viaInvite
      ? { ok: true, write: { kind: "none" }, outcome: "ALREADY_CONNECTED" }
      : { ok: false, error: "ALREADY_BUDDIES" };
  }

  if (row?.status === "PENDING") {
    if (row.requestedById === actorId) {
      // Repeat of my own request: an invite upgrades it (they consented).
      return opts.viaInvite
        ? { ok: true, write: accepted(actorId), outcome: "CONNECTED" }
        : { ok: true, write: { kind: "none" }, outcome: "ALREADY_REQUESTED" };
    }
    // Crossed request: they already asked me.
    return { ok: true, write: accepted(row.requestedById), outcome: "CONNECTED" };
  }

  if (row && onCooldown(row, actorId, now)) {
    return { ok: false, error: "COOLDOWN" };
  }

  if (opts.viaInvite) {
    return { ok: true, write: accepted(actorId), outcome: "CONNECTED" };
  }

  return {
    ok: true,
    write: {
      kind: "set",
      status: "PENDING",
      requestedById: actorId,
      newRequest: true,
      responded: false,
      cooldownUserId: null,
      cooldownUntil: null,
    },
    outcome: "REQUESTED",
  };
}

/**
 * Answer a pending request. Only the RECIPIENT may accept or decline; only
 * the REQUESTER may cancel.
 */
export function decideRespond(
  row: BuddyRow | null,
  actorId: string,
  action: "accept" | "decline" | "cancel",
  now: Date
): BuddyDecision {
  if (!row || row.status !== "PENDING") {
    return { ok: false, error: "NO_PENDING_REQUEST" };
  }

  const actorIsRequester = row.requestedById === actorId;

  if (action === "cancel") {
    if (!actorIsRequester) return { ok: false, error: "NO_PENDING_REQUEST" };
    return {
      ok: true,
      write: {
        kind: "set",
        status: "INACTIVE",
        requestedById: row.requestedById,
        newRequest: false,
        responded: true,
        cooldownUserId: actorId,
        cooldownUntil: new Date(now.getTime() + CANCEL_COOLDOWN_MS),
      },
      outcome: "CANCELLED",
    };
  }

  if (actorIsRequester) return { ok: false, error: "NO_PENDING_REQUEST" };

  if (action === "accept") {
    return { ok: true, write: accepted(row.requestedById), outcome: "CONNECTED" };
  }

  return {
    ok: true,
    write: {
      kind: "set",
      status: "INACTIVE",
      requestedById: row.requestedById,
      newRequest: false,
      responded: true,
      cooldownUserId: row.requestedById,
      cooldownUntil: new Date(now.getTime() + DECLINE_COOLDOWN_MS),
    },
    outcome: "DECLINED",
  };
}

/** `actorId` removes `otherId` as a buddy. */
export function decideRemove(
  row: BuddyRow | null,
  actorId: string,
  otherId: string,
  now: Date
): BuddyDecision {
  if (!row || row.status !== "ACCEPTED") {
    return { ok: false, error: "NOT_BUDDIES" };
  }
  return {
    ok: true,
    write: {
      kind: "set",
      status: "INACTIVE",
      requestedById: row.requestedById,
      newRequest: false,
      responded: true,
      cooldownUserId: otherId,
      cooldownUntil: new Date(now.getTime() + REMOVE_COOLDOWN_MS),
    },
    outcome: "REMOVED",
  };
}

/**
 * Blocking ends any relationship, and cooldowns make sure UNblocking later
 * can't be used to skip one:
 *   • If the blocker is on a cooldown (e.g. was declined), it is kept —
 *     block → unblock must not wipe it.
 *   • Otherwise the BLOCKED person gets a 7-day cooldown (never shortening a
 *     longer one they already have), so being unblocked doesn't let them
 *     re-request instantly.
 * A row is created if the pair never had one, to carry that cooldown.
 */
export function decideBlock(
  row: BuddyRow | null,
  blockerId: string,
  blockedId: string,
  now: Date
): BuddyWrite {
  if (row && onCooldown(row, blockerId, now)) {
    if (row.status === "INACTIVE") return { kind: "none" };
    return {
      kind: "set",
      status: "INACTIVE",
      requestedById: row.requestedById,
      newRequest: false,
      responded: true,
      cooldownUserId: row.cooldownUserId,
      cooldownUntil: row.cooldownUntil,
    };
  }

  const blockUntil = new Date(now.getTime() + BLOCK_COOLDOWN_MS);
  const existing =
    row?.cooldownUserId === blockedId && row.cooldownUntil && row.cooldownUntil > blockUntil
      ? row.cooldownUntil
      : blockUntil;

  return {
    kind: "set",
    status: "INACTIVE",
    requestedById: row?.requestedById ?? blockerId,
    newRequest: false,
    responded: row !== null && row.status !== "INACTIVE",
    cooldownUserId: blockedId,
    cooldownUntil: existing,
  };
}
