# FitLog Step 1 — File Structure + Interview Prep

---

## Part 1: File Structure

```
c:\Fitness_app\
│
├── 📄 proxy.ts                      AUTH GUARD — runs before every page load
│                                    Redirects unauthenticated users to /login
│                                    Redirects logged-in users away from /login
│
├── 📄 prisma.config.ts              PRISMA CLI CONFIG — only used in terminal
│                                    Loads .env.local explicitly
│                                    Points migrations to DIRECT_URL (port 5432)
│
├── 📄 next.config.ts                NEXT.JS CONFIG — build-time settings
│                                    Whitelists image domains (Supabase, Google)
│                                    Wraps config in withSentryConfig()
│
├── 📄 sentry.client.config.ts       ERROR TRACKING — browser errors
├── 📄 sentry.server.config.ts       ERROR TRACKING — server/API route errors
├── 📄 sentry.edge.config.ts         ERROR TRACKING — proxy/edge runtime errors
│
├── 📄 .env.local                    REAL SECRETS — never committed to Git
│                                    Supabase URL, anon key, DB passwords
│
├── 📄 .env.local.example            TEMPLATE — committed to Git (no real values)
│                                    Shows developers which variables to fill
│
├── 📄 .gitignore                    Prevents node_modules, .env.local,
│                                    .next/ from going to GitHub
│
├── 📄 package.json                  Project name, all libraries, npm scripts
├── 📄 tsconfig.json                 TypeScript config + @/ path alias
├── 📄 postcss.config.mjs            Enables Tailwind CSS processing
├── 📄 eslint.config.mjs             Code quality rules
│
│
├── 📁 prisma/
│   ├── 📄 schema.prisma             DATABASE BLUEPRINT
│   │                                15 models (tables), 14 enums
│   │                                All relationships defined here
│   │                                Source of generated TypeScript types
│   │
│   └── 📁 migrations/
│       └── 📁 20260703_init/
│           └── 📄 migration.sql    Auto-generated SQL (CREATE TABLE statements)
│                                   Created when you ran: npx prisma migrate dev
│
│
├── 📁 app/
│   │
│   ├── 📄 globals.css              DESIGN SYSTEM
│   │                               CSS variables for all colors (dark mode)
│   │                               @theme block → registers colors into Tailwind
│   │                               Base resets, font defaults
│   │
│   ├── 📄 layout.tsx               ROOT LAYOUT — wraps the ENTIRE app
│   │                               <html> and <body> tags live here
│   │                               Loads Inter + Outfit fonts
│   │                               Wraps everything in <QueryProvider>
│   │
│   ├── 📄 page.tsx                 LANDING PAGE → URL: /
│   │                               Server Component (no "use client")
│   │                               Checks if user is already logged in
│   │                               If logged in → redirect to /dashboard
│   │
│   ├── 📁 (app)/                   ROUTE GROUP: authenticated pages
│   │   │                           (app) does NOT appear in the URL
│   │   │
│   │   ├── 📄 layout.tsx           APP SHELL LAYOUT
│   │   │                           Renders <BottomNav> at the bottom
│   │   │                           Adds padding so content doesn't hide behind nav
│   │   │
│   │   ├── 📁 dashboard/
│   │   │   └── 📄 page.tsx         URL: /dashboard — placeholder (Step 3)
│   │   ├── 📁 workout/
│   │   │   └── 📄 page.tsx         URL: /workout — placeholder (Step 3)
│   │   ├── 📁 nutrition/
│   │   │   └── 📄 page.tsx         URL: /nutrition — placeholder (Step 3)
│   │   ├── 📁 progress/
│   │   │   └── 📄 page.tsx         URL: /progress — placeholder (Step 3)
│   │   ├── 📁 settings/
│   │   │   └── 📄 page.tsx         URL: /settings — placeholder (Step 3)
│   │   └── 📁 onboarding/
│   │       └── 📄 page.tsx         URL: /onboarding — placeholder (Step 2)
│   │
│   ├── 📁 (auth)/                  ROUTE GROUP: unauthenticated pages
│   │   │
│   │   ├── 📄 layout.tsx           AUTH LAYOUT
│   │   │                           Centers content on screen
│   │   │                           No bottom nav (user is not logged in yet)
│   │   │
│   │   ├── 📁 login/
│   │   │   ├── 📄 page.tsx         URL: /login — SERVER component
│   │   │   │                       Only purpose: wrap login-form in <Suspense>
│   │   │   │                       Required because useSearchParams() needs Suspense
│   │   │   │
│   │   │   └── 📄 login-form.tsx   CLIENT component ("use client")
│   │   │                           Actual login form logic lives here
│   │   │                           useState: email, password, loading, error
│   │   │                           useSearchParams: reads ?redirect= from URL
│   │   │                           useRouter: navigates after success
│   │   │                           Calls supabase.auth.signInWithPassword()
│   │   │                           Calls supabase.auth.signInWithOAuth()
│   │   │
│   │   └── 📁 signup/
│   │       └── 📄 page.tsx         URL: /signup
│   │                               Calls supabase.auth.signUp()
│   │
│   └── 📁 auth/                    NOTE: no parentheses — this IS in the URL
│       └── 📁 callback/
│           └── 📄 route.ts         URL: /auth/callback — SERVER only, no UI
│                                   Google sends user here after they log in
│                                   Exchanges ?code= for a real Supabase session
│                                   Redirects to /dashboard on success
│
│
├── 📁 lib/
│   │
│   ├── 📁 supabase/
│   │   ├── 📄 client.ts            BROWSER SUPABASE CLIENT
│   │   │                           Used for auth only in browser
│   │   │                           NEVER for database queries
│   │   │                           createBrowserClient() from @supabase/ssr
│   │   │
│   │   ├── 📄 server.ts            SERVER SUPABASE CLIENT
│   │   │                           Used in Server Components, API routes
│   │   │                           Reads/writes cookies for session management
│   │   │                           createServerClient() from @supabase/ssr
│   │   │
│   │   ├── 📄 middleware.ts        SESSION REFRESH HELPER
│   │   │                           Called by proxy.ts on every request
│   │   │                           Validates session token
│   │   │                           Returns {user, supabaseResponse}
│   │   │
│   │   └── 📄 prisma.ts            PRISMA SINGLETON
│   │                               Creates pg connection pool (DATABASE_URL)
│   │                               Creates PrismaPg adapter (Prisma 7 requirement)
│   │                               Stores client in globalThis (survives hot reload)
│   │                               All repositories will import `prisma` from here
│   │
│   └── 📁 utils/
│       ├── 📄 cn.ts                CLASS NAME MERGER
│       │                           Combines clsx + tailwind-merge
│       │                           Resolves conflicting Tailwind classes
│       │                           Used in every component file
│       │
│       └── 📄 constants.ts         SINGLE SOURCE OF TRUTH
│                                   APP_NAME = "FitLog"
│                                   NAV_ITEMS = 5 nav tabs with icons + routes
│                                   SAFETY_CALORIES = minimum safe thresholds
│
│
├── 📁 components/
│   ├── 📁 providers/
│   │   └── 📄 query-provider.tsx   TANSTACK QUERY SETUP
│   │                               Creates QueryClient with default settings
│   │                               Wraps children in <QueryClientProvider>
│   │                               Must be "use client" (uses React Context)
│   │                               Imported by app/layout.tsx
│   │
│   └── 📁 shared/
│       └── 📄 bottom-nav.tsx       BOTTOM NAVIGATION BAR
│                                   Reads NAV_ITEMS from constants.ts
│                                   usePathname() → knows active tab
│                                   Highlights active tab with green color
│                                   Next.js <Link> → no full page reload
│
│
├── 📁 stores/
│   └── 📄 ui-store.ts              ZUSTAND UI STATE
│                                   selectedDate (shared across all pages)
│                                   setSelectedDate() function
│                                   activeWorkoutId (if workout in progress)
│
│
└── 📁 .github/
    └── 📁 workflows/
        └── 📄 ci.yml               CI/CD PIPELINE
                                    Runs on every GitHub push
                                    Step 1: npm install
                                    Step 2: npm run lint
                                    Step 3: tsc --noEmit (type check)
                                    Step 4: npm run build
                                    All must pass before Vercel deploys
```

