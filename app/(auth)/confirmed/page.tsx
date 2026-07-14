/**
 * Email Confirmation Landing
 * ══════════════════════════
 *
 * Where the "Confirm signup" email link lands. The signup call sets
 * `emailRedirectTo` to this page (see (auth)/signup/page.tsx), so instead of
 * silently dropping the user on the marketing landing page, they get a clear
 * "you're confirmed, here's what to do next" message.
 *
 * Supabase verifies the email server-side BEFORE redirecting here, so simply
 * reaching this page (without an ?error) means the account is now active. This
 * is what makes the cross-device case work: sign up on a laptop, tap Confirm on
 * your phone, and the phone shows this page — no session required, no dead end.
 *
 * Server Component on purpose: we deliberately do NOT create a Supabase browser
 * client here, so nothing tries to auto-exchange tokens from the URL. It is a
 * static message with a way forward.
 */
import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { APP_NAME } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

const primaryButton = cn(
  "w-full py-3 rounded-lg font-semibold",
  "bg-primary text-background hover:bg-primary-hover transition-colors"
);

export default async function ConfirmedPage({
  searchParams,
}: {
  // On failure Supabase appends ?error=...&error_description=... to the redirect.
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const params = await searchParams;
  const failed = Boolean(params.error);

  if (failed) {
    return (
      <div className="text-center space-y-4">
        <AlertCircle className="mx-auto text-danger" size={44} />
        <h1 className="text-xl font-bold">Confirmation link problem</h1>
        <p className="text-text-secondary">
          {params.error_description
            ? decodeURIComponent(params.error_description.replace(/\+/g, " "))
            : "This confirmation link is invalid or has expired."}{" "}
          Sign up again to get a fresh link.
        </p>
        <div className="space-y-2">
          <Link href="/signup" className={primaryButton}>
            Back to sign up
          </Link>
          <Link
            href="/login"
            className="block text-accent hover:underline text-sm"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <CheckCircle2 className="mx-auto text-primary" size={44} />
      <h1 className="text-xl font-bold">Email confirmed 🎉</h1>
      <p className="text-text-secondary">
        Your {APP_NAME} account is now active. Log in to start tracking — you can
        use this device or the one you signed up on.
      </p>
      <Link href="/login" className={primaryButton}>
        Go to login
      </Link>
    </div>
  );
}
