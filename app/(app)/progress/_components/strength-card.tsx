"use client";

/**
 * Strength Card — your most-trained lifts, first session vs latest
 * ═════════════════════════════════════════════════════════════════
 *
 * Estimated one-rep max (Epley, working sets of 1–12 reps; see
 * lib/insights/strength.ts), so "70 kg × 8 → 70 kg × 11" shows as progress.
 * Each row: name, start → now e1RM, % change, and a tiny sparkline.
 */

interface Lift {
  name: string;
  sessions: number;
  changePct: number;
  series: Array<{ date: string; e1rm: number }>;
}

function Sparkline({ series }: { series: Lift["series"] }) {
  const w = 80;
  const h = 24;
  const values = series.map((p) => p.e1rm);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const d = series
    .map((p, i) => `${i ? "L" : "M"} ${(i / (series.length - 1)) * w} ${h - ((p.e1rm - min) / span) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 2}`} className="w-20 h-6 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function StrengthCard({ lifts }: { lifts: Lift[] }) {
  return (
    <div className="bg-surface rounded-2xl p-4 lg:p-5 border border-border h-full">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-1">
        Strength Progress
      </h3>
      <p className="text-[11px] text-text-muted mb-3">
        Estimated one-rep max, first session vs latest
      </p>
      {lifts.length === 0 ? (
        <p className="text-sm text-text-muted">
          Log the same exercise on at least two days in this range to see it here 💪
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {lifts.map((l) => {
            const first = l.series[0].e1rm;
            const last = l.series[l.series.length - 1].e1rm;
            return (
              <li key={l.name} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{l.name}</p>
                  <p className="text-xs text-text-muted">
                    {first} → {last} kg · {l.sessions} training days
                  </p>
                </div>
                <Sparkline series={l.series} />
                <span
                  className={
                    "text-sm font-semibold w-14 text-right " +
                    (l.changePct > 0 ? "text-primary" : l.changePct < 0 ? "text-red-400" : "text-text-muted")
                  }
                >
                  {l.changePct > 0 ? "+" : ""}
                  {l.changePct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