---

### How Files Connect to Each Other

```
proxy.ts
  └── imports updateSession() from lib/supabase/middleware.ts

app/layout.tsx
  └── imports <QueryProvider> from components/providers/query-provider.tsx
  └── imports globals.css

app/(app)/layout.tsx
  └── imports <BottomNav> from components/shared/bottom-nav.tsx

components/shared/bottom-nav.tsx
  └── imports NAV_ITEMS from lib/utils/constants.ts
  └── uses cn() from lib/utils/cn.ts

app/(auth)/login/page.tsx
  └── wraps login-form.tsx in <Suspense>

app/(auth)/login/login-form.tsx
  └── imports createClient from lib/supabase/client.ts
  └── imports APP_NAME from lib/utils/constants.ts
  └── uses cn() from lib/utils/cn.ts

app/auth/callback/route.ts
  └── imports createClient from lib/supabase/server.ts

app/page.tsx
  └── imports createClient from lib/supabase/server.ts

prisma.config.ts
  └── reads DIRECT_URL from .env.local
  └── reads schema from prisma/schema.prisma

lib/supabase/prisma.ts
  └── reads DATABASE_URL from .env.local
  └── will be imported by ALL repositories in Step 2+
```

---
---

## Part 2: Interview Questions — "What If This Goes Wrong?"

