/**
 * Auth Layout — Login/Signup Pages
 * ════════════════════════════════
 *
 * No bottom nav. Centered content. Clean, focused UI for auth forms.
 * Logo top-left links back to the marketing landing page.
 */
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { APP_NAME } from "@/lib/utils/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Full-viewport shell; only the form card stays narrow for readability.
    <div className="w-full min-h-dvh bg-background flex flex-col">
      <header className="w-full px-4 sm:px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 shrink-0 hover:opacity-90 transition-opacity"
        >
          <Dumbbell className="text-primary" size={24} />
          <span className="text-lg font-bold font-[family-name:var(--font-outfit)]">
            {APP_NAME}
          </span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
