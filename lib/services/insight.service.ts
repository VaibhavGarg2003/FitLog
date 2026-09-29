/**
 * Insight Service — AI coach reports for finished weeks, months, quarters, years
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT A USER GETS
 * ────────────────
 * - Plan WEEKLY_AND_MONTHLY (default): a weekly report + a monthly review.
 * - Plan MONTHLY_ONLY: the monthly review.
 * - Everyone: quarterly and yearly reviews once a finished quarter/year has
 *   enough data, and a free (no-AI) "first week" card while no full week has
 *   finished yet.
 *
 * THE RULES
 * ─────────
 * - Finished periods only, derived on the SERVER from the user's saved time
 *   zone — a client never chooses the period (lib/insights/periods.ts).
 * - Enough logged evidence, or no AI call ("log a few more days").
 * - Numbers come from code (facts); the AI writes prose only.
 * - A report whose period's data changed since it was written is "outdated"
 *   (facts fingerprint) and can be regenerated.
 * - At most 2 generations per period (database lease + attempts), plus a
 *   16-per-30-days backstop (Upstash). A saved, up-to-date report is returned
 *   free — no attempt, no limit.
 *
 * GENERATE FLOW
 * ─────────────
 *   period → facts → saved & fresh? return it
 *     → take the lease (one atomic write) → backstop → AI → validate
 *     → save (only while our lease holds) → return
 * Failures give the lease back. A provider outage or unreadable reply
 * refunds the attempt — but only when the backstop metered the call, so AI
 * calls stay capped even while Redis is down (the limiter fails open).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { runWithFallback } from "@/lib/ai/fallback";
import {
  PERIOD_REPORT_PROMPT_VERSION,
  PERIOD_REPORT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import { checkReportLimit } from "@/lib/middleware/rate-limit";
import {
  abandonLease,
  acquireLease,
  completeLease,
  findReport,
  listReports,
  type ReportKey,
} from "@/lib/repositories/insight.repository";
import {
  buildFacts,
  factsFingerprintSource,
  sliceRows,
  type PeriodFacts,
} from "@/lib/insights/facts";
import { addDays } from "@/lib/insights/fill-days";
import {
  hasEnoughEvidence,
  lastReportablePeriod,
  MIN_EVIDENCE,
  periodBounds,
  periodLabel,
  reportablePeriod,
  type Period,
  type PeriodType,
} from "@/lib/insights/periods";
import { loadInsightUser, loadPeriodRows, type InsightUser } from "@/lib/services/insight-data.service";
import { UpstreamError, ValidationError } from "@/lib/utils/errors";
import { dbDateToCalendarDay, localDateStrInZone } from "@/lib/utils/local-date";
import { REPORT_AI_TIMEOUTS_MS } from "@/lib/insights/report-budget";

export const MAX_ATTEMPTS = 2;
// A report is a longer answer than a meal parse, so it gets its own AI budget
// — see lib/insights/report-budget.ts for how it fits the route and lease.
export { REPORT_AI_TIMEOUTS_MS };
/** Bump when the facts maths changes → existing reports read as outdated. */
export const STATS_VERSION = 1;

// ─────────────────────────────────────────────────────────────
// Shapes returned to the client
// ─────────────────────────────────────────────────────────────

type ReportRow = NonNullable<Awaited<ReturnType<typeof findReport>>>;

export interface ReportView {
  type: PeriodType;
  label: string;
  periodStart: string;
  coveredStart: string;
  periodEnd: string;
  partial: boolean;
  content: string;
  highlights: string[];
  suggestion: string | null;
  provider: string | null;
  generatedAt: string | null;
  legacy: boolean;
  facts: PeriodFacts | null;
}

export type CardState =
  | "READY" // a report exists (maybe outdated — see `stale`)
  | "GENERATING" // someone is generating it right now
  | "AVAILABLE" // eligible, not generated yet
  | "FAILED" // the last try failed and nothing was saved
  | "NOT_ENOUGH_DATA" // finished, but too little was logged
  | "NOT_YET"; // no finished, reportable period yet

export interface ReportCard {
  type: PeriodType;
  state: CardState;
  label: string | null;
  period: Pick<Period, "start" | "end" | "periodStart" | "partial" | "days"> | null;
  report: ReportView | null;
  /** Current numbers for the period (the UI's number tiles). */
  facts: PeriodFacts | null;
  stale: boolean;
  attemptsLeft: number;
  canGenerate: boolean;
  message: string | null;
}

