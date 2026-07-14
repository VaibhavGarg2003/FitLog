/**
 * Root Layout — The Shell of Every Page
 * ═════════════════════════════════════
 *
 * WHAT IS layout.tsx?
 * ──────────────────
 * In Next.js App Router, layout.tsx wraps ALL pages. It's the
 * outermost shell. Think of it as the <html> and <body> tags
 * plus any "global" things (fonts, providers, metadata).
 *
 * This layout renders ONCE and persists across page navigations.
 * When you navigate from /dashboard to /workout, this layout
 * does NOT re-render — only the inner page content changes.
 * This is why it's fast (no full page reload).
 *
 * WHAT IS `next/font`?
 * ────────────────────
 * Next.js downloads Google Fonts at BUILD time and serves them
 * from your own domain. Benefits:
 * 1. No external network request to fonts.googleapis.com
 * 2. No layout shift (text doesn't jump when font loads)
 * 3. No privacy concern (no request to Google on every visit)
 *
 * WHAT IS metadata?
 * ─────────────────
 * The `metadata` export tells Next.js what to put in the <head>:
 * - <title> — browser tab title
 * - <meta name="description"> — shown in Google search results
 * These are crucial for SEO (Search Engine Optimization).
 */
import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/utils/constants";
import "./globals.css";

// ─── Font Configuration ───────────────────────────────────
// Inter → body text (clean, highly readable at small sizes)
// Outfit → headings (geometric, bold, modern feel)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  // `variable` creates a CSS custom property: --font-inter
  // We reference this in globals.css: font-family: var(--font-inter)
  display: "swap",
  // "swap" → show fallback font immediately, swap to Inter when loaded.
  // "block" → hide text until font loads (causes invisible text flash).
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

// ─── SEO Metadata ─────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
    // template: child pages can set their own title like "Dashboard"
    // and it becomes "Dashboard | FitLog" automatically.
  },
  description: APP_DESCRIPTION,
  // In production, add: openGraph, twitter, icons, manifest
};

// ─── Root Layout Component ────────────────────────────────
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
  // `Readonly<{ children: React.ReactNode }>` — TypeScript says:
  // 1. This component receives `children` (React elements)
  // 2. `Readonly` — you can't accidentally reassign children
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable}`}
      // We add font variables to <html> so they're available
      // to ALL descendants via CSS var(--font-inter).
    >
      <body className="w-full min-h-dvh bg-background">
        <QueryProvider>
          {/* QueryProvider wraps everything so any component
              can use useQuery() / useMutation() hooks */}
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
