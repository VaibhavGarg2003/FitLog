/**
 * Top Navigation Header — Responsive App Bar
 * ═══════════════════════════════════════════
 *
 * ONE header, two jobs, split by screen width:
 *
 * 1. LOGO (always visible) — links to "/" (the landing page).
 *    On phones this is the ONLY thing shown: a slim "back to home"
 *    bar. On laptops it's the left side of a full nav bar.
 *
 * 2. NAV LINKS (`hidden lg:flex`) — Dashboard / Workout / Nutrition /
 *    Progress / Settings, shown only at ≥1024px. Below that the
 *    BottomNav tab bar handles navigation (thumb-friendly on mobile).
 *
 * WHY CSS BREAKPOINTS, NOT JS?
 * ───────────────────────────
 * Both this header and BottomNav render in the HTML; Tailwind's `lg:`
 * classes decide which is visible. No `window.innerWidth`, so no
 * hydration mismatch and no flash on load — the SSR-correct pattern.
 *
 * The links come from the same NAV_ITEMS array BottomNav uses, so the
 * two bars can never drift out of sync.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { APP_NAME, NAV_ITEMS } from "@/lib/utils/constants";

export function TopNav() {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        // Stays pinned to the top while the page scrolls
        "sticky top-0 z-40",
        // Glassmorphism — matches BottomNav's treatment
        "bg-surface/80 backdrop-blur-xl",
        "border-b border-border"
      )}
    >
      {/* Width-matched to the page content container in (app)/layout.tsx */}
      <div className="flex items-center justify-between h-14 px-4 lg:px-6 max-w-lg lg:max-w-5xl mx-auto">
        {/* Logo → landing page. This is the mobile "home" affordance. */}
        <Link href="/" className="flex items-center gap-2">
          <Dumbbell className="text-primary" size={24} />
          <span className="text-lg font-bold font-[family-name:var(--font-outfit)]">
            {APP_NAME}
          </span>
        </Link>

        {/* Desktop nav links — hidden on phones/tablets (< lg) */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            // /workout/123 should still highlight the Workout link.
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
