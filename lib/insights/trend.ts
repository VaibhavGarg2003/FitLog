/**
 * Weight trend — what the scale is really doing under the daily noise
 * ═══════════════════════════════════════════════════════════════════
 *
 * Daily weight jumps ±1 kg with water, salt and digestion. Two tools:
 *
 * 1. SMOOTHED LINE (ewma): each point pulls the line a little, more the longer
 *    since the previous weigh-in (half-life 7 days, gap-aware). It is what the
 *    chart draws. Never stored: editing an old weigh-in would make every later
 *    stored value wrong (Codex review, PR #8) — it is cheap to recompute.
 *
 * 2. RATE (least-squares slope): kg per week across the period — the number
 *    the reports quote. Needs ≥3 weigh-ins spanning ≥7 days; otherwise "not
 *    enough data" (null) rather than a confident-looking guess.
 *
 * Gaps: a line is never drawn across ≥14 days without a weigh-in (segments).
 */

import { daysBetween } from "@/lib/insights/fill-days";

export interface WeightPoint {
  date: string; // "YYYY-MM-DD", ascending
  weightKg: number;
}

export const GAP_DAYS = 14;
const HALF_LIFE_DAYS = 7;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Split into runs with no gap of GAP_DAYS or more between weigh-ins. */
export function splitByGaps(points: WeightPoint[]): WeightPoint[][] {
  const segments: WeightPoint[][] = [];
  for (const p of points) {
    const seg = segments[segments.length - 1];
    const prev = seg?.[seg.length - 1];
    if (!prev || daysBetween(prev.date, p.date) >= GAP_DAYS) segments.push([p]);
    else seg.push(p);
  }
  return segments;
}

/** Smoothed trend per weigh-in, restarting after each gap. */
export function smoothedTrend(points: WeightPoint[]): Array<WeightPoint & { trendKg: number }> {
  const out: Array<WeightPoint & { trendKg: number }> = [];
  for (const segment of splitByGaps(points)) {
    // Each segment starts fresh at its first weigh-in.
    let trend = segment[0].weightKg;
    out.push({ ...segment[0], trendKg: round(trend, 2) });
    for (let i = 1; i < segment.length; i++) {
      const p = segment[i];
      // The longer since the last weigh-in, the more one reading moves the line.
      const gap = Math.max(1, daysBetween(segment[i - 1].date, p.date));
      const alpha = 1 - 0.5 ** (gap / HALF_LIFE_DAYS);
      trend += alpha * (p.weightKg - trend);
      out.push({ ...p, trendKg: round(trend, 2) });
    }
  }
  return out;
}

export interface WeightSummary {
  start: number;
  end: number;
  /** Last − first weigh-in in the period (raw, 0.1 kg). */
  change: number;
  /** Least-squares kg/week, or null with too few / too-close weigh-ins. */
  ratePerWeek: number | null;
  /** Days between first and last weigh-in. */
  spanDays: number;
  weighIns: number;
  /** Flat for ≥3 weeks: |rate| < 0.1 kg/week over a span of ≥21 days. */
  plateau: boolean;
}

export function summarizeWeight(points: WeightPoint[]): WeightSummary | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = daysBetween(first.date, last.date);
  let ratePerWeek: number | null = null;
  if (points.length >= 3 && spanDays >= 7) {
    const xs = points.map((p) => daysBetween(first.date, p.date));
    const ys = points.map((p) => p.weightKg);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    if (den > 0) ratePerWeek = round((num / den) * 7, 2);
  }
  return {
    start: first.weightKg,
    end: last.weightKg,
    change: round(last.weightKg - first.weightKg, 1),
    ratePerWeek,
    spanDays,
    weighIns: points.length,
    plateau: ratePerWeek !== null && spanDays >= 21 && Math.abs(ratePerWeek) < 0.1,
  };
}
