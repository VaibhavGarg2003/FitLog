# FitLog Step 1 — Edge Cases, Gotchas, and Debugging

Things that will break (or already broke) and how to handle them.
This is your troubleshooting reference.

---

## 🐛 Problems We Encountered During Setup

### 1. npm naming restriction (Capital letters in directory name)
```
Error: Could not create a project called "Fitness_app" because of npm
naming restrictions: name can no longer contain capital letters
```
**Root Cause:** npm package names must be lowercase. `create-next-app` uses 
the directory name as the package name.

**Solution:** Create in a temp subfolder (`fitlog-init/`), move files up, 
then fix `package.json` name manually.

**Future Prevention:** Always use lowercase, hyphenated directory names 
for Node.js projects (`fitlog`, `my-app`, not `MyApp` or `Fitness_App`).

---

### 2. Prisma 7 removed `url` from schema.prisma
```
Error: The datasource property `url` is no longer supported in schema files.
Move connection URLs to `prisma.config.ts`.
```
**Root Cause:** Prisma 7 (June 2025) redesigned connection management.
The schema file now ONLY defines your data model. Connection logic goes
in `prisma.config.ts` (for CLI) and driver adapters (for runtime).

**What changed:**
| Feature | Prisma 6 | Prisma 7 |
|---------|----------|----------|
| Connection URL | In `schema.prisma` | In `prisma.config.ts` |
| Client creation | `new PrismaClient()` | `new PrismaClient({ adapter })` |
| Package needed | Just `@prisma/client` | Also `@prisma/adapter-pg` + `pg` |

**Debugging tip:** If you see `PrismaClient constructor must receive an adapter`,
it means you forgot to pass the driver adapter.

---

### 3. Lucide React icon naming changes
```
Error: '"lucide-react"' has no exported member named 'Chrome'
```
**Root Cause:** Lucide regularly adds/removes/renames icons. The `Chrome` 
icon was removed. Brand icons are being phased out of lucide.

**How to debug:** 
```bash
node -e "const l = require('lucide-react'); console.log(Object.keys(l).filter(k => k.toLowerCase().includes('your-search')))"
```

**Future Prevention:** Don't rely on brand-specific icons (Chrome, Google, 
Facebook). Use generic alternatives (Globe, ExternalLink, LogIn).

---

