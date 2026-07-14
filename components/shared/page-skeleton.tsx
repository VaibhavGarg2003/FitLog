/**
 * PageSkeleton — Instant Loading Fallback
 * ════════════════════════════════════════
 *
 * Rendered by each route's `loading.tsx` while Next.js streams in the
 * real page after a navigation. Next.js PREFETCHES this fallback, so it
 * appears the instant the user clicks a nav link — no more "click, freeze,
 * then everything pops in" feeling.
 *
 * It mirrors each page's real header + card layout (same title, same
 * grid/width) so the swap to real content is seamless rather than a jump.
 *
 * Server Component (no "use client") — it's static markup, so it stays
 * lightweight and needs no JS.
 */
import { cn } from "@/lib/utils/cn";

export function PageSkeleton({
  title,
  subtitle,
  columns = 1,
  cards = 3,
}: {
  title: string;
  subtitle?: string;
  /** 2 = multi-column overview pages; 1 = simpler stacked placeholders */
  columns?: 1 | 2;
  cards?: number;
}) {
  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Real title shows immediately; subtitle hints what's loading */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-[family-name:var(--font-outfit)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-text-secondary text-sm mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Pulsing placeholders in the same grid the real page uses */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 lg:gap-5",
          columns === 2 && "lg:grid-cols-2 lg:items-start"
        )}
      >
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="bg-surface rounded-2xl p-6 border border-border animate-pulse h-32 lg:h-40"
          />
        ))}
      </div>
    </div>
  );
}