export interface InsightsOverview {
  plan: InsightUser["insightPlan"];
  today: string;
  cards: ReportCard[];
  firstWeek: { from: string; to: string; facts: PeriodFacts } | null;
  archive: ReportView[];
}

export type GenerateResult =
  | { status: "READY"; report: ReportView }
  | { status: "GENERATING" }
  | { status: "LIMIT"; report: ReportView | null }
  | { status: "RATE_LIMITED"; resetAt: string | null };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function factsHash(facts: PeriodFacts): string {
  return createHash("sha256").update(factsFingerprintSource(facts)).digest("hex");
}

function toView(row: ReportRow, timeZone: string | null = null): ReportView | null {
  if (!row.content) return null;
  const covered = dbDateToCalendarDay(row.coveredStart);
  const end = dbDateToCalendarDay(row.periodEnd);
  let label = periodLabel({ type: row.periodType, start: covered, end, partial: row.partial });
  // Old weekly insights covered "the week so far" when written — label them
  // up to the day they were written, never as a full week they didn't see.
  if (row.legacy && row.generatedAt) {
    // The day it was written on the user's calendar, not UTC's.
    const written = timeZone
      ? localDateStrInZone(timeZone, row.generatedAt)
      : dbDateToCalendarDay(row.generatedAt);
    if (written < end) {
      const shownEnd = written < covered ? covered : written;
      label = `${periodLabel({ type: row.periodType, start: covered, end: shownEnd, partial: true })} (week so far)`;
    }
  }
  return {
    type: row.periodType,
    label,
    periodStart: dbDateToCalendarDay(row.periodStart),
    coveredStart: covered,
    periodEnd: end,
    partial: row.partial,
    content: row.content,
    highlights: Array.isArray(row.highlights) ? (row.highlights as string[]) : [],
    suggestion: row.suggestion,
    provider: row.provider,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    legacy: row.legacy,
    facts: (row.facts as unknown as PeriodFacts | null) ?? null,
  };
}

/** True while another request holds a live generation lease. */
function leaseLive(row: ReportRow | null): boolean {
  return (
    !!row &&
    row.status === "GENERATING" &&
    !!row.leaseExpiresAt &&
    row.leaseExpiresAt.getTime() > Date.now()
  );
}

/** A saved report no longer matches its period's current data (or maths). */
function isStale(row: ReportRow, facts: PeriodFacts): boolean {
  if (row.legacy) return false; // old weekly insights were never fingerprinted
  return row.factsHash !== factsHash(facts) || row.statsVersion < STATS_VERSION;
}

/** First day a report of this type becomes available for this account. */
function availableFrom(type: PeriodType, today: string, accountStart: string): string {
  let bounds = periodBounds(type, today);
  for (let i = 0; i < 4; i++) {
    if (reportablePeriod(type, bounds, accountStart)) return addDays(bounds.end, 1);
    bounds = periodBounds(type, addDays(bounds.end, 1));
  }
  return addDays(bounds.end, 1);
}

const TYPE_NAME: Record<PeriodType, string> = {
  WEEK: "weekly report",
  MONTH: "monthly review",
  QUARTER: "quarterly review",
  YEAR: "year in review",
};

function notEnoughMessage(type: PeriodType, label: string, facts: PeriodFacts): string {
  const min = MIN_EVIDENCE[type];
  return (
    `Not enough logged in ${label} for a ${TYPE_NAME[type]}: it needs ${min.foodDays} days with food ` +
    `or ${min.workoutDays} workout days (you have ${facts.coverage.foodDays} and ${facts.coverage.workoutDays}).`
  );
}

function typesFor(plan: InsightUser["insightPlan"]): PeriodType[] {
  return plan === "MONTHLY_ONLY" ? ["MONTH", "QUARTER", "YEAR"] : ["WEEK", "MONTH", "QUARTER", "YEAR"];
}

// ─────────────────────────────────────────────────────────────
// Overview (GET) — never calls the AI
// ─────────────────────────────────────────────────────────────

