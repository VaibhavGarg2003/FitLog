/**
 * Bottom Navigation Component
 * ═══════════════════════════
 *
 * WHAT THIS IS:
 * A mobile-first bottom navigation bar (like Instagram, YouTube).
 * Fixed at the bottom of the screen. 5 tabs: Dashboard, Workout,
 * Nutrition, Progress, Settings.
 *
 * WHY BOTTOM NAV (NOT TOP)?
 * ─────────────────────────
 * Most FitLog users are on mobile, logging workouts at the gym.
 * Bottom nav is reachable with one thumb. Top nav requires
 * reaching to the top of a tall phone screen — bad ergonomics.
 *
 * CONCEPTS IN THIS FILE:
 * ──────────────────────
 * 1. `usePathname()` — Next.js hook that returns the current URL path.
 *    Used to highlight the active tab. If URL is /dashboard,
 *    the Dashboard tab gets the active styling.
 *
 * 2. Dynamic imports — Lucide icons are imported by NAME from the
 *    icons object. This lets us define icon names in constants.ts
 *    and render them dynamically without a giant switch statement.
 *
 * 3. `cn()` — our Tailwind merge utility for conditional classes.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  UtensilsCrossed,
  TrendingUp,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS } from "@/lib/utils/constants";

// Map icon names (strings) to actual React components.
// This lookup table lets us use string icon names from constants.ts.
const iconMap = {
  LayoutDashboard,
  Dumbbell,
  UtensilsCrossed,
  TrendingUp,
  Settings,
} as const;

export function BottomNav() {
  const pathname = usePathname();
  // pathname = "/dashboard" or "/workout/123" etc.

  return (
    <nav
      className={cn(
        // Fixed at the bottom of the viewport. Always visible.
        "fixed bottom-0 left-0 right-0 z-50",
        // Glassmorphism effect — semi-transparent with blur
        "bg-surface/80 backdrop-blur-xl",
        // Top border for visual separation from page content
        "border-t border-border",
        // Safe area padding for phones with notches/gesture bars
        // (iPhone home indicator, Android gesture area)
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map((item) => {
          // Check if this tab is currently active.
          // /workout/123 should highlight the Workout tab.
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          // Look up the icon component from our map
          const Icon = iconMap[item.icon as keyof typeof iconMap];

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                // Base styles — flex column, centered, tap target
                "flex flex-col items-center justify-center gap-1",
                "w-full h-full",
                // Smooth color transition on tab switch
                "transition-colors duration-200",
                // Active vs inactive colors
                isActive
                  ? "text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.5}
                // Active tab gets thicker icon strokes — subtle but noticeable
              />
              <span className="text-[10px] font-medium">{item.label}</span>
              {/* text-[10px] — Tailwind arbitrary value.
                  When you need a size that's not in the default scale,
                  wrap it in brackets. 10px is smaller than text-xs (12px). */}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
