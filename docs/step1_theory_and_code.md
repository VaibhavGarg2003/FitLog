# FitLog Step 1 — What You Need to Know (Theory + Code)

This file teaches you the KEY concepts behind every technology we just set up.
Not everything — just the things that matter for understanding the codebase.

---

## 1. Next.js App Router — The Backbone

### What It Is
Next.js is a FRAMEWORK built on top of React. React alone can only create client-side apps (everything runs in the browser). Next.js adds:
- **Server-Side Rendering (SSR)** — HTML is built on the server, sent ready-to-view
- **File-based routing** — folders in `app/` become URL paths automatically
- **API routes** — backend endpoints inside the same project (no separate Express server)

### The Routing Mental Model
```
app/
├── page.tsx              → URL: /          (landing page)
├── (app)/                → Route GROUP (no URL segment)
│   ├── layout.tsx        → Wraps all (app) children
│   ├── dashboard/
│   │   └── page.tsx      → URL: /dashboard
│   └── workout/
│       └── page.tsx      → URL: /workout
├── (auth)/               → Another route group
│   ├── layout.tsx        → Wraps login/signup only
│   └── login/
│       └── page.tsx      → URL: /login
└── auth/
    └── callback/
        └── route.ts      → URL: /auth/callback (API route, not a page)
```

**Key Rules:**
- `page.tsx` = a PAGE the user sees
- `route.ts` = an API ENDPOINT (server-side only, no HTML)
- `layout.tsx` = a WRAPPER that persists across navigation
- `(parentheses)` = route groups — organize code WITHOUT changing URLs

### Server Components vs Client Components
```
┌──────────────────────────────────────────────────────┐
│  DEFAULT: Server Component                            │
│  - Runs on the server                                │
│  - Can access database, env vars, file system        │
│  - CANNOT use useState, useEffect, onClick           │
│  - Output: pure HTML sent to browser                 │
├──────────────────────────────────────────────────────┤
│  "use client": Client Component                       │
│  - Runs in the browser                               │
│  - CAN use hooks (useState, useEffect, etc.)         │
│  - CAN handle user interactions (onClick, etc.)      │
│  - CANNOT directly access database or env vars       │
│  - Ships JavaScript to the browser                   │
└──────────────────────────────────────────────────────┘
```

**Rule of thumb:** Keep things as Server Components unless you NEED interactivity.
Server Components = less JavaScript shipped to the browser = faster page loads.

---

## 2. TypeScript — Why Types Matter

TypeScript adds TYPES to JavaScript. Instead of discovering bugs at runtime
("Cannot read property 'name' of undefined"), TypeScript catches them at
compile time (red underline in your editor).

### The Key Patterns We Use

```typescript
// 1. Interface — defines the SHAPE of an object
interface User {
  id: string;
  name: string;
  email: string;
  age?: number;     // ? means optional (can be undefined)
}

// 2. Type inference — TS figures out the type automatically
const count = 5;              // TS knows: number
const name = "FitLog";        // TS knows: string

// 3. Generics — types that work with ANY type
function getFirst<T>(arr: T[]): T {
  return arr[0];
}
getFirst<number>([1, 2, 3]);  // returns number
getFirst<string>(["a", "b"]); // returns string
// TanStack Query uses this: useQuery<Workout[]>()

// 4. as const — makes values READONLY and literal
const ROUTES = {
  dashboard: "/dashboard",
  workout: "/workout",
} as const;
// Without as const: ROUTES.dashboard is type `string`
// With as const:    ROUTES.dashboard is type `"/dashboard"` (exact literal)
// Benefit: typos are caught at compile time

// 5. Readonly<T> — prevents accidental mutation
function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // children = ... ← TypeScript ERROR: cannot reassign
}
```

---

## 3. The Data Flow Architecture

This is the MOST important concept. It governs how data moves in FitLog.

