/**
 * Social Repository — handles, buddies, blocks, reports
 * ══════════════════════════════════════════════════════
 *
 * TABLES: social_profiles, buddyships, user_blocks, user_reports.
 *
 * Every relationship mutation runs inside withPairTransaction(): one
 * transaction that first takes the actor lock and then the pair lock (see
 * social-locks.ts), so the read-decide-write sequence for a pair of users can
 * never interleave with another mutation for the same pair.
 *
 * The business rules (what a request/accept/decline does) live in
 * lib/social/buddy-rules.ts; this file only reads and writes rows.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/supabase/prisma";
import { lockActor, lockActorAndPair, type Tx } from "@/lib/repositories/social-locks";
import type { BuddyRow, BuddyWrite } from "@/lib/social/buddy-rules";
import { orderPair, type UserPair } from "@/lib/social/pair";

/** What one user may see about another (a buddy, a search hit). */
export interface PublicBuddy {
  userId: string;
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
}

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  socialProfile: { select: { handle: true } },
} as const;

type PublicUserRow = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  socialProfile: { handle: string } | null;
};

function toPublicBuddy(u: PublicUserRow): PublicBuddy {
  return {
    userId: u.id,
    handle: u.socialProfile?.handle ?? null,
    name: u.name,
    avatarUrl: u.avatarUrl,
  };
}

// ─── Social profiles ─────────────────────────────────────────

export async function getSocialProfile(userId: string) {
  return prisma.socialProfile.findUnique({ where: { userId } });
}

export async function findPublicUserByHandle(
  handle: string
): Promise<PublicBuddy | null> {
  const profile = await prisma.socialProfile.findUnique({
    where: { handle },
    select: { user: { select: PUBLIC_USER_SELECT } },
  });
  return profile ? toPublicBuddy(profile.user) : null;
}

export async function findPublicUserByInviteCode(
  inviteCode: string
): Promise<PublicBuddy | null> {
  const profile = await prisma.socialProfile.findUnique({
    where: { inviteCode },
    select: { user: { select: PUBLIC_USER_SELECT } },
  });
  return profile ? toPublicBuddy(profile.user) : null;
}

export async function findPublicUser(userId: string): Promise<PublicBuddy | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUBLIC_USER_SELECT,
  });
  return user ? toPublicBuddy(user) : null;
}

/**
 * Create the profile, or change the handle of an existing one. A taken
 * handle surfaces as Prisma P2002 for the caller to map to a conflict.
 */
export async function upsertHandle(
  userId: string,
  handle: string,
  newInviteCode: string
) {
  return prisma.socialProfile.upsert({
    where: { userId },
    create: { userId, handle, inviteCode: newInviteCode },
    update: { handle },
  });
}

export async function setReadReceipts(userId: string, readReceipts: boolean) {
  const result = await prisma.socialProfile.updateMany({
    where: { userId },
    data: { readReceipts },
  });
  return result.count > 0;
}

export async function setInviteCode(userId: string, inviteCode: string) {
  const result = await prisma.socialProfile.updateMany({
    where: { userId },
    data: { inviteCode },
  });
  return result.count > 0;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// ─── Locked relationship transactions ────────────────────────

/**
 * Run `fn` in one transaction holding the actor lock and then the pair lock
 * for (actorId, otherId).
 */
export async function withPairTransaction<T>(
  actorId: string,
  otherId: string,
  fn: (tx: Tx, pair: UserPair) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const pair = await lockActorAndPair(tx, actorId, otherId);
    return fn(tx, pair);
  });
}

export async function getBuddyRow(tx: Tx, pair: UserPair): Promise<BuddyRow | null> {
  return tx.buddyship.findUnique({
    where: { userLowId_userHighId: { userLowId: pair.low, userHighId: pair.high } },
    select: {
      status: true,
      requestedById: true,
      cooldownUserId: true,
      cooldownUntil: true,
    },
  });
}

export async function writeBuddyRow(
  tx: Tx,
  pair: UserPair,
  write: BuddyWrite,
  now: Date
): Promise<void> {
  if (write.kind === "none") return;

  const data = {
    status: write.status,
    requestedById: write.requestedById,
    cooldownUserId: write.cooldownUserId,
    cooldownUntil: write.cooldownUntil,
    ...(write.newRequest ? { requestedAt: now, respondedAt: null } : {}),
    ...(write.responded ? { respondedAt: now } : {}),
  };

  await tx.buddyship.upsert({
    where: { userLowId_userHighId: { userLowId: pair.low, userHighId: pair.high } },
    create: { userLowId: pair.low, userHighId: pair.high, ...data },
    update: data,
  });
}

/** True if either user has blocked the other. */
export async function isBlockedEitherWay(tx: Tx, a: string, b: string): Promise<boolean> {
  const block = await tx.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  });
  return block !== null;
}

/** Unlocked read of the pair's row — for display only, never to decide a write. */
export async function readBuddyRow(a: string, b: string): Promise<BuddyRow | null> {
  return getBuddyRow(prisma, orderPair(a, b));
}

