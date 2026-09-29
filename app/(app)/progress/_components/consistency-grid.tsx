"use client";

/**
 * Consistency Grid — one square per day, GitHub-style
 * ═══════════════════════════════════════════════════
 *
 * Columns are Monday-start weeks, rows are weekdays. A square is:
 *   bright — food logged AND a workout
 *   medium — a workout only
 *   soft   — food logged only
 *   empty  — nothing logged
 * "Food logged" means some food was logged that day — not that the day was
 * complete (the reports say the same).
 */

import { weekdayShort } from "@/lib/utils/local-date";

interface Day {
  date: string;
  food: boolean;
  workout: boolean;
}

const MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ConsistencyGrid({ days, foodDays, workoutDays }: { days: Day[]; foodDays: number; workoutDays: number }) {
  // Pad the start so the first column begins on Monday.
  const lead = days.length ? MON_FIRST.indexOf(weekdayShort(days[0].date)) : 0;
  const cells: Array<Day | null> = [...Array(lead).fill(null), ...days];
  const weeks: Array<Array<Day | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const tone = (d: Day | null) =>
    !d
      ? "bg-transparent"
      : d.food && d.workout
        ? "bg-primary"
        : d.workout
          ? "bg-primary/60"
          : d.food
            ? "bg-primary/25"
            : "bg-border/60";

  return (
    <div className="bg-surface rounded-2xl p-4 lg:p-5 border border-border h-full">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-1">
        Consistency
      </h3>
      <p className="text-[11px] text-text-muted mb-3">
        Food logged on {foodDays} of {days.length} days · {workoutDays} workout days
      </p>
      <div className="overflow-x-auto">
        <div
          className="flex gap-[3px] w-max"
          role="img"
          aria-label={`Consistency grid: food logged on ${foodDays} of ${days.length} days, ${workoutDays} workout days`}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((d, di) => (
                <div
                  key={di}
                  className={`w-3 h-3 rounded-[3px] ${tone(d)}`}
                  title={d ? `${d.date}${d.food ? " · food" : ""}${d.workout ? " · workout" : ""}` : undefined}
                  aria-hidden="true"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] text-text-muted">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary align-middle mr-1" />food + workout</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/60 align-middle mr-1" />workout</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/25 align-middle mr-1" />food</span>
      </div>
    </div>
  );
}
