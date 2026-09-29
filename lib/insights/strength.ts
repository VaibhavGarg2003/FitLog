/**
 * Strength progress — estimated one-rep max (e1RM) per exercise over time
 * ════════════════════════════════════════════════════════════════════════
 *
 * Comparing raw weights misses progress: 70 kg × 8 → 70 kg × 11 is stronger.
 * The Epley formula turns any set into an estimated one-rep max:
 *     e1RM = weight × (1 + reps / 30)        (a single rep is its own 1RM)
 * It is reliable for 1–12 reps; higher-rep sets are skipped, not guessed.
 *
 * WHAT COUNTS (the caller's query already excludes the rest):
 * - working sets only (no warm-ups), weight > 0, reps > 0, non-cardio;
 * - progress compares the SAME exercise id to itself — never "a press" to
 *   "another press".
 *
 * Per CALENDAR DAY the best e1RM for each exercise is kept; a lift shows up
 * once it has at least two days to compare. Per day, not per session: two
 * sessions on one date have no reliable order, and "best of the day" gives
 * the same answer (and the same report fingerprint) whatever order the
 * database returns the rows in.
 */

export interface StrengthSet {
  date: string; // session date "YYYY-MM-DD"
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  weight: number; // kg
  reps: number;
}

export interface LiftProgress {
  exerciseId: string;
  name: string;
  sessions: number;
  first: { date: string; e1rm: number };
  last: { date: string; e1rm: number };
  best: number;
  /** (last − first) / first, whole percent. `sessions` counts training days. */
  changePct: number;
  series: Array<{ date: string; e1rm: number }>;
}

const MAX_REPS = 12;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Epley e1RM, or null when the set can't be estimated honestly. */
export function epley(weight: number, reps: number): number | null {
  if (!(weight > 0) || !Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) return null;
  return round1(reps === 1 ? weight : weight * (1 + reps / 30));
}

/**
 * The most-trained lifts (by sessions) with their e1RM progression, oldest
 * session first. Ties by name, so the result is stable.
 */
export function topLifts(sets: StrengthSet[], limit = 5): LiftProgress[] {
  // exerciseId → date → best e1RM that day
  const byLift = new Map<string, { name: string; days: Map<string, number> }>();
  for (const s of sets) {
    const e = epley(s.weight, s.reps);
    if (e === null) continue;
    const lift = byLift.get(s.exerciseId) ?? { name: s.exerciseName, days: new Map() };
    const prev = lift.days.get(s.date);
    if (prev === undefined || e > prev) lift.days.set(s.date, e);
    byLift.set(s.exerciseId, lift);
  }

  const out: LiftProgress[] = [];
  for (const [exerciseId, lift] of byLift) {
    const series = [...lift.days]
      .map(([date, e1rm]) => ({ date, e1rm }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)); // dates are unique keys
    if (series.length < 2) continue;
    const first = series[0];
    const last = series[series.length - 1];
    out.push({
      exerciseId,
      name: lift.name,
      sessions: series.length,
      first,
      last,
      best: Math.max(...series.map((p) => p.e1rm)),
      changePct: Math.round(((last.e1rm - first.e1rm) / first.e1rm) * 100),
      series,
    });
  }
  return out
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Overall direction of the top lifts: median change ≥ +2% up, ≤ −2% down. */
export function strengthDirection(lifts: LiftProgress[]): "UP" | "FLAT" | "DOWN" | null {
  if (lifts.length === 0) return null;
  const changes = lifts.map((l) => l.changePct).sort((a, b) => a - b);
  const mid = Math.floor(changes.length / 2);
  const median = changes.length % 2 ? changes[mid] : (changes[mid - 1] + changes[mid]) / 2;
  return median >= 2 ? "UP" : median <= -2 ? "DOWN" : "FLAT";
}
