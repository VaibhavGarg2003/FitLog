"use client";

/**
 * Settings Page — Profile editing + target recalculation
 * ═══════════════════════════════════════════════════════
 *
 * Allows users to update their profile data. When weight, goal,
 * or activity level changes, "Recalculate Targets" reruns the
 * engine and saves new targets to the database.
 *
 * FLOW:
 * User changes weight → clicks "Recalculate Targets"
 *   → PUT /api/profile (Step 3 — to be created if needed,
 *     or POST to existing recalculate endpoint)
 *   → profile.service.ts recalculateProfile() (Step 2)
 *     → calculateFullProfile() (Step 2 engine)
 *       → new protein, carbs, fat targets
 *     → profile.repository.ts updateProfile() (Step 2)
 *   → Dashboard loads new targets on next visit
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/hooks/use-profile";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

const ACTIVITY_OPTIONS = [
  { value: "SEDENTARY", label: "Sedentary", desc: "Desk job, no exercise" },
  { value: "LIGHT", label: "Light", desc: "1-3 days/week" },
  { value: "MODERATE", label: "Moderate", desc: "3-5 days/week" },
  { value: "ACTIVE", label: "Active", desc: "6-7 days/week" },
  { value: "VERY_ACTIVE", label: "Very Active", desc: "Athlete level" },
];

const GOAL_OPTIONS = [
  { value: "LOSE_FAT", label: "Lose Fat" },
  { value: "GAIN_MUSCLE", label: "Gain Muscle" },
  { value: "MAINTAIN", label: "Maintain" },
  { value: "RECOMP", label: "Lean Muscle" },
];

const DIET_OPTIONS = [
  { value: "VEG", label: "🥬 Vegetarian" },
  { value: "NON_VEG", label: "🍗 Non-Veg" },
  { value: "VEGAN", label: "🌱 Vegan" },
  { value: "EGGETARIAN", label: "🥚 Eggetarian" },
];

export default function SettingsPage() {
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear all cached query data so next user gets a clean slate
    queryClient.clear();
    router.push("/login");
  }

  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState("");
  const [goal, setGoal] = useState("");
  const [dietary, setDietary] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Populate form when profile loads
  if (profile && !weight && !activity) {
    setWeight(profile.weightKg?.toString() ?? "");
    setActivity(profile.activityLevel ?? "MODERATE");
    setGoal(profile.goal ?? "MAINTAIN");
    setDietary(profile.dietaryType ?? "NON_VEG");
  }

  async function handleRecalculate() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg: parseFloat(weight) || undefined,
          activityLevel: activity || undefined,
          goal: goal || undefined,
          dietaryType: dietary || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");

      // Invalidate profile cache so dashboard picks up new targets
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setMessage("✅ Targets recalculated and saved!");
    } catch {
      setMessage("❌ Failed to update. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">
          Settings
        </h1>
        <div className="bg-surface rounded-2xl p-6 border border-border animate-pulse h-64" />
      </div>
    );
  }

  return (
    // Form page — keep a comfortable reading column even on wide screens.
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">
          Settings
        </h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Update your profile and recalculate targets
        </p>
      </div>

      {/* Current Stats */}
      <div className="bg-surface rounded-2xl p-5 border border-border space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Current Targets
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-text-muted">Calories</p>
            <p className="text-lg font-bold text-text-primary">
              {profile?.targetCalories ?? "—"} kcal
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">TDEE</p>
            <p className="text-lg font-bold text-text-primary">
              {profile?.tdee ?? "—"} kcal
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Protein</p>
            <p className="text-lg font-bold" style={{ color: "var(--color-protein)" }}>
              {profile?.targetProtein ?? "—"}g
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Carbs / Fat</p>
            <p className="text-sm font-bold text-text-primary">
              {profile?.targetCarbs ?? "—"}g / {profile?.targetFat ?? "—"}g
            </p>
          </div>
        </div>
      </div>

      {/* Editable Fields */}
      <div className="bg-surface rounded-2xl p-5 border border-border space-y-4">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Update Profile
        </h2>

        {/* Weight */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Current Weight (kg)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full p-3 bg-background border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
          />
        </div>

        {/* Activity Level */}
        <div>
          <label className="block text-sm text-text-secondary mb-2">
            Activity Level
          </label>
          <div className="space-y-1.5">
            {ACTIVITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setActivity(opt.value)}
                className={cn(
                  "w-full p-3 rounded-lg text-left text-sm transition-colors",
                  activity === opt.value
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-background border border-border text-text-secondary hover:border-text-muted"
                )}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-text-muted ml-2 text-xs">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Goal */}
        <div>
          <label className="block text-sm text-text-secondary mb-2">
            Goal
          </label>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGoal(opt.value)}
                className={cn(
                  "p-3 rounded-lg text-sm font-medium transition-colors",
                  goal === opt.value
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-background border border-border text-text-secondary hover:border-text-muted"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dietary Type */}
        <div>
          <label className="block text-sm text-text-secondary mb-2">
            Diet Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {DIET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDietary(opt.value)}
                className={cn(
                  "p-3 rounded-lg text-sm font-medium transition-colors",
                  dietary === opt.value
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-background border border-border text-text-secondary hover:border-text-muted"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recalculate Button */}
        <button
          type="button"
          onClick={handleRecalculate}
          disabled={saving}
          className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {saving ? "Recalculating..." : "Recalculate Targets"}
        </button>

        {message && (
          <p className="text-sm text-center">{message}</p>
        )}
      </div>

      {/* Account Info + Sign Out */}
      <div className="bg-surface rounded-2xl p-5 border border-border space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Account
        </h2>
        <p className="text-sm text-text-primary">
          {profile?.user?.name ?? "—"}
        </p>
        <p className="text-xs text-text-muted">
          {profile?.user?.email ?? "—"}
        </p>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className={cn(
            "w-full mt-2 py-2.5 px-4 rounded-xl text-sm font-semibold",
            "border border-red-500/40 text-red-400",
            "hover:bg-red-500/10 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {signingOut ? "Signing out..." : "🚪 Sign Out"}
        </button>
      </div>
    </div>
  );
}