```
BROWSER                          SERVER                         DATABASE
───────                          ──────                         ────────
React Component                  API Route / Server Action       PostgreSQL
  │                                │                              │
  │ 1. fetch('/api/meals')         │                              │
  │ ───────────────────────────►   │                              │
  │    (via TanStack Query)        │                              │
  │                                │ 2. Validate auth (Supabase)  │
  │                                │ 3. Validate input (Zod)      │
  │                                │ 4. Call Service layer         │
  │                                │    │                         │
  │                                │    ▼                         │
  │                                │  Service                     │
  │                                │    │ Business logic           │
  │                                │    │ (calorie calculations)  │
  │                                │    ▼                         │
  │                                │  Repository                  │
  │                                │    │ Data access (Prisma)    │
  │                                │    │                         │
  │                                │    │ prisma.meal.findMany()  │
  │                                │    ├────────────────────────►│
  │                                │    │◄───────── rows ─────────│
  │                                │    │                         │
  │                                │◄───┘ formatted data          │
  │ ◄──────────── JSON ────────────│                              │
  │                                │                              │
  │ 5. TanStack Query caches it    │                              │
  │ 6. React renders the UI        │                              │
```

### Why NOT call the database directly from the browser?
```
❌ BAD:  Browser → supabase.from('meals').select() → Database
✅ GOOD: Browser → API Route → Service → Repository → Database
```

Reasons:
1. **Security**: API route validates auth + input. Browser can be tampered with.
2. **Business logic**: Calorie calculations, PR detection happen in the Service layer.
3. **Flexibility**: Change database without changing the UI code.
4. **Testability**: Services can be unit tested without a browser.

---

## 4. React Hooks — The Ones We Use

```typescript
// useState — stores a value that changes over time
const [count, setCount] = useState(0);
// count = current value (0 initially)
// setCount = function to update it
// When setCount is called, React RE-RENDERS the component

// useEffect — runs code AFTER render (side effects)
useEffect(() => {
  document.title = `${count} clicks`;
}, [count]);
// The [count] array = "only re-run when count changes"
// Empty [] = "run once on mount"
// No array = "run after every render" (usually a mistake)

// useRouter — navigate programmatically
const router = useRouter();
router.push("/dashboard");   // navigate to /dashboard
router.refresh();            // re-run server components

// usePathname — get the current URL path
const pathname = usePathname();
// pathname = "/dashboard" or "/workout/123" etc.
```

---

## 5. Async/Await in Our Codebase

Almost EVERYTHING in FitLog is async because:
- Database queries take time (network request to Supabase)
- Auth validation takes time (JWT verification with Supabase)
- API calls take time (browser → server)

```typescript
// PATTERN: async function with try-catch
async function handleEmailLogin(e: React.FormEvent) {
  e.preventDefault();      // Stop form's default behavior
  setLoading(true);        // Show spinner
  setError(null);          // Clear previous error

  // await = "pause here until this finishes"
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setError(error.message);
    setLoading(false);
    return;               // Early return — don't execute the rest
  }

  router.push(redirectTo);
  router.refresh();
}

// DESTRUCTURING IN ASYNC:
// const { error } = await supabase.auth.signInWithPassword(...)
// The function returns { data: {...}, error: {...} }
// We only care about error, so we destructure JUST that.
// Same as: const result = await ...; const error = result.error;
```

---

## 6. Prisma — How the Database Layer Works

```typescript
// SCHEMA defines tables (prisma/schema.prisma)
model User {
  id    String @id @default(uuid())    // Primary key, auto-generated
  email String @unique                  // No two users with same email
  name  String?                         // ? = nullable (can be NULL)
  
  profile Profile?                      // Relation: User has one Profile
  meals   MealEntry[]                   // Relation: User has many meals
}

// QUERIES in code (via prisma client)
const user = await prisma.user.findUnique({
  where: { email: "user@example.com" },
  include: { profile: true },          // JOIN the profile table
});

// CREATE
const meal = await prisma.mealEntry.create({
  data: {
    userId: user.id,
    date: new Date(),
    mealType: "LUNCH",
  },
});

// UPDATE
await prisma.profile.update({
  where: { userId: user.id },
  data: { targetCalories: 2200 },
});
```

