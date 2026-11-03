/**
 * Social Service — handles, buddy requests, blocks, reports
 * ══════════════════════════════════════════════════════════
 *
 * The buddy feature is OPT-IN: a user takes part only after choosing a
 * @handle (their social profile). Everyone they interact with must have one
 * too, so nobody can be found or contacted without having opted in.
 *
 * PRIVACY: "no such handle", "they blocked you" and "you blocked them" all
 * answer the same NotFoundError, so a block is never revealed and handles
 * can't be probed for relationship state.
 *
 * LIMITS (Postgres-counted under the actor lock, so they can't race and
 * don't depend on Redis being up):
 *   20 new buddy requests per day · 50 unanswered requests at once
 *   10 reports per day
 */

import { randomBytes } from "node:crypto";
import {
  countOutgoingPending,
  countRequestsSince,
  createReportWithinQuota,
  deleteBlock,
  findPublicUser,
  findPublicUserByHandle,
  findPublicUserByInviteCode,
  getBuddyRow,
  getSocialProfile,
  insertBlock,
  isBlockedEitherWay,
  isUniqueViolation,
  listBlocked,
  listBuddies,
  lockCurrentInvite,
  readBuddyRow,
  recordRequestEvent,
  readIsBlockedEitherWay,
  setInviteCode,
  setReadReceipts,
  upsertHandle,
  withPairTransaction,
  writeBuddyRow,
  type PublicBuddy,
} from "@/lib/repositories/social.repository";
import { findMessageVisibleTo } from "@/lib/repositories/chat.repository";
import {
  DAY_MS,
  decideBlock,
  decideRemove,
  decideRequest,
  decideRespond,
  type BuddyDecision,
  type BuddyOutcome,
  type BuddyRuleError,
} from "@/lib/social/buddy-rules";
import {
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from "@/lib/utils/errors";

export const BUDDY_REQUESTS_PER_DAY = 20;
export const MAX_OUTGOING_PENDING = 50;
export const REPORTS_PER_DAY = 10;

const USER_NOT_FOUND = "No buddy found with that name.";

/** 16 random bytes → 22 base64url characters (matches the DB CHECK). */
export function newInviteCode(): string {
  return randomBytes(16).toString("base64url");
}

// ─── Profile ─────────────────────────────────────────────────

export interface MySocialProfile {
  handle: string;
  inviteCode: string;
  readReceipts: boolean;
}

export async function getMySocialProfile(userId: string): Promise<MySocialProfile | null> {
  const profile = await getSocialProfile(userId);
  if (!profile) return null;
  return {
    handle: profile.handle,
    inviteCode: profile.inviteCode,
    readReceipts: profile.readReceipts,
  };
}

/** Throws unless the user has opted in (chosen a handle). */
export async function requireSocialProfile(userId: string): Promise<MySocialProfile> {
  const profile = await getMySocialProfile(userId);
  if (!profile) throw new ValidationError("Choose a buddy name first.");
  return profile;
}

export async function claimHandle(userId: string, handle: string): Promise<MySocialProfile> {
  try {
    const profile = await upsertHandle(userId, handle, newInviteCode());
    return {
      handle: profile.handle,
      inviteCode: profile.inviteCode,
      readReceipts: profile.readReceipts,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      // handle (or, astronomically unlikely, the new invite code) is taken
      throw new ConflictError(`@${handle} is already taken — try another.`);
    }
    throw error;
  }
}

export async function updateReadReceipts(userId: string, readReceipts: boolean) {
  const updated = await setReadReceipts(userId, readReceipts);
  if (!updated) throw new ValidationError("Choose a buddy name first.");
  return getMySocialProfile(userId);
}

/** New invite code: every old QR code / link stops working. */
export async function rotateInviteCode(userId: string) {
  await requireSocialProfile(userId);
  const updated = await setInviteCode(userId, newInviteCode());
  if (!updated) throw new ValidationError("Choose a buddy name first.");
  return getMySocialProfile(userId);
}

// ─── Lookup ──────────────────────────────────────────────────

export type Relationship = "NONE" | "BUDDIES" | "REQUESTED" | "INCOMING";

export interface LookupResult {
  user: PublicBuddy;
  relationship: Relationship;
}

async function resolveVisibleUser(
  viewerId: string,
  target: PublicBuddy | null
): Promise<PublicBuddy> {
  if (!target || !target.handle) throw new NotFoundError(USER_NOT_FOUND);
  if (target.userId === viewerId) return target;
  if (await readIsBlockedEitherWay(viewerId, target.userId)) {
    throw new NotFoundError(USER_NOT_FOUND);
  }
  return target;
}

async function relationshipWith(viewerId: string, otherId: string): Promise<Relationship> {
  const row = await readBuddyRow(viewerId, otherId);
  if (!row || row.status === "INACTIVE") return "NONE";
  if (row.status === "ACCEPTED") return "BUDDIES";
  return row.requestedById === viewerId ? "REQUESTED" : "INCOMING";
}

export async function lookupByHandle(viewerId: string, handle: string): Promise<LookupResult> {
  await requireSocialProfile(viewerId);
  const user = await resolveVisibleUser(viewerId, await findPublicUserByHandle(handle));
  if (user.userId === viewerId) {
    throw new ValidationError("That's your own buddy name.");
  }
  return { user, relationship: await relationshipWith(viewerId, user.userId) };
}

/** Who owns this invite code (for the "Add @x?" page). */
export async function lookupByInviteCode(viewerId: string, inviteCode: string): Promise<LookupResult> {
  const user = await resolveVisibleUser(viewerId, await findPublicUserByInviteCode(inviteCode));
  if (user.userId === viewerId) {
    return { user, relationship: "NONE" };
  }
  const profile = await getSocialProfile(viewerId);
  return {
    user,
    relationship: profile ? await relationshipWith(viewerId, user.userId) : "NONE",
  };
}

// ─── Buddy requests ──────────────────────────────────────────

function ruleError(error: BuddyRuleError): Error {
  switch (error) {
    case "ALREADY_BUDDIES":
      return new ConflictError("You're already buddies.");
    case "COOLDOWN":
      return new TooManyRequestsError("You can't send this person a request right now. Try again later.");
    case "NO_PENDING_REQUEST":
      return new NotFoundError("That request is no longer pending.");
    case "NOT_BUDDIES":
      return new NotFoundError("You're not buddies with this person.");
  }
}

function unwrap(decision: BuddyDecision) {
  if (!decision.ok) throw ruleError(decision.error);
  return decision;
}

export interface BuddyActionResult {
  outcome: BuddyOutcome;
  user: PublicBuddy;
}

export async function sendBuddyRequest(
  userId: string,
  input: { handle: string } | { inviteCode: string }
): Promise<BuddyActionResult> {
  await requireSocialProfile(userId);

  const viaInvite = "inviteCode" in input;
  const target = viaInvite
    ? await findPublicUserByInviteCode(input.inviteCode)
    : await findPublicUserByHandle(input.handle);
  if (!target || !target.handle) throw new NotFoundError(USER_NOT_FOUND);
  if (target.userId === userId) {
    throw new ValidationError(viaInvite ? "That's your own invite." : "That's your own buddy name.");
  }

  const outcome = await withPairTransaction(userId, target.userId, async (tx, pair) => {
    if (await isBlockedEitherWay(tx, userId, target.userId)) {
      throw new NotFoundError(USER_NOT_FOUND);
    }
    // The invite was resolved before the locks; re-check it is still the
    // owner's current code and hold their profile row so a rotation can't
    // slip in between this check and the commit.
    if (viaInvite && !(await lockCurrentInvite(tx, target.userId, input.inviteCode))) {
      throw new NotFoundError(USER_NOT_FOUND);
    }

    const now = new Date();
    const decision = unwrap(
      decideRequest(await getBuddyRow(tx, pair), userId, now, { viaInvite })
    );

    if (decision.write.kind === "set" && decision.write.newRequest) {
      const since = new Date(now.getTime() - DAY_MS);
      if ((await countRequestsSince(tx, userId, since)) >= BUDDY_REQUESTS_PER_DAY) {
        throw new TooManyRequestsError("You've sent a lot of buddy requests today. Try again tomorrow.");
      }
      if ((await countOutgoingPending(tx, userId)) >= MAX_OUTGOING_PENDING) {
        throw new TooManyRequestsError(
          "You have too many unanswered requests. Cancel some before sending more."
        );
      }
    }

    await writeBuddyRow(tx, pair, decision.write, now);
    if (decision.write.kind === "set" && decision.write.newRequest) {
      await recordRequestEvent(tx, userId);
    }
    return decision.outcome;
  });

  return { outcome, user: target };
}

export async function respondToBuddyRequest(
  userId: string,
  otherId: string,
  action: "accept" | "decline" | "cancel"
): Promise<BuddyActionResult> {
  if (otherId === userId) throw new NotFoundError("That request is no longer pending.");
  const other = await findPublicUser(otherId);
  if (!other) throw new NotFoundError("That request is no longer pending.");

  const outcome = await withPairTransaction(userId, otherId, async (tx, pair) => {
    const now = new Date();
    const decision = unwrap(decideRespond(await getBuddyRow(tx, pair), userId, action, now));
    if (action === "accept" && (await isBlockedEitherWay(tx, userId, otherId))) {
      throw new NotFoundError("That request is no longer pending.");
    }
    await writeBuddyRow(tx, pair, decision.write, now);
    return decision.outcome;
  });

  return { outcome, user: other };
}

export async function removeBuddy(userId: string, otherId: string): Promise<BuddyActionResult> {
  if (otherId === userId) throw new NotFoundError("You're not buddies with this person.");
  const other = await findPublicUser(otherId);
  if (!other) throw new NotFoundError("You're not buddies with this person.");

  const outcome = await withPairTransaction(userId, otherId, async (tx, pair) => {
    const now = new Date();
    const decision = unwrap(decideRemove(await getBuddyRow(tx, pair), userId, otherId, now));
    await writeBuddyRow(tx, pair, decision.write, now);
    return decision.outcome;
  });

  return { outcome, user: other };
}

// ─── Blocks ──────────────────────────────────────────────────

export async function blockUser(userId: string, otherId: string): Promise<PublicBuddy> {
  if (otherId === userId) throw new ValidationError("You can't block yourself.");
  const other = await findPublicUser(otherId);
  if (!other) throw new NotFoundError("User not found.");

  await withPairTransaction(userId, otherId, async (tx, pair) => {
    const now = new Date();
    await insertBlock(tx, userId, otherId);
    await writeBuddyRow(
      tx,
      pair,
      decideBlock(await getBuddyRow(tx, pair), userId, otherId, now),
      now
    );
  });
  return other;
}

export async function unblockUser(userId: string, otherId: string): Promise<void> {
  if (otherId === userId) throw new NotFoundError("That user isn't blocked.");
  const removed = await withPairTransaction(userId, otherId, (tx) =>
    deleteBlock(tx, userId, otherId)
  );
  if (!removed) throw new NotFoundError("That user isn't blocked.");
}

// ─── Lists ───────────────────────────────────────────────────

export async function getBuddyOverview(userId: string) {
  const [lists, blocked] = await Promise.all([listBuddies(userId), listBlocked(userId)]);
  return {
    buddies: lists.buddies.map((b) => ({ ...b, since: b.since?.toISOString() ?? null })),
    incoming: lists.incoming.map((b) => ({ ...b, requestedAt: b.requestedAt.toISOString() })),
    outgoing: lists.outgoing.map((b) => ({ ...b, requestedAt: b.requestedAt.toISOString() })),
    blocked,
  };
}

// ─── Reports ─────────────────────────────────────────────────

export async function reportUser(
  reporterId: string,
  input: {
    userId: string;
    messageId?: bigint;
    reason: "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER";
    details?: string;
  }
): Promise<{ id: string }> {
  if (input.userId === reporterId) throw new ValidationError("You can't report yourself.");

  const reported = await findPublicUser(input.userId);
  if (!reported) throw new NotFoundError("User not found.");

  // Evidence: only a message the reporter could actually see, sent by the
  // person being reported. Copied now, so it survives deletion.
  let evidence: string | null = null;
  if (input.messageId !== undefined) {
    const message = await findMessageVisibleTo(input.messageId, reporterId);
    if (!message || message.senderId !== input.userId) {
      throw new NotFoundError("Message not found.");
    }
    evidence = message.body;
  }

  const report = await createReportWithinQuota(
    {
      reporterId,
      reportedUserId: input.userId,
      messageId: input.messageId ?? null,
      reason: input.reason,
      details: input.details?.length ? input.details : null,
      evidence,
    },
    { limit: REPORTS_PER_DAY, since: new Date(Date.now() - DAY_MS) }
  );
  if (!report) {
    throw new TooManyRequestsError("You've sent several reports today. Try again tomorrow.");
  }
  return report;
}
