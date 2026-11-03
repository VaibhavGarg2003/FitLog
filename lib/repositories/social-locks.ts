/**
 * Advisory locks for buddy / block / chat mutations
 * ══════════════════════════════════════════════════
 *
 * Two transaction-scoped locks, ALWAYS taken in this order:
 *
 *   1. the ACTOR lock  ("fitlog:social:user:<actorId>")
 *   2. the PAIR lock   ("fitlog:social:pair:<low>:<high>")
 *
 * The pair lock serialises everything that happens between two people —
 * a send racing a block, a request racing an accept, two first messages
 * creating the conversation. With sends serialised per pair, message ids in
 * a conversation also COMMIT in id order, so a client's "give me everything
 * after id X" can never skip a row that commits late.
 *
 * The actor lock serialises one user's own actions across all their
 * conversations, so per-user quotas ("30 messages a minute") are counted
 * exactly instead of racing.
 *
 * One fixed order (actor, then pair) and at most one actor lock per
 * transaction means two transactions can never wait on each other in a
 * cycle. Advisory locks need a real row in nothing: they work when no
 * buddyship row exists yet. Released automatically at COMMIT/ROLLBACK.
 *
 * $executeRaw, not $queryRaw: pg_advisory_xact_lock returns `void`, which
 * Prisma cannot deserialize as a result column.
 */

import type { Prisma } from "@prisma/client";
import { orderPair, type UserPair } from "@/lib/social/pair";

export type Tx = Prisma.TransactionClient;

export async function lockActor(tx: Tx, userId: string): Promise<void> {
  const key = `fitlog:social:user:${userId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function lockPair(tx: Tx, pair: UserPair): Promise<void> {
  const key = `fitlog:social:pair:${pair.low}:${pair.high}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Actor lock, then pair lock. Returns the ordered pair. */
export async function lockActorAndPair(
  tx: Tx,
  actorId: string,
  otherId: string
): Promise<UserPair> {
  const pair = orderPair(actorId, otherId);
  await lockActor(tx, actorId);
  await lockPair(tx, pair);
  return pair;
}