### Prisma 7 Driver Adapter Pattern
```typescript
// OLD (Prisma 6): Connection URL in schema.prisma
//   new PrismaClient()  ← connected automatically

// NEW (Prisma 7): You provide the database driver explicitly
import { Pool } from "pg";              // PostgreSQL driver
import { PrismaPg } from "@prisma/adapter-pg";  // Bridge

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// WHY: Gives you control over connection pooling, timeouts, etc.
```

---

## 7. State Management — Zustand vs TanStack Query

```
┌─────────────────────────┐  ┌──────────────────────────┐
│      ZUSTAND             │  │   TANSTACK QUERY          │
│   (Client-only state)    │  │   (Server/API state)      │
├─────────────────────────┤  ├──────────────────────────┤
│ Is sidebar open?         │  │ User's meals today        │
│ What date is selected?   │  │ Workout history           │
│ Is workout in progress?  │  │ Profile data              │
│                          │  │                           │
│ Lives in BROWSER only    │  │ Lives in DATABASE          │
│ Never sent to server     │  │ Cached in browser          │
│ Lost on page refresh     │  │ Survives with cache        │
└─────────────────────────┘  └──────────────────────────┘
```

### TanStack Query Example (used in Steps 2-4)
```typescript
// In a component:
const { data: meals, isLoading } = useQuery({
  queryKey: ["meals", selectedDate],
  // queryKey = unique cache key. If selectedDate changes,
  // TanStack Query makes a NEW request.
  queryFn: () => fetch(`/api/meals?date=${selectedDate}`).then(r => r.json()),
});
// data = the API response (cached)
// isLoading = true while the first request is in flight
```

### Zustand Example
```typescript
// Reading state (with selector for performance):
const selectedDate = useUIStore((state) => state.selectedDate);
// Only re-renders when selectedDate changes

// Writing state:
const setDate = useUIStore((state) => state.setSelectedDate);
setDate("2026-07-04");
```

---

## 8. Proxy (Auth Guard) — The Security Checkpoint

```
User Request → proxy.ts → Page/API Route
                  │
                  ├── Is route protected? (e.g., /dashboard)
                  │   ├── Yes + logged in → ✅ Allow through
                  │   └── Yes + NOT logged in → 🔄 Redirect to /login
                  │
                  ├── Is route auth-only? (e.g., /login)
                  │   ├── Yes + logged in → 🔄 Redirect to /dashboard
                  │   └── Yes + NOT logged in → ✅ Show login form
                  │
                  └── Neither → ✅ Allow through (public page)
```

The proxy also **refreshes auth tokens** on every request.
Without this, users would be logged out every hour.

---

## 9. CSS / Tailwind v4 — How Styling Works

```css
/* CSS Custom Properties (variables) */
:root {
  --color-primary: hsl(142, 71%, 45%);
}

/* @theme tells Tailwind: "make these usable as utility classes" */
@theme {
  --color-primary: var(--color-primary);
}

/* Now you can write: */
/* <div className="bg-primary text-primary"> */
/* Instead of: <div style={{ backgroundColor: 'hsl(142, 71%, 45%)' }}> */
```

### Tailwind Pattern Cheatsheet
```
bg-surface      → background color
text-primary    → text color
border-border   → border color
rounded-lg      → border radius
px-4 py-3       → padding (horizontal, vertical)
gap-3           → gap between flex/grid children
flex items-center justify-between → flexbox row, centered, spread
fixed bottom-0  → fixed position at bottom of viewport
transition-colors → smooth color change on hover
hover:bg-surface-hover → background changes on hover
disabled:opacity-50 → dimmed when button is disabled
```

---

## 10. The Provider Pattern

```
<html>
  <body>
    <QueryProvider>              ← Makes TanStack Query available EVERYWHERE
      {children}                 ← All pages rendered here
    </QueryProvider>
  </body>
</html>
```

Without the Provider, every component would need to create its own
TanStack Query client. With it, they all share one instance.

**Why "use client" on providers?** Providers use React Context,
which requires browser-side JavaScript. Server Components can't
use Context. So providers must be Client Components.

But their CHILDREN can still be Server Components! The "use client"
boundary only affects the provider itself, not what's inside it.
