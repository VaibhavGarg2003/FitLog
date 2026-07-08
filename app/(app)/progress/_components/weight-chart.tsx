"use client";

/**
 * Weight Chart — Line chart showing weight trend over time
 * ════════════════════════════════════════════════════════
 *
 * Uses pure SVG (no charting library) to draw a simple line chart.
 * Shows the user's weight log entries over the last 90 days.
 *
 * A dashed horizontal line marks the target weight (if set).
 */

interface WeightChartProps {
  history: { date: string; weightKg: number }[];
  targetWeight?: number | null;
}

export function WeightChart({ history, targetWeight }: WeightChartProps) {
  if (history.length < 2) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-border flex items-center justify-center h-48">
        <p className="text-sm text-text-muted text-center">
          Log at least 2 weight entries to see your chart 📈
        </p>
      </div>
    );
  }

  // Chart dimensions
  const width = 400;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Calculate bounds
  const weights = history.map((h) => h.weightKg);
  const minWeight = Math.min(...weights, targetWeight ?? Infinity) - 1;
  const maxWeight = Math.max(...weights, targetWeight ?? -Infinity) + 1;
  const weightRange = maxWeight - minWeight || 1;

  // Generate points
  const points = history.map((entry, i) => {
    const x = padding.left + (i / (history.length - 1)) * chartW;
    const y =
      padding.top +
      chartH -
      ((entry.weightKg - minWeight) / weightRange) * chartH;
    return { x, y, weight: entry.weightKg, date: entry.date };
  });

  // Create path
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Gradient area path
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  // Target weight line Y position
  const targetY = targetWeight
    ? padding.top + chartH - ((targetWeight - minWeight) / weightRange) * chartH
    : null;

  return (
    <div className="bg-surface rounded-2xl p-4 border border-border">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Weight Trend
      </h3>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padding.top + chartH * (1 - frac);
          const weight = minWeight + weightRange * frac;
          return (
            <g key={frac}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="0.5"
              />
              <text
                x={padding.left - 5}
                y={y + 3}
                textAnchor="end"
                className="text-[9px] fill-[var(--color-text-muted)]"
              >
                {Math.round(weight)}
              </text>
            </g>
          );
        })}

        {/* Target weight line */}
        {targetY !== null && (
          <>
            <line
              x1={padding.left}
              y1={targetY}
              x2={width - padding.right}
              y2={targetY}
              stroke="var(--color-warning)"
              strokeWidth="1"
              strokeDasharray="6 3"
            />
            <text
              x={width - padding.right + 2}
              y={targetY + 3}
              className="text-[8px] fill-[var(--color-warning)]"
            >
              Goal
            </text>
          </>
        )}

        {/* Area fill */}
        <path d={areaPath} fill="url(#weightGradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={history.length > 30 ? 1.5 : 3}
            fill="var(--color-primary)"
          />
        ))}

        {/* Latest point highlight */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="5"
          fill="var(--color-primary)"
          stroke="var(--color-surface)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
