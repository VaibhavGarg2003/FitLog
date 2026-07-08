/**
 * cn() — Tailwind Class Merge Utility
 * ════════════════════════════════════
 *
 * WHAT IT DOES:
 * Merges multiple CSS class strings together, and intelligently
 * resolves conflicts. If you pass `bg-red-500` and `bg-blue-500`,
 * normal string concatenation gives you BOTH (browser picks last one,
 * but it's unpredictable). `cn()` keeps only `bg-blue-500`.
 *
 * WHY WE NEED IT:
 * shadcn/ui components accept a `className` prop so you can override
 * their styles. Without `cn()`, your overrides might not work because
 * the component's default classes could conflict with yours.
 *
 * HOW IT WORKS (2 steps):
 * 1. `clsx(...)` — merges classes, handles conditionals
 *    clsx("px-4", isActive && "bg-green-500", undefined) → "px-4 bg-green-500"
 *
 * 2. `twMerge(...)` — resolves Tailwind conflicts
 *    twMerge("px-4 px-6") → "px-6" (last one wins, first removed)
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
