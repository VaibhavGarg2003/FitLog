"use client";

/**
 * Calorie Ring — Circular Progress for Daily Calorie Intake
 * ══════════════════════════════════════════════════════════
 *
 * Shows consumed calories vs target as a circular SVG ring.
 * The ring fills clockwise as the user logs meals throughout the day.
 *
 * Color logic:
 *   Green  = under target (on track)
 *   Amber  = at 90-100% of target (approaching limit)
 *   Red    = over target
 *
 * WHY SVG INSTEAD OF A CHARTING LIBRARY?
 * ──────────────────────────────────────
 * A calorie ring is a single circle with a stroke-dasharray.
 * Using Recharts for this would add ~50KB to the bundle for
 * something achievable in 20 lines of SVG. We save the charting
 * library for the weight chart on the progress page where it's needed.
 */

interface CalorieRingProps {
  consumed: number;
  target: number;
}

export function CalorieRing({ consumed, target }: CalorieRingProps) {
  const percentage = target > 0 ? Math.min((consumed / target) * 100, 120) : 0;
  const remaining = Math.max(0, target - consumed);

  // SVG circle math
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  // Color based on progress
  let ringColor = "var(--color-success)";       // Green: on track
  let ringGlow = "rgba(34, 197, 94, 0.3)";
  if (percentage >= 100) {
    ringColor = "var(--color-danger)";            // Red: over target
    ringGlow = "rgba(239, 68, 68, 0.3)";
  } else if (percentage >= 90) {
    ringColor = "var(--color-warning)";           // Amber: approaching
    ringGlow = "rgba(245, 158, 11, 0.3)";
  }

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border h-full">
      <div className="flex items-center gap-6 lg:gap-8">
        {/* SVG Ring — fixed-size wrapper so overlay and SVG share the same box.
            Inline SVG + CSS-only sizing without viewBox can leave the absolute
            center text slightly off (commonly shifted right). */}
        <div className="relative size-40 shrink-0 lg:size-[180px]">
          <svg
            viewBox="0 0 160 160"
            className="absolute inset-0 size-full -rotate-90"
            aria-hidden
          >
            {/* Background ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="var(--color-border)"
              strokeWidth="10"
              fill="none"
            />
            {/* Progress ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke={ringColor}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
                transition: "stroke-dashoffset 0.8s ease-out, stroke 0.3s ease",
                filter: `drop-shadow(0 0 8px ${ringGlow})`,
              }}
            />
          </svg>
          {/* Center text — same box as the ring via absolute inset-0 */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold leading-none tabular-nums text-text-primary lg:text-3xl">
              {consumed.toLocaleString()}
            </span>
            <span className="mt-0.5 text-xs leading-none text-text-muted">
              kcal eaten
            </span>
          </div>
        </div>

        {/* Right side stats */}
        <div className="flex-1 space-y-3 lg:space-y-4">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider">Target</p>
            <p className="text-lg lg:text-xl font-bold text-text-primary">
              {target.toLocaleString()} kcal
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider">
              {consumed > target ? "Over by" : "Remaining"}
            </p>
            <p className={cn(
              "text-lg lg:text-xl font-bold",
              consumed > target ? "text-danger" : "text-success"
            )}>
              {consumed > target
                ? `+${(consumed - target).toLocaleString()}`
                : remaining.toLocaleString()
              } kcal
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Utility — cn function might not be available as import here, inline it
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