export async function getInsightsOverview(userId: string): Promise<InsightsOverview> {
  const user = await loadInsightUser(userId);
  const types = typesFor(user.insightPlan);
  const periods = new Map(
    types.map((t) => [t, lastReportablePeriod(t, user.today, user.accountStart)] as const)
  );

  // No full week has finished since signup → the free first-week card.
  const firstWeekOpen = lastReportablePeriod("WEEK", user.today, user.accountStart) === null;

  // ONE load covering every period shown (plus the first week), then slice.
  const ranges = [...periods.values()].filter((p): p is Period => p !== null);
  const from = [...ranges.map((p) => p.start), ...(firstWeekOpen ? [user.accountStart] : [])].sort()[0];
  const to = [...ranges.map((p) => p.end), ...(firstWeekOpen ? [user.today] : [])].sort().at(-1);
  const [rows, rowsByType, archiveRows] = await Promise.all([
    from && to ? loadPeriodRows(userId, from, to) : Promise.resolve(null),
    Promise.all(
      types.map(async (t) => {
        const p = periods.get(t);
        return [t, p ? await findReport({ userId, type: t, periodStart: p.periodStart }) : null] as const;
      })
    ),
    listReports(userId),
  ]);
  const saved = new Map(rowsByType);

  const cards: ReportCard[] = [];
  for (const type of types) {
    const p = periods.get(type) ?? null;
    if (!p) {
      // Quarter/year cards only appear once they exist; week/month explain when.
      if (type === "WEEK" || type === "MONTH") {
        cards.push({
          type, state: "NOT_YET", label: null, period: null, report: null, facts: null,
          stale: false, attemptsLeft: MAX_ATTEMPTS, canGenerate: false,
          message: `Your first ${TYPE_NAME[type]} will be ready on ${availableFrom(type, user.today, user.accountStart)}.`,
        });
      }
      continue;
    }
    const label = periodLabel(p);
    const facts = buildFacts(p, sliceRows(rows!, p.start, p.end), user.ctx);
    const enough = hasEnoughEvidence(type, facts.coverage);
    const row = saved.get(type) ?? null;
    if (!row && !enough && (type === "QUARTER" || type === "YEAR")) continue;

    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - (row?.attempts ?? 0));
    const view = row ? toView(row, user.timeZone) : null;
    const stale = !!(row && view && isStale(row, facts));
    let state: CardState;
    if (leaseLive(row)) state = "GENERATING";
    else if (view) state = "READY";
    else if (row?.status === "FAILED") state = enough ? "FAILED" : "NOT_ENOUGH_DATA";
    else state = enough ? "AVAILABLE" : "NOT_ENOUGH_DATA";

    const canGenerate =
      enough && attemptsLeft > 0 && (state === "AVAILABLE" || state === "FAILED" || (state === "READY" && (stale || !!view?.legacy)));

    cards.push({
      type,
      state,
      label,
      period: { start: p.start, end: p.end, periodStart: p.periodStart, partial: p.partial, days: p.days },
      report: view,
      facts,
      stale,
      attemptsLeft,
      canGenerate,
      message:
        state === "NOT_ENOUGH_DATA"
          ? notEnoughMessage(type, label, facts)
          : state === "READY" && stale && attemptsLeft === 0
            ? "Your data for this period changed after this was written. It has already been regenerated twice, so it stays as it is."
            : null,
    });
  }

  const firstWeek =
    firstWeekOpen && rows
      ? {
          from: user.accountStart,
          to: user.today,
          facts: buildFacts(
            { type: "RANGE", start: user.accountStart, end: user.today, partial: true },
            sliceRows(rows, user.accountStart, user.today),
            user.ctx
          ),
        }
      : null;

  return {
    plan: user.insightPlan,
    today: user.today,
    cards,
    firstWeek,
    archive: archiveRows
      .map((r) => toView({ ...r, facts: null }, user.timeZone))
      .filter((v): v is ReportView => v !== null),
  };
}

// ─────────────────────────────────────────────────────────────
// Generate (POST) — the only path that calls the AI
// ─────────────────────────────────────────────────────────────

/** The model's reply is untrusted input: shape and size are checked. */
const reportOutputSchema = z.object({
  insight: z.string().trim().min(1).max(4000),
  // Extra or over-long highlights are trimmed, not a reason to drop them all.
  highlights: z
    .array(z.string())
    .catch([])
    .transform((list) =>
      list.map((h) => h.trim().slice(0, 300)).filter(Boolean).slice(0, 3)
    ),
  suggestion: z.string().trim().max(600).catch(""),
});

function buildUserMessage(type: PeriodType, label: string, facts: PeriodFacts): string {
  return [
    `Report type: ${type} — ${label}${facts.period.partial ? " (their first, partial period)" : ""}`,
    "",
    "FACTS (the only numbers you may use):",
    JSON.stringify(facts),
    "",
    "Write the review.",
  ].join("\n");
}