/** Unlocked block check — for display / lookups only. */
export async function readIsBlockedEitherWay(a: string, b: string): Promise<boolean> {
  return isBlockedEitherWay(prisma, a, b);
}

/**
 * Buddy requests this user actually SENT since `since` — every send, even to
 * the same person again (an append-only ledger, not the per-pair row).
 * Count and record under the actor lock so concurrent requests can't race.
 */
export async function countRequestsSince(tx: Tx, userId: string, since: Date) {
  return tx.buddyRequestEvent.count({
    where: { requesterId: userId, createdAt: { gte: since } },
  });
}

export async function recordRequestEvent(tx: Tx, requesterId: string) {
  await tx.buddyRequestEvent.create({ data: { requesterId } });
}

/**
 * Check `inviteCode` is STILL the owner's current code, and hold a share lock
 * on their profile row until commit. Rotating the code (an UPDATE of that
 * row) then waits for this transaction — or, if it committed first, this
 * check fails — so a rotated-away invite can never connect anyone.
 */
export async function lockCurrentInvite(
  tx: Tx,
  ownerId: string,
  inviteCode: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ user_id: string }[]>`
    SELECT user_id FROM social_profiles
    WHERE user_id = ${ownerId} AND invite_code = ${inviteCode}
    FOR SHARE
  `;
  return rows.length > 0;
}

/** This user's requests still waiting for an answer. */
export async function countOutgoingPending(tx: Tx, userId: string) {
  return tx.buddyship.count({
    where: { requestedById: userId, status: "PENDING" },
  });
}

export async function insertBlock(tx: Tx, blockerId: string, blockedId: string) {
  await tx.userBlock.createMany({
    data: [{ blockerId, blockedId }],
    skipDuplicates: true,
  });
}

export async function deleteBlock(tx: Tx, blockerId: string, blockedId: string) {
  const result = await tx.userBlock.deleteMany({ where: { blockerId, blockedId } });
  return result.count > 0;
}

// ─── Lists ───────────────────────────────────────────────────

export interface BuddyLists {
  buddies: (PublicBuddy & { since: Date | null })[];
  incoming: (PublicBuddy & { requestedAt: Date })[];
  outgoing: (PublicBuddy & { requestedAt: Date })[];
}

export async function listBuddies(userId: string): Promise<BuddyLists> {
  const rows = await prisma.buddyship.findMany({
    where: {
      status: { in: ["PENDING", "ACCEPTED"] },
      OR: [{ userLowId: userId }, { userHighId: userId }],
    },
    select: {
      userLowId: true,
      status: true,
      requestedById: true,
      requestedAt: true,
      respondedAt: true,
      userLow: { select: PUBLIC_USER_SELECT },
      userHigh: { select: PUBLIC_USER_SELECT },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const lists: BuddyLists = { buddies: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const other = toPublicBuddy(row.userLowId === userId ? row.userHigh : row.userLow);
    if (row.status === "ACCEPTED") {
      lists.buddies.push({ ...other, since: row.respondedAt });
    } else if (row.requestedById === userId) {
      lists.outgoing.push({ ...other, requestedAt: row.requestedAt });
    } else {
      lists.incoming.push({ ...other, requestedAt: row.requestedAt });
    }
  }
  lists.buddies.sort((a, b) =>
    (a.handle ?? a.name ?? "").localeCompare(b.handle ?? b.name ?? "")
  );
  return lists;
}

export async function listBlocked(userId: string): Promise<PublicBuddy[]> {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    select: { blocked: { select: PUBLIC_USER_SELECT } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map((r) => toPublicBuddy(r.blocked));
}

// ─── Reports ─────────────────────────────────────────────────

/**
 * Insert a report unless the reporter already filed `limit` since `since`.
 * Count and insert happen in ONE transaction holding the reporter's actor
 * lock, so concurrent reports can't all pass the check. Returns null when
 * the quota is used up.
 */
export async function createReportWithinQuota(
  data: {
    reporterId: string;
    reportedUserId: string;
    messageId: bigint | null;
    reason: "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER";
    details: string | null;
    evidence: string | null;
  },
  quota: { limit: number; since: Date }
): Promise<{ id: string } | null> {
  return prisma.$transaction(async (tx) => {
    await lockActor(tx, data.reporterId);
    const recent = await tx.userReport.count({
      where: { reporterId: data.reporterId, createdAt: { gte: quota.since } },
    });
    if (recent >= quota.limit) return null;
    return tx.userReport.create({ data, select: { id: true } });
  });
}

/** Retention: request-ledger rows older than `cutoff` (the quota looks back one day). */
export async function deleteRequestEventsBefore(cutoff: Date) {
  const result = await prisma.buddyRequestEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/** Retention: reports (and their evidence snapshots) older than `cutoff`. */
export async function deleteReportsBefore(cutoff: Date) {
  const result = await prisma.userReport.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