### 4. useSearchParams requires Suspense boundary
```
Error: useSearchParams() should be wrapped in a suspense boundary at page "/login"
```
**Root Cause:** During static generation (build time), Next.js doesn't know 
the URL search params (they're browser-only). `useSearchParams()` causes 
the page to "bail out" of static generation. Next.js requires you to wrap 
it in `<Suspense>` so it can show a fallback while the browser resolves params.

**Pattern to follow:**
```tsx
// page.tsx (Server Component — no "use client")
import { Suspense } from "react";
import { MyForm } from "./my-form";

export default function Page() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <MyForm />
    </Suspense>
  );
}

// my-form.tsx ("use client" — uses useSearchParams)
"use client";
import { useSearchParams } from "next/navigation";
export function MyForm() {
  const params = useSearchParams();
  // ...
}
```

**Rule:** Any component using `useSearchParams()`, `useRouter()` push with 
search params, or reading URL state should be in its own client component 
wrapped in Suspense.

---

### 5. middleware.ts → proxy.ts (Next.js 16)
```
Warning: The "middleware" file convention is deprecated. Please use "proxy" instead.
```
**Root Cause:** Next.js 16 renamed the concept. "Middleware" was confused 
with Express middleware (which is inline, per-route). Next.js "proxy" is 
more like a reverse proxy (sits in front of your app, intercepts requests).

**Migration:** Rename `middleware.ts` → `proxy.ts`, rename function 
`middleware()` → `proxy()`. Everything else stays the same.

---

## ⚠️ Future Edge Cases to Watch For

### 6. Supabase session cookies and SSR
**Scenario:** User is logged in, but the server says they're not.

**Common causes:**
- Cookies not being forwarded correctly in fetch calls
- Using `getSession()` instead of `getUser()` (getSession doesn't validate)
- Middleware not refreshing the session token

**Debug:** Check browser DevTools → Application → Cookies for `sb-*` cookies.
If they exist but API routes say "not authenticated", the issue is in how 
you're creating the server Supabase client.

---

### 7. Prisma connection exhaustion in development
**Scenario:** After many file saves, you get:
```
Error: Too many clients already
```

**Root Cause:** Every hot-reload creates a new PrismaClient (new DB connection).
After ~20 reloads, you exhaust the database connection limit.

**Solution:** We already handle this with the singleton pattern in 
`lib/supabase/prisma.ts`. It stores the client in `globalThis` so it 
survives hot-reloads.

**If it still happens:** Restart your dev server (`Ctrl+C`, then `npm run dev`).
Each restart clears `globalThis` and starts fresh with one connection.

---

### 8. Tailwind classes not applying
**Scenario:** You add `bg-primary` but the element has no background color.

**Possible causes:**
1. The color is not defined in `@theme` in globals.css
2. There's a CSS specificity conflict (another rule overrides it)
3. The class is in a conditional that evaluates to false
4. You're using a dynamic class string that Tailwind can't detect at build time

```tsx
// ❌ BAD — Tailwind can't detect dynamic classes
const color = isActive ? "primary" : "muted";
<div className={`bg-${color}`} />  // Tailwind purges this!

// ✅ GOOD — full class names for Tailwind to find
<div className={isActive ? "bg-primary" : "bg-text-muted"} />
```

**Debug:** Inspect element in browser DevTools. If the class is there but 
no styles apply, it's a Tailwind config issue. If the class is missing, 
it's a code logic issue.

---

### 9. Route groups and layout nesting
**Scenario:** Your layout doesn't apply to the pages you expect.

**Rule:** Layouts wrap ALL pages in their folder AND subfolders.
```
app/
├── layout.tsx          → Wraps EVERYTHING
├── (app)/
│   ├── layout.tsx      → Wraps /dashboard, /workout, etc.
│   └── dashboard/
│       └── page.tsx
├── (auth)/
│   ├── layout.tsx      → Wraps /login, /signup only
│   └── login/
│       └── page.tsx
```

**Gotcha:** If you put a page directly in `app/` (not in a route group), 
it uses the root layout but NOT the (app) or (auth) layouts.

---

### 10. Environment variable mistakes
**Scenario:** API calls fail with "Supabase URL is required" errors.

**Rules:**
| Variable | Available in | When to use |
|----------|-------------|-------------|
| `NEXT_PUBLIC_*` | Browser + Server | Safe public config (Supabase URL, anon key) |
| No prefix | Server ONLY | Secrets (DB password, API keys, Sentry DSN) |

```tsx
// ❌ This will be UNDEFINED in the browser:
process.env.DATABASE_URL  // server-only var in client component

// ✅ This works in the browser:
process.env.NEXT_PUBLIC_SUPABASE_URL  // prefixed with NEXT_PUBLIC_
```

**Debug:** `console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)` in a client 
component. If it's `undefined`, you either:
1. Didn't create `.env.local` (copy from `.env.local.example`)
2. Didn't restart the dev server after adding env vars
3. Forgot the `NEXT_PUBLIC_` prefix

---

### 11. The "hydration mismatch" error
**Scenario:** Console shows "Text content does not match server-rendered HTML."

**Root Cause:** Server rendered one thing, browser rendered something different.
Common triggers:
- Using `new Date()` (server time ≠ browser time)
- Using `Math.random()` (different on server vs browser)
- Using `window.innerWidth` (doesn't exist on server)
- Using browser-only APIs in Server Components

**Our solution:** We use `new Date().toISOString().split("T")[0]` in the 
Zustand store (client-only), not in server components. The date is always 
determined client-side.

---

### 12. Sentry config — "disableLogger is deprecated"
```
DEPRECATION WARNING: disableLogger is deprecated. Use 
webpack.treeshake.removeDebugLogging instead.
```
**Status:** Warning only, not breaking. The Sentry Next.js SDK is updating 
its config API. Our current setup works. When Sentry releases the next 
major version, update the config to use the new API.

**No action needed now.** Just know it'll change in the future.
