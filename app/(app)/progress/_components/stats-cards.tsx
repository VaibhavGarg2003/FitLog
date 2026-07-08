"use client";

/**
 * Stats Cards — Quick progress statistics
 * ═══════════════════════════════════════
 */

interface StatsCardsProps {
  startWeight: number | null;
  currentWeight: number | null;
  totalChange: number | null;
  logCount: number;
  canUseAdaptiveTDEE: boolean;
}

export function StatsCards({
  startWeight,
  currentWeight,
  totalChange,
  logCount,
  canUseAdaptiveTDEE,
}: StatsCardsProps) {
  const stats = [
    {
      label: "Starting",
      value: startWeight ? `${startWeight} kg` : "—",
      color: "text-text-primary",
    },
    {
      label: "Current",
      value: currentWeight ? `${currentWeight} kg` : "—",
      color: "text-text-primary",
    },
    {
      label: "Change",
      value: totalChange !== null ? `${totalChange > 0 ? "+" : ""}${totalChange} kg` : "—",
      color:
        totalChange !== null
          ? totalChange < 0
            ? "text-success"
            : totalChange > 0
              ? "text-warning"
              : "text-text-primary"
          : "text-text-primary",
    },
    {
      label: "Logs",
      value: `${logCount}`,
      color: canUseAdaptiveTDEE ? "text-primary" : "text-text-primary",
      subtitle: canUseAdaptiveTDEE
        ? "Adaptive TDEE ready ✨"
        : `${14 - logCount} more for Adaptive TDEE`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-surface rounded-xl p-3 border border-border"
        >
          <p className="text-[10px] text-text-muted uppercase tracking-wider">
            {stat.label}
          </p>
          <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
          {stat.subtitle && (
            <p className="text-[10px] text-text-muted mt-0.5">
              {stat.subtitle}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
