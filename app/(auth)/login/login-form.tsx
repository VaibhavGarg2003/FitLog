/**
 * Login Form — Client Component
 * ═════════════════════════════
 *
 * "use client" — uses browser APIs (useState, useSearchParams, supabase.auth).
 *
 * This is separated from page.tsx because useSearchParams() needs
 * to be inside a Suspense boundary. The page.tsx provides that boundary.
 */
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Mail, Lock, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${redirectTo}`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <Dumbbell className="mx-auto text-primary" size={40} />
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">
          Welcome back
        </h1>
        <p className="text-text-secondary">Log in to {APP_NAME}</p>
      </div>

      {/* Google OAuth */}
      <button
        onClick={handleGoogleLogin}
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

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-muted text-sm">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm text-text-secondary">
            Email
          </label>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              size={18}
            />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={cn(
                "w-full pl-10 pr-4 py-3 rounded-lg",
                "bg-surface border border-border",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent",
                "transition-colors"
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm text-text-secondary">
            Password
          </label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              size={18}
            />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className={cn(
                "w-full pl-10 pr-4 py-3 rounded-lg",
                "bg-surface border border-border",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent",
                "transition-colors"
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
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {/* Signup Link */}
      <p className="text-center text-text-secondary text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
