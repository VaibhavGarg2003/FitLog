"use client";

/**
 * Coach Check-ins Card (Settings)
 * ═══════════════════════════════
 *
 * Which AI reports the user gets: weekly + monthly, or monthly only
 * (PATCH /api/profile/preferences { insightPlan }). Saving applies at once —
 * the Progress page's report cards follow the new plan on their next load.
 * Reports already written stay in "Past reports" either way.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/lib/hooks/use-profile";
import {
  AiDataNotice,
  InsightPlanPicker,
  type InsightPlan,
} from "@/components/shared/insight-plan";

export function CoachCheckinsCard() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const current: InsightPlan = profile?.insightPlan ?? "WEEKLY_AND_MONTHLY";

  async function save(next: InsightPlan) {
    if (next === current) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightPlan: next }),
      });
      if (!res.ok) throw new Error();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["progress", "insights"] }),
      ]);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Coach Check-ins
      </h2>
      <p className="text-xs text-text-muted leading-relaxed">
        Everyone gets a monthly review, and quarterly/yearly reviews once there
        is enough data. Choose whether you also want a weekly report.
      </p>
      <InsightPlanPicker
        idPrefix="settings-plan"
        value={current}
        onChange={save}
        disabled={busy || !profile}
      />
      <AiDataNotice />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