---

### Category 1: Authentication & Security

---

**Q: What happens if proxy.ts fails? Every user gets locked out?**

Yes, and this is the most critical failure point in the app. The proxy runs before every request. If it throws an unhandled error, Next.js crashes the request.

The protection we have:
- The proxy uses `try/catch` inside `updateSession()`. If Supabase is unreachable, it returns `user = null` instead of crashing, which means unauthenticated users get redirected to login (safe degradation) rather than everyone getting a 500 error.
- Sentry's edge config (`sentry.edge.config.ts`) catches proxy errors and alerts us immediately.

What you'd fix first: Check if Supabase is down (status.supabase.com), then check if `NEXT_PUBLIC_SUPABASE_URL` is correctly set in your environment variables.

---

**Q: What if the Supabase anon key is leaked publicly?**

The anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is intentionally public. It is designed to be safe to expose. It only allows actions that your Row Level Security (RLS) policies permit — which is nothing by default without an authenticated user.

The real secret to protect is your **database password** (in `DATABASE_URL`). That is server-only, never `NEXT_PUBLIC_`, and never goes to the browser.

If the database password leaked: rotate it immediately in Supabase → Project Settings → Database → Reset password, then update `.env.local` and redeploy.

---

**Q: What if a user bypasses the login page and directly hits `/dashboard`?**

They cannot access real data, even if they somehow bypassed the proxy redirect. There are two walls:

- **Wall 1 (proxy.ts)**: Redirects them to `/login` before the page even renders.
- **Wall 2 (API routes)**: Every API route in Step 2+ independently calls `supabase.auth.getUser()`. If there is no valid session, the API returns a 401. No data is ever returned.
- **Wall 3 (RLS)**: Even if someone made a direct database query using the anon key, Supabase's Row Level Security policies (`user_id = auth.uid()`) return zero rows because there is no authenticated `auth.uid()`.

Three independent layers. All three must fail simultaneously for data to leak.

---

**Q: What if Google OAuth stops working — your entire login is broken?**

This is a real risk of relying on a single OAuth provider. Our mitigation:
- We always have **email/password login as a fallback**. Google OAuth goes down, users still log in with email.
- The error is caught in `login-form.tsx` and displayed to the user immediately with a clear message.
- Sentry captures the error with full context.

Long-term fix: add a second provider (GitHub, Apple) as additional fallback.

---

### Category 2: Database

---

**Q: What if Prisma runs out of database connections?**

In a serverless environment like Vercel, every function invocation could create a new `PrismaClient`. Without a singleton, you'd open a new connection pool on every API call. With 100 concurrent users, you'd have 100 connection pools, each with up to 5 connections = 500 connections. Supabase free tier allows ~20.

**Solution we implemented**: The singleton pattern in `lib/supabase/prisma.ts`. The client is stored in `globalThis`. Every API call reuses the same pool instead of creating a new one.

**If it still happens**: The error looks like `FATAL: too many connections for role`. Fix: either increase pool size limit in Supabase dashboard, or reduce `max` connections in the Pool config in `prisma.ts`.

---

**Q: What if a Prisma migration fails halfway through? Your database is now in an inconsistent state.**

Prisma wraps every migration in a **database transaction**. If any SQL statement inside the migration fails, the entire migration is rolled back automatically. Your database returns to the exact state before the migration started.

You would see an error in the terminal and a failed migration entry in the `_prisma_migrations` table. To fix: resolve the schema error and run `npx prisma migrate dev` again. Prisma only applies the failed migration again, not all previous ones.

The dangerous scenario is if the transaction itself fails midway at the database level (network disconnection). In that case, you may need to run `npx prisma migrate resolve --rolled-back <migration-name>` to tell Prisma the migration failed, then retry.

---

**Q: What if someone edits the `schema.prisma` file directly in production?**

Editing the schema file does nothing on its own. The schema is just a TypeScript-like text file. Actual database changes only happen when you run `npx prisma migrate dev` (which generates and applies SQL). The production database is never automatically changed.

