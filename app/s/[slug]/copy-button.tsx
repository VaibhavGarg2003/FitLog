"use client";

/**
 * Copy-to-account button on the public share page.
 *
 * Logged in  → "Copy to my account" → POST copy → success state.
 * Logged out → "Sign up to save this plan" → /signup?redirect=/s/<slug>,
 *   so after signup they land back here and can copy (value delivered
 *   BEFORE the commitment — the product rule from doc 06).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCopyShare } from "@/lib/hooks/use-share";

export function CopyPlanButton({
  slug,
  isLoggedIn,
}: {
  slug: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const copy = useCopyShare();
  const [copied, setCopied] = useState(false);

  if (!isLoggedIn) {
    return (
      <Link
        href={`/signup?redirect=${encodeURIComponent(`/s/${slug}`)}`}
        className="block w-full text-center py-3.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
      >
        Sign up to save this plan
      </Link>
    );
  }

  if (copied) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-primary text-sm font-medium">
          ✓ Saved to your templates
        </p>
        <button
          type="button"
          onClick={() => router.push("/workout")}
          className="w-full py-3.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
        >
          Go to my workouts
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await copy.mutateAsync(slug);
            setCopied(true);
          } catch {
            // error shown below
          }
        }}
        disabled={copy.isPending}
        className="w-full py-3.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
      >
        {copy.isPending ? "Saving..." : "Copy to my account"}
      </button>
      {copy.isError && (
        <p className="text-sm text-red-400 text-center">
          {copy.error instanceof Error
            ? copy.error.message
            : "Couldn't copy this plan."}
        </p>
      )}
    </div>
  );
}
