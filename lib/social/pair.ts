/**
 * User-pair ordering for buddyships and conversations
 * ════════════════════════════════════════════════════
 *
 * Both tables store a pair as (user_low_id, user_high_id) with a CHECK that
 * low < high in byte order (`COLLATE "C"`). Ordering every pair the same way
 * makes "A and B" and "B and A" the same row, so a unique index can stop
 * duplicate or crossed buddy requests.
 *
 * User ids are Supabase auth UUIDs — plain ASCII — so JavaScript's `<`
 * (UTF-16 code-unit order) matches Postgres' "C" collation exactly.
 */

export interface UserPair {
  low: string;
  high: string;
}

export function orderPair(a: string, b: string): UserPair {
  if (a === b) {
    throw new Error("A user pair needs two different users");
  }
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

/** The member of the pair that isn't `userId`. */
export function otherInPair(pair: UserPair, userId: string): string {
  if (pair.low === userId) return pair.high;
  if (pair.high === userId) return pair.low;
  throw new Error("User is not part of this pair");
}