function parseModelJson(text: string): unknown {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

export async function generateReport(
  userId: string,
  type: PeriodType,
  options: { regenerate?: boolean } = {}
): Promise<GenerateResult> {
  const user = await loadInsightUser(userId);
  if (!typesFor(user.insightPlan).includes(type)) {
    throw new ValidationError("Weekly reports are turned off. Switch them on in Settings → Coach check-ins.");
  }

  // Periods come from the SAVED time zone. Without one "today" would be the
  // server's (UTC) day and a report could be filed under the wrong week; the
  // app saves the device zone on load, so this only waits a moment.
  if (!user.timeZone) {
    throw new ValidationError("Your time zone is still being set up. Please try again in a moment.");
  }

  const period = lastReportablePeriod(type, user.today, user.accountStart);
  if (!period) {
    throw new ValidationError(
      `Your first ${TYPE_NAME[type]} will be ready on ${availableFrom(type, user.today, user.accountStart)}.`
    );
  }
  const label = periodLabel(period);

  // Facts for the period, plus the full period before it for comparison.
  const prev = periodBounds(type, addDays(period.periodStart, -1));
  const rows = await loadPeriodRows(userId, prev.start, period.end);
  const facts = buildFacts(
    period,
    sliceRows(rows, period.start, period.end),
    user.ctx,
    sliceRows(rows, prev.start, prev.end)
  );
  if (!hasEnoughEvidence(type, facts.coverage)) {
    throw new ValidationError(notEnoughMessage(type, label, facts));
  }

  const key: ReportKey = { userId, type, periodStart: period.periodStart };
  const existing = await findReport(key);
  if (leaseLive(existing)) return { status: "GENERATING" };
  const existingView = existing ? toView(existing, user.timeZone) : null;
  if (existing && existingView && !isStale(existing, facts) && !existing.legacy && !options.regenerate) {
    return { status: "READY", report: existingView }; // free: no attempt, no limit
  }

  const lease = await acquireLease(
    { ...key, coveredStart: period.start, periodEnd: period.end, partial: period.partial },
    MAX_ATTEMPTS
  );
  if (!lease) {
    const now = await findReport(key);
    if (leaseLive(now)) return { status: "GENERATING" };
    return { status: "LIMIT", report: now ? toView(now, user.timeZone) : null };
  }

  try {
    const limit = await checkReportLimit(userId);
    if (limit.limited) {
      await abandonLease(key, lease.token, true);
      return { status: "RATE_LIMITED", resetAt: limit.resetAt?.toISOString() ?? null };
    }

    // A failed try is refunded only if the backstop counted it; with the
    // limiter off or unreachable (it fails open) the attempt stays spent, so
    // AI calls per period remain capped at MAX_ATTEMPTS even then.
    const refund = limit.metered === true;

    const ai = await runWithFallback({
      systemPrompt: PERIOD_REPORT_SYSTEM_PROMPT,
      userMessage: buildUserMessage(type, label, facts),
      timeoutsMs: REPORT_AI_TIMEOUTS_MS,
    });
    if (!ai.ok) {
      await abandonLease(key, lease.token, refund); // provider outage isn't the user's fault
      throw new UpstreamError("The AI coach couldn't be reached. Please try again in a moment.");
    }

    let parsed: z.infer<typeof reportOutputSchema>;
    try {
      parsed = reportOutputSchema.parse(parseModelJson(ai.text));
    } catch {
      await abandonLease(key, lease.token, refund);
      throw new UpstreamError("The AI coach returned an unreadable report. Please try again.");
    }

    const saved = await completeLease(key, lease.token, {
      content: parsed.insight,
      highlights: parsed.highlights,
      suggestion: parsed.suggestion,
      facts: facts as unknown as object,
      factsHash: factsHash(facts),
      provider: ai.provider,
      statsVersion: STATS_VERSION,
      promptVersion: PERIOD_REPORT_PROMPT_VERSION,
    });
    const row = await findReport(key);
    if (!saved) return leaseLive(row) ? { status: "GENERATING" } : { status: "LIMIT", report: row ? toView(row, user.timeZone) : null };
    return { status: "READY", report: toView(row!, user.timeZone)! };
  } catch (error) {
    // Anything unexpected: free the lease now rather than after it expires.
    // No refund — the AI may already have been called.
    if (!(error instanceof UpstreamError)) {
      await abandonLease(key, lease.token, false).catch(() => {});
    }
    throw error;
  }
}
