"use client";

/**
 * Sign-in Methods Card (Settings)
 * ═══════════════════════════════
 *
 * Shows which login methods are connected (Email / Google) and lets the user:
 *   • Connect Google  → /api/auth/link/google (linkIdentity, login_hint)
 *   • Add a password  → /api/auth/password (updateUser) for Google-only users
 *
 * Reads GET /api/auth/identities. Surfaces the ?linked / ?error banners the
 * link callback redirects back with.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Identities {
  email: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export function SigninMethodsCard() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Data via TanStack Query (like the rest of the app) — no effect, no manual
  // setState, so nothing to trip react-hooks/set-state-in-effect.
  const { data } = useQuery<Identities>({
    queryKey: ["auth-identities"],
    queryFn: async () => {
      const res = await fetch("/api/auth/identities");
      if (!res.ok) throw new Error("Failed to load sign-in methods");
      return res.json();
    },
    retry: false,
    staleTime: 60 * 1000,
  });

  // The banner is DERIVED from the URL (the link callback redirects back with
  // ?linked / ?error). It's pure render state, so compute it with useMemo —
  // never setState inside an effect for something derivable from props/params.
  const banner = useMemo<{ kind: "ok" | "err"; text: string } | null>(() => {
    if (searchParams.get("linked") === "google") {
      return { kind: "ok", text: "Google connected ✓" };
    }
    if (searchParams.get("error") === "google_email_mismatch") {
      return {
        kind: "err",
        text: "That was a different Google account. Connect the Google account that uses your FitLog email.",
      };
    }
    if (searchParams.get("error") === "link_failed") {
      return { kind: "err", text: "Couldn't connect Google. Please try again." };
    }
    return null;
  }, [searchParams]);

  // Password sub-form. ADD mode (no password yet) shows one field; CHANGE
  // mode (password exists) also requires the current password — the server
  // enforces this regardless of what the client sends.
  const [showPw, setShowPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const hasPassword = data?.hasPassword ?? false;

  async function savePassword() {
    if (pw.length < 6) {
      setPwMsg("Password must be at least 6 characters.");
      return;
    }
    if (hasPassword && !currentPw) {
      setPwMsg("Enter your current password first.");
      return;
    }
    setPwBusy(true);
    setPwMsg("");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          hasPassword
            ? { currentPassword: currentPw, password: pw }
            : { password: pw }
        ),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setPwMsg(`❌ ${body.error ?? "Could not save password. Try again."}`);
        return;
      }
      setPwMsg(
        hasPassword
          ? "✅ Password updated."
          : "✅ Password set. You can now log in with email + password."
      );
      setPw("");
      setCurrentPw("");
      setShowPw(false);
      // Refresh so the row flips to "Change password" after a first add.
      queryClient.invalidateQueries({ queryKey: ["auth-identities"] });
    } catch {
      setPwMsg("❌ Could not save password. Try again.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Sign-in Methods
      </h2>

      {banner && (
        <p
          className={cn(
            "text-sm px-3 py-2 rounded-lg",
            banner.kind === "ok"
              ? "text-primary bg-primary/10"
              : "text-red-400 bg-red-500/10"
          )}
        >
          {banner.text}
        </p>
      )}

      {/* Email/password */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-text-primary">
          <Lock size={16} className="text-text-muted" /> Email &amp; password
          {hasPassword && (
            <span className="flex items-center gap-0.5 text-xs text-primary">
              <Check size={13} /> Enabled
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setShowPw((s) => !s)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {hasPassword ? "Change password" : "Add password"}
        </button>
      </div>

      {/* Password sub-form — CHANGE mode also asks for the current password */}
      {showPw && (
        <div className="space-y-2 pl-6">
          {hasPassword && (
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-text-primary focus:border-primary focus:outline-none"
            />
          )}
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 6 chars)"
            autoComplete="new-password"
            className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-text-primary focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={savePassword}
            disabled={pwBusy}
            className="w-full py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {pwBusy ? "Saving..." : hasPassword ? "Update password" : "Save password"}
          </button>
        </div>
      )}

      {/* Google */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-text-primary">
          <Globe size={16} className="text-text-muted" /> Google
        </span>
        {data?.hasGoogle ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Check size={14} /> Connected
          </span>
        ) : (
          <a
            href="/api/auth/link/google"
            className="text-xs font-medium text-primary hover:underline"
          >
            Connect
          </a>
        )}
      </div>

      {pwMsg && <p className="text-xs text-text-muted">{pwMsg}</p>}

      {data && !data.hasGoogle && (
        <p className="text-xs text-text-muted">
          Connect Google to sign in with one tap next time — no password needed.
        </p>
      )}
    </div>
  );
}
