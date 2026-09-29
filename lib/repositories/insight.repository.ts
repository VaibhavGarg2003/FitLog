/**
 * Insight Repository — period reports (weekly / monthly / quarterly / yearly)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TABLE: period_insights — one row per user per report period.
 *
 * THE GENERATION LEASE (why two taps never pay for two AI calls):
 * ──────────────────────────────────────────────────────────────
 * acquireLease() is ONE atomic INSERT … ON CONFLICT DO UPDATE … WHERE:
 *   - no row yet → insert it as GENERATING with our random lease token;
 *   - a row exists → take it over ONLY if nobody holds a live lease
 *     (status ≠ GENERATING, or the lease expired — a crashed request frees
 *     itself) AND fewer than `maxAttempts` generations were started.
 * Postgres serialises the conflicting writes, so exactly one caller gets a
 * token back. Everyone else gets null and reads the row to learn why.
 *
 * No transaction is held while the AI writes: the lease is committed, the AI
 * runs, then completeLease() writes the result ONLY where our token still
 * holds — a request whose lease expired and was taken over can't overwrite
 * its successor. abandonLease() gives the row back after a failure.
 *
 * Regenerating keeps the previous text in `content` until the new one lands,
 * so the report stays readable while "refreshing".
 */

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/supabase/prisma";
import type { PeriodType } from "@/lib/insights/periods";
import { calendarDayToDbDate } from "@/lib/utils/local-date";
import { LEASE_SECONDS } from "@/lib/insights/report-budget";

// How long a generation lease lives — longer than the route can run
// (see lib/insights/report-budget.ts).
export { LEASE_SECONDS };

export interface ReportKey {
  userId: string;
  type: PeriodType;
  /** Calendar start of the period ("YYYY-MM-DD"). */
  periodStart: string;
}

export async function findReport(key: ReportKey) {
  return prisma.periodInsight.findUnique({
    where: {
      userId_periodType_periodStart: {
        userId: key.userId,
        periodType: key.type,
        periodStart: calendarDayToDbDate(key.periodStart),
      },
    },
  });
}

/**
 * Reports that have text to show, newest first (the archive). 200 is about
 * three years of weekly + monthly (+ quarterly/yearly) reports; beyond that
 * this needs paging. The
 * facts snapshot is left out — the archive shows the text, not the tiles.
 */
export async function listReports(userId: string, limit = 200) {
  return prisma.periodInsight.findMany({
    where: { userId, content: { not: null } },
    omit: { facts: true },
    orderBy: [{ periodStart: "desc" }, { periodType: "asc" }],
    take: limit,
  });
}

/**
 * Take the generation lease. Returns the token and the attempt number, or
 * null when someone else holds a live lease or attempts are used up.
 */
export async function acquireLease(
  key: ReportKey & { coveredStart: string; periodEnd: string; partial: boolean },
  maxAttempts: number
): Promise<{ token: string; attempts: number } | null> {
  const token = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO period_insights (
      id, user_id, period_type, period_start, covered_start, period_end, partial,
      status, lease_token, lease_expires_at, attempts, created_at, updated_at
    ) VALUES (
      ${randomUUID()}, ${key.userId}, ${key.type}::"PeriodType",
      ${key.periodStart}::date, ${key.coveredStart}::date, ${key.periodEnd}::date, ${key.partial},
      'GENERATING', ${token}, now() + make_interval(secs => ${LEASE_SECONDS}), 1, now(), now()
    )
    ON CONFLICT (user_id, period_type, period_start) DO UPDATE SET
      status           = 'GENERATING',
      lease_token      = EXCLUDED.lease_token,
      lease_expires_at = EXCLUDED.lease_expires_at,
      attempts         = period_insights.attempts + 1,
      covered_start    = EXCLUDED.covered_start,
      period_end       = EXCLUDED.period_end,
      partial          = EXCLUDED.partial,
      updated_at       = now()
    WHERE (period_insights.status <> 'GENERATING' OR period_insights.lease_expires_at < now())
      AND period_insights.attempts < ${maxAttempts}
    RETURNING attempts
  `;
  return rows.length ? { token, attempts: rows[0].attempts } : null;
}

/** Store the finished report — only if our lease still holds. */
export async function completeLease(
  key: ReportKey,
  token: string,
  data: {
    content: string;
    highlights: string[];
    suggestion: string;
    facts: Prisma.InputJsonValue;
    factsHash: string;
    provider: string;
    statsVersion: number;
    promptVersion: number;
  }
): Promise<boolean> {
  const res = await prisma.periodInsight.updateMany({
    where: {
      userId: key.userId,
      periodType: key.type,
      periodStart: calendarDayToDbDate(key.periodStart),
      leaseToken: token,
    },
    data: {
      ...data,
      status: "READY",
      legacy: false,
      leaseToken: null,
      leaseExpiresAt: null,
      generatedAt: new Date(),
    },
  });
  return res.count > 0;
}

/**
 * Give the row back after a failure: READY again if it still has a previous
 * version's text, otherwise FAILED. `refundAttempt` returns the attempt when
 * the failure was ours or a provider's, not the user's.
 */
export async function abandonLease(
  key: ReportKey,
  token: string,
  refundAttempt: boolean
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE period_insights SET
      status = CASE WHEN content IS NULL THEN 'FAILED'::"InsightStatus" ELSE 'READY'::"InsightStatus" END,
      lease_token = NULL,
      lease_expires_at = NULL,
      attempts = GREATEST(0, attempts - ${refundAttempt ? 1 : 0}),
      updated_at = now()
    WHERE user_id = ${key.userId}
      AND period_type = ${key.type}::"PeriodType"
      AND period_start = ${key.periodStart}::date
      AND lease_token = ${token}
  `;
}
