"use client";

/**
 * Weight Chart — daily weigh-ins + the smoothed trend + the goal
 * ═══════════════════════════════════════════════════════════════
 *
 * Pure SVG (no charting library — a few paths are all this needs).
 *   - faint dots: every weigh-in (the noisy truth)
 *   - bold line:  the smoothed trend (lib/insights/trend.ts), broken wherever
 *                 there was a 14-day+ gap — never drawn across missing data
 *   - dashed:     the goal weight, if set
 * X is placed by DATE, not by index, so a two-week gap looks like one.
 */

import { daysBetween } from "@/lib/insights/fill-days";
import { GAP_DAYS } from "@/lib/insights/trend";

interface WeightChartProps {
  points: Array<{ date: string; kg: number; trendKg: number }>;
  from: string;
  to: string;
  targetWeight?: number | null;
}

export function WeightChart({ points, from, to, targetWeight }: WeightChartProps) {
  if (points.length < 2) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-border flex items-center justify-center h-48 lg:h-64">
        <p className="text-sm text-text-muted text-center">
          Log at least 2 weigh-ins in this range to see your trend 📈
        </p>
      </div>
    );
  }

  const width = 720;
  const height = 260;
  const pad = { top: 20, right: 34, bottom: 30, left: 45 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const values = points.flatMap((p) => [p.kg, p.trendKg]);
  const min = Math.min(...values, targetWeight ?? Infinity) - 0.5;
  const max = Math.max(...values, targetWeight ?? -Infinity) + 0.5;
  const span = max - min || 1;
  const totalDays = Math.max(1, daysBetween(from, to));

  const x = (date: string) => pad.left + (daysBetween(from, date) / totalDays) * chartW;
  const y = (kg: number) => pad.top + chartH - ((kg - min) / span) * chartH;

  // Trend line, split into segments at gaps.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    const gap = i > 0 && daysBetween(points[i - 1].date, p.date) >= GAP_DAYS;
    if (gap && current.length) {
      segments.push(current.join(" "));
      current = [];
    }
    current.push(`${current.length ? "L" : "M"} ${x(p.date)} ${y(p.trendKg)}`);
  });
  if (current.length) segments.push(current.join(" "));

  const targetY = targetWeight ? y(targetWeight) : null;
  const last = points[points.length - 1];
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="bg-surface rounded-2xl p-4 lg:p-6 border border-border">
      <div className="flex items-baseline justify-between mb-3 lg:mb-4">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Weight Trend
        </h3>
        <p className="text-[11px] text-text-muted">
          <span className="inline-block w-2 h-2 rounded-full bg-primary/40 mr-1" />weigh-ins
          <span className="inline-block w-4 h-0.5 bg-primary mx-1 align-middle" />trend
        </p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto min-h-[11rem] lg:min-h-[16rem]"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Weight trend from ${points[0].kg} kg to ${last.kg} kg`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const gy = pad.top + chartH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={pad.left} y1={gy} x2={width - pad.right} y2={gy} stroke="var(--color-border)" strokeWidth="0.5" />
              <text x={pad.left - 5} y={gy + 3} textAnchor="end" className="text-[9px] fill-[var(--color-text-muted)]">
                {(min + span * frac).toFixed(1)}
              </text>
            </g>
          );
        })}

        <text x={pad.left} y={height - 8} className="text-[9px] fill-[var(--color-text-muted)]">{label(from)}</text>
        <text x={width - pad.right} y={height - 8} textAnchor="end" className="text-[9px] fill-[var(--color-text-muted)]">{label(to)}</text>

        {targetY !== null && (
          <>
            <line x1={pad.left} y1={targetY} x2={width - pad.right} y2={targetY} stroke="var(--color-warning)" strokeWidth="1" strokeDasharray="6 3" />
            <text x={width - pad.right + 3} y={targetY + 3} className="text-[8px] fill-[var(--color-warning)]">Goal</text>
          </>
        )}

        {points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={points.length > 60 ? 1.6 : 2.6} fill="var(--color-primary)" opacity="0.35" />
        ))}

        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        <circle cx={x(last.date)} cy={y(last.trendKg)} r="5" fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth="2" />
      </svg>
    </div>
  );
}
