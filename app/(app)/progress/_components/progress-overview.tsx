"use client";

/**
 * Progress Overview — range tabs + the numbers for that range
 * ════════════════════════════════════════════════════════════
 *
 * 1M / 3M / 6M / 1Y / All. Everything here is computed by code
 * (GET /api/progress/summary → lib/insights/facts.ts); no AI is involved, so
 * it is instant and free. The AI reports below the charts are written FROM
 * these same numbers.
 */

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useProgressSummary } from "@/lib/hooks/use-insights";
import type { SummaryRange } from "@/lib/services/progress-summary.service";
import type { PeriodFacts } from "@/lib/insights/facts";
import { WeightChart } from "./weight-chart";
import { StrengthCard } from "./strength-card";
import { ConsistencyGrid } from "./consistency-grid";

const RANGES: Array<{ value: SummaryRange; label: string }> = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "All" },
];

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background/60 rounded-xl px-3 py-2.5 border border-border">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-base lg:text-lg font-bold text-text-primary leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-text-muted">{sub}</p>}
    </div>
  );
}

const fmt = (n: number | null | undefined, unit = "") =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("en-IN")}${unit}`;
const signed = (n: number | null | undefined, unit = "") =>
  n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n}${unit}`;

/** The number tiles for any facts object — shared with the AI report cards. */
export function FactTiles({ facts }: { facts: PeriodFacts }) {
  const n = facts.nutrition;
  const w = facts.weight;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Tile
        label="Weight"
        value={w.start !== null && w.end !== null ? `${w.start} → ${w.end}` : "—"}
        sub={w.ratePerWeek !== null ? `${signed(w.ratePerWeek, " kg")}/week` : w.change !== null ? `${signed(w.change, " kg")}` : "not enough weigh-ins"}
      />
      <Tile
        label="Food logged"
        value={`${facts.coverage.foodDays} / ${facts.period.days} days`}
        sub={n.avgCalories !== null ? `avg ${fmt(n.avgCalories)} kcal on logged days` : undefined}
      />
      {/* Judged day by day against the target in force THAT day — an
          average can hide a 1,500/2,500 swing that misses both days. */}
      <Tile
        label="Calorie target"
        value={n.daysWithKnownTarget ? `${n.daysOnCalorieTarget} / ${n.daysWithKnownTarget} days` : "—"}
        sub={n.daysWithKnownTarget ? "within ±10% of that day's target" : "no target history for these days"}
      />
      <Tile
        label="Protein"
        value={n.avgProtein !== null ? `${n.avgProtein} g` : "—"}
        sub={n.daysWithKnownTarget ? `target hit ${n.daysProteinHit} of ${n.daysWithKnownTarget} days` : undefined}
      />
      <Tile
        label="Training"
        value={`${facts.training.workoutDays} days`}
        sub={facts.training.workingSets ? `${facts.training.workingSets} working sets` : undefined}
      />
    </div>
  );
}

export function ProgressOverview({ targetWeight }: { targetWeight?: number | null }) {
  const [range, setRange] = useState<SummaryRange>("3M");
  const { data, isLoading, isError, error } = useProgressSummary(range);

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Your progress
        </h2>
        <div role="tablist" aria-label="Time range" className="flex gap-1 bg-surface border border-border rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              role="tab"
              aria-selected={range === r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                range === r.value ? "bg-primary text-white" : "text-text-secondary hover:bg-surface-hover"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="bg-surface rounded-2xl border border-border animate-pulse h-64" />}
      {isError && (
        <div className="bg-surface rounded-2xl border border-border p-5 text-sm text-text-muted">
          {error?.message || "Could not load your progress."}
        </div>
      )}

      {data && (
        <>
          <div className="bg-surface rounded-2xl border border-border p-4 lg:p-5 space-y-3">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="text-sm text-text-secondary">
                {data.from} → {data.to}
                {data.capped && (
                  <span className="block text-[11px] text-text-muted">
                    Showing the most recent 13 months
                  </span>
                )}
              </p>
              {data.facts.weight.plateau && (
                <span className="text-[11px] bg-warning/10 text-[var(--color-warning)] px-2 py-0.5 rounded-full">
                  Weight flat for 3+ weeks
                </span>
              )}
            </div>
            <FactTiles facts={data.facts} />
            {data.facts.coverage.foodDayPct < 50 && data.facts.coverage.foodDays > 0 && (
              <p className="text-[11px] text-text-muted">
                Food was logged on {data.facts.coverage.foodDayPct}% of days — averages cover logged days only.
              </p>
            )}
          </div>

          <WeightChart points={data.series.weight} from={data.from} to={data.to} targetWeight={targetWeight} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
            <StrengthCard lifts={data.series.lifts} />
            <ConsistencyGrid
              days={data.series.days}
              foodDays={data.facts.coverage.foodDays}
              workoutDays={data.facts.coverage.workoutDays}
            />
          </div>
        </>
      )}
    </div>
  );
}
