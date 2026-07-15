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

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Globe, Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Identities {
  email: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export function SigninMethodsCard() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Identities | null>(null);
  const [banner, setBanner] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  // Add-password sub-form (only for accounts without a password yet).
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/auth/identities");
      if (res.ok) setData(await res.json());
    } catch {
      /* leave as null → card just hides actions */
    }
  }

  useEffect(() => {
    load();
    // Translate the link-callback redirect params into a friendly banner.
    if (searchParams.get("linked") === "google") {
      setBanner({ kind: "ok", text: "Google connected ✓" });
    } else if (searchParams.get("error") === "google_email_mismatch") {
      setBanner({
        kind: "err",
        text: "That was a different Google account. Connect the Google account that uses your FitLog email.",
      });
    } else if (searchParams.get("error") === "link_failed") {
      setBanner({
        kind: "err",
        text: "Couldn't connect Google. Please try again.",
      });
    }
  }, [searchParams]);

  async function addPassword() {
    if (pw.length < 6) {
      setPwMsg("Password must be at least 6 characters.");
      return;
    }
    setPwBusy(true);
    setPwMsg("");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) throw new Error();
      setPwMsg("✅ Password set. You can now log in with email + password.");
      setPw("");
      setShowPw(false);
      load();
    } catch {
      setPwMsg("❌ Could not set password. Try again.");
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
        </span>
        {data?.hasPassword ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Check size={14} /> Enabled
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Add password
          </button>
        )}
      </div>

      {/* Add-password sub-form (Google-only users) */}
      {showPw && !data?.hasPassword && (
        <div className="space-y-2 pl-6">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 6 chars)"
            className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-text-primary focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={addPassword}
            disabled={pwBusy}
            className="w-full py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {pwBusy ? "Saving..." : "Save password"}
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
