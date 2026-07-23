"use client";

/**
 * Date Strip — Horizontal Date Selector
 * ═════════════════════════════════════
 *
 * Shows 7 dates centered on today: 3 days before, today, 3 days after.
 * Selecting a date updates the global `selectedDate` in the UI store.
 *
 * On phones the strip can scroll horizontally. On laptops the 7 days
 * expand to fill the content width so the strip no longer looks like a
 * narrow phone widget floating in empty space.
 *
 * WHY CENTERED ON TODAY (not last 7 days)?
 * ─────────────────────────────────────────
 * Previous design showed the last 6 days + today. A new user who just
 * onboarded would see 6 empty past days before reaching today — confusing.
 * Centered layout puts today in the middle. Past days (for reviewing
 * yesterday's meals/workout) are still accessible to the left.
 * Future dates (for planning) are accessible to the right.
 */

import { useUIStore } from "@/stores/ui-store";
import { localDateStr } from "@/lib/utils/local-date";
import { cn } from "@/lib/utils/cn";

export function DateStrip() {
  const selectedDate = useUIStore((s) => s.selectedDate);
  const setSelectedDate = useUIStore((s) => s.setSelectedDate);

  const today = localDateStr();

  // TEMPORARY (weekly-insights testing): last 6 days + today = 7 loggable days.
  // Revert to the centered layout below when done testing.
  //   const d = new Date(); d.setDate(d.getDate() + (i - 3)); // 3 before, today, 3 after
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + (i - 6)); // i=0 → -6 days, i=6 → today
    return d;
  });

  const isViewingPast = selectedDate < today;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide lg:overflow-visible lg:mx-0 lg:px-0 lg:pb-0">
        {dates.map((date) => {
          const dateStr = localDateStr(date);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const isFuture = dateStr > today;
          const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = date.getDate();

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDate(dateStr)}
              className={cn(
                "flex flex-col items-center min-w-[3rem] py-2 px-3 rounded-xl transition-all duration-200 flex-shrink-0",
                // Laptop: equal-width day cells fill the content canvas
                "lg:flex-1 lg:min-w-0 lg:py-2.5",
                isSelected
                  ? "bg-primary text-white shadow-md"
                  : isFuture
                  ? "bg-surface hover:bg-surface-hover text-text-muted opacity-60"
                  : "bg-surface hover:bg-surface-hover text-text-secondary"
              )}
            >
              <span className="text-[10px] lg:text-xs font-medium uppercase tracking-wider">
                {isToday ? "Today" : dayName}
              </span>
              <span className="text-lg lg:text-xl font-bold leading-tight">{dayNum}</span>
              {isToday && !isSelected && (
                <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* "Back to Today" pill — only shows when viewing a past date */}
      {isViewingPast && (
        <button
          type="button"
          onClick={() => setSelectedDate(today)}
          className="text-xs text-primary font-medium hover:underline"
        >
          ← Back to Today
        </button>
      )}
    </div>
  );
}
