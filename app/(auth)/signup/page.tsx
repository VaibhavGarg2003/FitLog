/**
 * Signup Page
 * ═══════════
 * Server-side signup via /api/auth/signup — tokens never returned to the browser.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, Mail, Lock, User, Globe } from "lucide-react";
import { APP_NAME } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [accountExists, setAccountExists] = useState(false);

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        needsConfirmation?: boolean;
      };

      // Email already registered (possibly via Google) — don't show the
      // "check your email" dead end; guide them to log in / use Google.
      if (data.code === "ACCOUNT_EXISTS") {
        setAccountExists(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Could not create account");
        setLoading(false);
        return;
      }

      // Auto-confirm projects get a session cookie immediately → onboarding
      if (data.needsConfirmation === false) {
        router.push("/onboarding");
        router.refresh();
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function handleGoogleSignup() {
    setLoading(true);
    // New users go to onboarding after Google signup (via callback redirect).
    window.location.href =
      "/api/auth/oauth?provider=google&redirect=" +
      encodeURIComponent("/onboarding");
  }

  if (accountExists) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">👋</div>
        <h2 className="text-xl font-bold">You already have an account</h2>
        <p className="text-text-secondary">
          <strong>{email}</strong> is already registered. Log in instead — if you
          first signed up with Google, use that button.
        </p>
        <button
          type="button"
          onClick={handleGoogleSignup}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
        >
          <Globe size={20} />
          <span className="font-medium">Continue with Google</span>
        </button>
        <Link
          href="/login"
          className="block w-full py-3 rounded-lg font-semibold bg-primary text-background hover:bg-primary-hover transition-colors"
        >
          Go to login
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">📧</div>
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="text-text-secondary">
          We sent a confirmation link to <strong>{email}</strong>.
          Click it to activate your account.
        </p>
        <Link href="/login" className="text-accent hover:underline text-sm">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <Dumbbell className="mx-auto text-primary" size={40} />
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">
          Create your account
        </h1>
        <p className="text-text-secondary">Start tracking with {APP_NAME}</p>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignup}
        disabled={loading}
        className={cn(
          "w-full flex items-center justify-center gap-3 py-3 px-4",
          "bg-surface border border-border rounded-lg",
          "hover:bg-surface-hover transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Globe size={20} />
        <span className="font-medium">Continue with Google</span>
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-muted text-sm">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleEmailSignup} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm text-text-secondary">
            Full name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoComplete="name"
              className={cn(
                "w-full pl-10 pr-4 py-3 rounded-lg",
                "bg-surface border border-border",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent transition-colors"
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="signup-email" className="text-sm text-text-secondary">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className={cn(
                "w-full pl-10 pr-4 py-3 rounded-lg",
                "bg-surface border border-border",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent transition-colors"
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="signup-password" className="text-sm text-text-secondary">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              className={cn(
                "w-full pl-10 pr-4 py-3 rounded-lg",
                "bg-surface border border-border",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent transition-colors"
              )}
            />
          </div>
        </div>

        {error && (
          <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={cn(
            "w-full py-3 rounded-lg font-semibold",
            "bg-primary text-background",
            "hover:bg-primary-hover transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-center text-text-secondary text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
