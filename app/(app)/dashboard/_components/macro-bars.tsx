"use client";

/**
 * Macro Bars — Horizontal Progress Bars for Protein/Carbs/Fat
 * ════════════════════════════════════════════════════════════
 *
 * Three bars showing grams consumed vs target for each macronutrient.
 * Color-coded using the design system semantic colors:
 *   Protein = Blue (--color-protein)
 *   Carbs   = Amber (--color-carbs)
 *   Fat     = Red (--color-fat)
 *
 * WHY CSS BARS INSTEAD OF RECHARTS?
 * ─────────────────────────────────
 * Same reason as the calorie ring — these are simple progress bars.
 * A div with a width percentage is simpler, lighter, and more
 * customizable than importing a charting library.
 */

interface MacroBarsProps {
  consumed: {
    protein: number;
    carbs: number;
    fat: number;
  };
  targets: {
    protein: number;
    carbs: number;
    fat: number;
  };
}

const MACROS = [
  { key: "protein" as const, label: "Protein", color: "var(--color-protein)", unit: "g" },
  { key: "carbs" as const, label: "Carbs", color: "var(--color-carbs)", unit: "g" },
  { key: "fat" as const, label: "Fat", color: "var(--color-fat)", unit: "g" },
] as const;

export function MacroBars({ consumed, targets }: MacroBarsProps) {
  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-4 lg:space-y-5 h-full">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Macros
      </h3>

      {MACROS.map((macro) => {
        const eaten = consumed[macro.key];
        const target = targets[macro.key];
        const percentage = target > 0 ? Math.min((eaten / target) * 100, 100) : 0;
        const isOver = eaten > target;

        return (
          <div key={macro.key} className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-medium text-text-primary">
                {macro.label}
              </span>
              <span className="text-xs text-text-muted">
                <span
                  className="font-bold"
                  style={{ color: isOver ? "var(--color-danger)" : macro.color }}
                >
                  {eaten}{macro.unit}
                </span>
                {" / "}
                {target}{macro.unit}
              </span>
            </div>

            {/* Progress bar track */}
            <div className="h-2.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: isOver ? "var(--color-danger)" : macro.color,
                  boxShadow: `0 0 8px ${macro.color}40`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