This separation is intentional — it is the safety valve between code and data.

---

**Q: The DIRECT_URL and DATABASE_URL — what's the difference and what breaks if you mix them up?**

| | DATABASE_URL | DIRECT_URL |
|---|---|---|
| Port | 6543 | 5432 |
| Goes through | PgBouncer (pooler) | Direct PostgreSQL |
| Used for | App queries at runtime | Migrations only |
| Supports DDL? | No | Yes |

If you use DATABASE_URL for migrations: they fail with "prepared statement already exists" because PgBouncer's transaction mode doesn't support the full SQL that migrations need.

If you use DIRECT_URL for app queries: you bypass the connection pooler. Under load, you open too many direct connections and hit the database connection limit.

---

### Category 3: Frontend Architecture

---

**Q: Why does the login page have two files (page.tsx and login-form.tsx)? Why not one file?**

The constraint is `useSearchParams()`. This hook reads the `?redirect=` from the URL (so after login, the user goes back to where they were trying to go).

`useSearchParams()` can only run in a Client Component. But during `npm run build`, Next.js pre-renders pages as static HTML on a server that has no URL. So it cannot execute `useSearchParams()` at build time — it crashes.

The fix is: put `useSearchParams()` inside a Client Component (`login-form.tsx`), and wrap that component in `<Suspense>` inside the page (`page.tsx`). The `<Suspense>` tells Next.js: "This part of the page will be resolved in the browser, not at build time." Build passes, feature works.

**Interview answer**: This is the official Next.js pattern for any hook that reads browser-specific data (URL, window, localStorage) in a page that would otherwise be statically generated.

---

**Q: What is the difference between `(app)` and `auth` folders in the `app/` directory?**

`(app)` and `(auth)` — with parentheses — are **route groups**. The parentheses mean the folder name is completely invisible in the URL. `/app/(app)/dashboard/page.tsx` maps to the URL `/dashboard`, not `/app/dashboard`.

`auth/` — without parentheses — is a **real URL segment**. `/app/auth/callback/route.ts` maps to the URL `/auth/callback`. This is intentional because Google needs to redirect to a real URL after OAuth.

Route groups exist purely for code organization — to share layouts between related pages without affecting URLs.

---

**Q: What happens if you put a bug in globals.css that breaks all colors?**

Every single Tailwind color class in every component (`bg-primary`, `text-accent`, etc.) reads from CSS variables defined in `globals.css`. If you delete or mistype a variable, every element using that color goes transparent or inherits a browser default.

The good news: this is immediately visible. You open the app and it looks broken. ESLint and TypeScript don't catch CSS errors, but your eyes do.

Prevention: never delete a CSS variable — only change its value. If you want to test a new color, change the value and observe, then revert if needed.

---

**Q: What if TanStack Query's QueryProvider is accidentally removed from the root layout?**

Every component in the app that calls `useQuery()` or `useMutation()` will throw:
```
Error: No QueryClient set, use QueryClientProvider to set one
```

The entire app crashes on any page that fetches data (which is all of them in Step 3+).

Prevention: The QueryProvider is in `app/layout.tsx` which is the outermost file. It wraps everything. Changes to this file affect the entire app, so it should be treated as the most critical file after `proxy.ts`.

---

### Category 4: CI/CD & Deployment

---

**Q: What if someone pushes broken TypeScript to GitHub — does it go live?**

No. The CI pipeline (`ci.yml`) runs `tsc --noEmit` on every push. If TypeScript has any type errors, the pipeline fails. GitHub marks the commit as failed, and Vercel's deployment is blocked until the pipeline passes.

This is exactly why we set up CI before writing any features — to make this guarantee permanent.

---

**Q: What if Vercel deployment fails but CI passes?**

CI runs on GitHub's servers with a clean install. Vercel runs `npm run build` on its own servers. The most common cause of "CI passes but Vercel fails" is an environment variable missing on Vercel.

Diagnosis: Go to Vercel dashboard → your project → Settings → Environment Variables. Make sure all variables from `.env.local` are added there. The most commonly forgotten ones are `DATABASE_URL` and `DIRECT_URL`.

---

**Q: What if Sentry is not configured — how do you find production errors?**

You rely entirely on users reporting bugs. You have no stack traces, no context, no frequency data. You are debugging blind.

This is the exact reason Sentry was set up in Step 1 before any features. The three config files (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) ensure that from the very first line of feature code written in Step 3, all errors are automatically captured with full context (user, URL, stack trace, breadcrumbs of what they did before the error).
