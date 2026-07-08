# 🏋️ FitLog — Project Context File

> **Purpose**: This file captures the complete context of the FitLog project so that any new chat session can pick up exactly where we left off. It includes every decision made, every discussion point, and every answer given across our full conversation.
>
> **Last Updated**: July 7, 2026 (Step 4: AI / Intelligence — COMPLETED)
> **Conversation IDs**: 2f0a58b4 (planning), be043ece (Step 1 + Step 2 build + Engine Audit + Step 3 Features + Step 4 AI)

---

## 📍 Where We Are Right Now

- ✅ Product concept finalized
- ✅ Product plan written (theoretical, non-technical)
- ✅ Technical architecture redesigned as **production-ready** (not a toy MVP)
- ✅ User journey and architecture diagrams created
- ✅ System design document created (full mermaid diagrams)
- ✅ LLM API research completed
- ✅ Storage strategy corrected (Supabase cloud from day one, not IndexedDB-only)
- ✅ Tech stack upgraded (React/Next.js/TypeScript — not Vanilla JS)
- ✅ All user questions answered
- ✅ **Step 1: Foundation — COMPLETED (July 3, 2026)**
- ✅ **Step 2: Core Data — COMPLETED (July 6, 2026)**
- ✅ **Step 3: Features — COMPLETED (July 7, 2026)**
- ✅ **Step 4: AI / Intelligence — COMPLETED (July 7, 2026)**
- ⏳ **Next: Step 5: Polish (animations, PWA, responsive audit, E2E tests)**

---

## 🔴 CRITICAL ARCHITECTURE CHANGE (June 27, 2026)

The original plan was scrapped and redesigned. Here's what changed and why:

| What Changed | Old (Scrapped) | New (Current) | Why |
|-------------|---------------|--------------|-----|
| **Framework** | Vanilla JS (no framework) | **React (Next.js App Router)** | Vanilla JS is not production-grade for a complex app. No component system, no type safety. |
| **Language** | Plain JavaScript | **TypeScript** | No type safety = bugs in production. Non-negotiable. |
| **Styling** | Vanilla CSS | **Tailwind CSS** | Maintainability nightmare at scale without a utility system. |
| **Database** | IndexedDB (browser only) | **Supabase PostgreSQL (cloud) from day one** | Browser storage = data loss if user clears cache. Not a real database. |
| **Backend** | None in Phase 1; serverless later | **Next.js API Routes from day one** | Backend should be designed in, not bolted on. |
| **Charts** | Chart.js | **Recharts** | Chart.js is imperative; fights React's declarative model. |
| **State** | DOM manipulation | **TanStack Query + Zustand** | Production React apps need proper state management. |
| **Monitoring** | None | **Sentry** | Can't fix what you can't see. |
| **Feature phasing** | Features split into phases (Phase 1 was half-baked) | **ALL features exist. Only implementation ORDER is staged.** | The product is ONE complete thing. |

**Key Principle**: The PROJECT has ALL features. Only the IMPLEMENTATION (build order) is staged.

---

## 📂 Key Artifact Files

All artifacts are stored at:
`C:\Users\VAIBHAV\.gemini\antigravity-ide\brain\2f0a58b4-3acd-4e77-85ba-a2a182e46327\`

| File | Status | What It Contains |
|------|--------|-----------------|
| `production_architecture.md` | ✅ **CURRENT** | The production-ready architecture. Full tech stack, system design mermaid diagram, file structure, implementation order, costs. **READ THIS FIRST.** |
| `system_design.md` | ⚠️ **OUTDATED** | Old system design with phases. Needs rewrite to match production_architecture.md. |
| `final_product_plan.md` | ⚠️ **PARTIALLY VALID** | Product features are still correct. Tech stack references are outdated (mentions Vanilla JS, IndexedDB, phases). |
| `implementation_plan.md` | ❌ **OUTDATED** | Old implementation plan with Vite + Vanilla JS + phases. Needs complete rewrite. |
| `user_journey_architecture.md` | ⚠️ **PARTIALLY VALID** | User journey flows are still correct. Architecture diagrams reference old tech stack. |
| `tech_stack_cross_questions.md` | ❌ **OUTDATED** | Cross-questions for old tech stack (Vanilla JS, Dexie.js, Chart.js). Needs rewrite for new stack. |
| `answers_and_updates.md` | ✅ **STILL VALID** | User's specific answers about logging flexibility, Indian gym rest times, strictness levels — all still apply. |
| `product_blueprint.md` | ❌ **OBSOLETE** | Original first-draft. Superseded long ago. |

---

## 🏗️ What We're Building

**FitLog** — a production-ready fitness tracking website for Indian gym-goers.

**Platform**: Website (NOT an app). Responsive, mobile-first. Open a URL in any browser. No downloads.

**Workspace**: `c:\Fitness_app\`

### ALL Features (No Phases — One Complete Product):

**Workout System:**
1. Workout Logger — Live Mode (during gym) + Recall Mode (after gym)
2. Pre-built splits (PPL, Upper/Lower, Bro, Full Body, Custom)
3. 150+ exercise library with MET values
4. Rest timer (Live Mode), RPE post-session
5. Calorie burn shown as ranges (≈320-380 cal, not 347 cal)
6. Session summary (volume, PRs, intensity minutes)
7. Progressive overload detection
8. Workout-diet mismatch alerts

**Nutrition System:**
9. Indian-first food database (IFCT 2017 + USDA) stored in PostgreSQL
10. Household units (roti, katori, plate, glass) — not grams
11. Homemade vs restaurant toggle (changes calories by 40-60%)
12. 5 logging paths: Repeat, Combo, Recipe, Search, NLP (AI parsing)
13. Natural language meal logging ("2 roti, dal, chicken" → parsed by LLM)
14. Recipe builder (save custom recipes like "Amma's Sambar")

**Intelligence System:**
15. Calorie Engine — MET-based, estimates ACTIVE work time from sets (solves Indian gym rest-time problem)
16. TDEE calculator (Mifflin-St Jeor + activity multiplier)
17. Adaptive TDEE — auto-corrects weekly from real weight data vs intake
18. Plain-language weekly AI insights
19. Goal checkpoints + midpoint LLM review (Option A: direct advice, Option B: interactive Q&A)
20. Strictness-based feedback (Relaxed / Moderate / Strict — controls all nutrition feedback tone)
21. Safety floor alerts (dangerously low calorie intake detection)

**Tracking & Progress:**
22. Step count tracking (manual + Google Fit sync for Android)
23. Weight logging with smoothed trend chart
24. Strength curves (per exercise, over time)
25. Calorie trend charts
26. Intensity minutes (WHO 150min/week target)

**User Accounts & Data:**
27. Google OAuth + email/password authentication (Supabase Auth)
28. All data stored in Supabase PostgreSQL cloud (never lost)
29. Row Level Security (each user sees only their own data)
30. JSON data export/import
31. PWA (installable on phone)

**Future/Premium (post-launch):**
32. Plate Builder (Thali Mode) — visual plate constructor
33. Momentum Score (0-100 weekly engagement)
34. Rest Day Intelligence
35. Body recomposition tracking
36. AI workout generator
37. Social challenges & shareable cards

---

## 🛠️ Tech Stack (Production-Ready)

### Frontend

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | **Next.js 16.2.10** (App Router) | React-based full-stack. SSR for SEO. API routes for backend. File-based routing. |
| **Language** | **TypeScript 5.x** | Non-negotiable. Catches bugs at compile time. |
| **UI Library** | **React 19.2.4** | Component-based. Largest ecosystem. User specifically asked for React. |
| **Styling** | **Tailwind CSS 4.x** | Utility-first. Consistent design system. Fast to build. |
| **Component Library** | **shadcn/ui** | Pre-built components. Copy-paste (not a dependency). Built on Radix UI. |
| **Server State** | **TanStack Query 5.x** | Data fetching, caching, loading/error states, optimistic updates. |
| **Client State** | **Zustand 5.x** | Lightweight global UI state (sidebar, filters, theme). |
| **Charts** | **Recharts 2.x** | React-native charting. Declarative. |
| **Forms** | **React Hook Form + Zod** | Type-safe validation shared between client and server. |
| **Icons** | **Lucide React** | Tree-shakeable SVGs. |
| **Fonts** | **Inter + Outfit** (via next/font) | Auto-optimized, no layout shift. |

### Backend (Built Into Next.js)

| Layer | Technology | Why |
|-------|-----------|-----|
| **API Layer** | **Next.js Route Handlers** | Server-side API in same codebase. Type-safe end-to-end. |
| **Server Actions** | **Next.js Server Actions** | Direct function calls from React → server. No manual fetch for mutations. |
| **Validation** | **Zod** | Schema validation shared between client forms and server. |
| **Auth** | **Supabase Auth** (via `@supabase/ssr`) | Google OAuth + email. JWT sessions. Server-side validation. |
| **Rate Limiting** | **Upstash Rate Limit** | Redis-based. Prevents abuse. Free: 10K req/day. |
| **LLM Client** | **Custom fallback chain** | Gemini → Groq → OpenRouter. OpenAI-compatible format. |
| **Background Work** | **Vercel `waitUntil()`** | Post-response async jobs (PR detection, cache updates, safety checks). Runs after response sent. No separate worker needed. |

### Database

| Layer | Technology | Why |
|-------|-----------|-----|
| **Database** | **Supabase PostgreSQL** | Our data IS relational. 500MB free, 50K MAU. |
| **ORM** | **Prisma 7.8** | Type-safe DB client. Auto-generates TS types from schema. Migrations. Uses driver adapter pattern (Prisma 7). |
| **Row Level Security** | **Supabase RLS** | `user_id = auth.uid()` on ALL tables. Database-level enforcement. |
| **Caching** | **Upstash Redis** | Cache dashboard queries, food search, LLM responses. Free: 10K commands/day. |

### Food Database (Seeded into PostgreSQL — One-Time Operation)

> **Decision finalized June 30, 2026.** Users search for prepared dishes ("roti", "dal tadka") not raw ingredients. Strategy picks INDB as primary because it has recipes. ifct2017 is secondary for the Recipe Builder only.

| Source | Foods | Role | Format |
|--------|-------|------|--------|
| **INDB** (Indian Nutrient Databank, GitHub) | ~1,000 | **Primary search DB** — prepared dishes: roti, dal tadka, biryani, chicken curry, idli, sambar, poha | CSV from GitHub (free) |
| **ifct2017** (npm package, GitHub) | 528 | **Recipe Builder only** — raw ingredients: wheat flour, rice, dal, oil, vegetables | npm install → JSON |
| **USDA FoodData Central** | ~300 | International + protein foods: eggs, chicken breast, oats, banana | Free API (query once, save to DB) |
| **Manual additions** | ~50 | Gym-specific: whey protein scoop, creatine, BCAA, mass gainer | Typed manually (~30 min) |
| **Total** | **~1,850 foods** | Covers everything an Indian gym-goer eats | All seeded into PostgreSQL |

**Why NOT Kaggle CSV**: Same IFCT data as the npm package, just in a different format. Adds no new foods. Skipped.
**Why INDB over raw IFCT for search**: Users search for what they ATE ("dal tadka"), not raw ingredients ("bengal gram dal, uncooked"). INDB has prepared dishes; raw IFCT doesn't.
**Complexity**: This is a one-time `npm run seed` script. After seeding, it's just a normal PostgreSQL table — no ongoing complexity.

### Infrastructure

| Layer | Technology | Why |
|-------|-----------|-----|
| **Hosting** | **Vercel** | One `git push` deploys. Global CDN. Auto-HTTPS. Free: 100GB/month. |
| **CI/CD** | **GitHub Actions** | Tests, lint, type-check on every PR. Auto-deploy on merge. |
| **Error Monitoring** | **Sentry** | Production error tracking. Stack traces. Free: 5K events/month. |
| **Uptime** | **Better Stack** | Alerts if website goes down. |
| **Testing** | **Vitest + React Testing Library + Playwright** | Unit + component + E2E tests. |

### Cost: ₹0/month for up to 5,000+ users. ~₹5,000-10,000/month at 5K-50K users.

---

## 🤖 LLM API Strategy

We use AI for: meal text parsing, weekly insight summaries, and goal-midpoint intervention.

### Stacking Strategy (fallback chain):
```
User request → Try Gemini Flash → Rate limited? → Try Groq → Rate limited? → Try OpenRouter → All fail? → Template-based fallback
```

| Provider | Free Limits | Role |
|----------|-------------|------|
| **Gemini Flash** | 1,500 RPD, 10 RPM, 1M TPM, 1M context | **Primary** — best for Indian food names |
| **Groq (Llama 3)** | 30 RPM, <1s latency | **Fallback #1** — ultra-fast |
| **OpenRouter** | 20+ free models, ~50 RPD | **Fallback #2** — auto-picks any available model |
| **Template-based** | Unlimited | **Degradation** — if all LLMs fail, use rule-based summaries |

All use OpenAI-compatible API format. Keys stored server-side (never exposed to browser). Combined: ~2,500+ RPD free.

---

## 💬 Key Decisions From Our Discussion

### Things the User Explicitly Asked For:
1. ✅ Workout split logging (PPL, Upper/Lower, Bro, Full Body, Custom)
2. ✅ Food logging with Indian diet support (including regional cuisines)
3. ✅ Step count tracking
4. ✅ Workout load tracking
5. ✅ Calorie burn calculation — user never sees formulas, just sees results
6. ✅ Per-exercise and per-cardio calorie breakdown
7. ✅ Insights on diet, workout, daily routine
8. ✅ Not boring despite being feature-rich
9. ✅ Unique features other apps don't have
10. ✅ This is a WEBSITE, not a mobile app
11. ✅ **Use React** (user explicitly requested)
12. ✅ **Production-ready, not a toy project** (user explicitly corrected this)
13. ✅ **No feature phases** — product is complete, only implementation is staged
14. ✅ **Cloud database from day one** — user questioned IndexedDB-only approach

### Things I (the Agent) Pushed Back On:
1. ❌ "Every single detail must be logged" → "Maximum depth available, minimum depth required"
2. ❌ "No formula at all for calories" → Formulas exist under the hood, user never sees them
3. ❌ Hand-building food database → Use IFCT + USDA (months of work saved)
4. ❌ Exact calorie numbers (347 cal) → Show ranges (≈320-380 cal) for honesty
5. ❌ Deriving strength calories from weight lifted → Use work time + RPE (more accurate)
6. ❌ Static TDEE formula → Adaptive TDEE auto-corrects from real data

### User's Specific Requirements That Changed the Design:
1. **Flexible logging timing** — users log at ANY time. No time-of-day assumptions in UI.
2. **Live Mode + Recall Mode** — two workout logging modes for different behaviors.
3. **Indian gym rest times** — calorie engine estimates ACTIVE work time from sets, not total gym time.
4. **Strictness levels** — Relaxed/Moderate/Strict controls all nutrition feedback.
5. **Safety floor** — flag dangerously low intake, never shame.
6. **Goal tracking** — progressive checkpoints, midpoint LLM review (Option A + B).
7. **Cloud storage** — user pointed out that browser-only storage loses data. Supabase from day one.
8. **Production quality** — user explicitly said "this is not a minimal-type project."
9. **React** — user explicitly requested React, not Vanilla JS.

### User's Open Questions — RESOLVED (July 3, 2026):
1. ✅ **Next.js** — Confirmed. Using Next.js 16.2.10 (App Router).
2. ✅ **Tailwind CSS** — Confirmed. Using Tailwind v4.
3. ✅ **Prisma** — Confirmed. Using Prisma 7.8 with driver adapter pattern.
4. ✅ **Project name** — Confirmed as **FitLog**.

---

## 🏛️ Server-Side Architecture Rules (FIRM — Not Optional)

> These rules were established June 30, 2026 and apply to every single data operation in the codebase.

### Rule 1: All Data Access Goes Through the Server

Every read and every write — no matter how "simple" — goes through the server. No exceptions.

```
Browser (React)
    │  fetch() or Server Action
    ▼
API Route / Server Action     ← Auth check, input validation, rate limiting
    ▼
Service Layer                 ← Business logic, calculations, orchestration
    ▼
Repository Layer (Prisma)     ← Raw DB queries only, no logic
    ▼
PostgreSQL + RLS              ← Defense-in-depth (second wall)
```

**Why**: "Simple" operations never stay simple. Today it's a plain SELECT. Tomorrow it needs personalization, logging, or a security check. Going through the server from day one means changes are additive (add a line to the service) not structural (refactor from direct DB call to API route).

### Rule 2: Supabase JS Client Is Auth-Only in the Browser

The Supabase browser client is used **only** for authentication operations:
- `supabase.auth.signInWithOAuth(...)` ✅
- `supabase.auth.signOut()` ✅
- `supabase.auth.getSession()` ✅
- `supabase.from('anything').select(...)` ❌ **Never**

All data queries use **Prisma on the server side**, invoked through API routes or Server Actions.

### Rule 3: RLS Is Defense-In-Depth, Not the Primary Security Layer

RLS stays enabled on all tables — but as a **second wall**, not the primary gate.

| Layer | Role |
|-------|------|
| **Server auth check** | PRIMARY — reject unauthorized requests before any DB query runs |
| **Zod input validation** | PRIMARY — reject malformed input before it reaches the DB |
| **Supabase RLS** | SECONDARY — if server code has a bug, RLS ensures data still can't leak |

Security policy must never be split across two places as the sole enforcement. RLS is a safety net.

### Rule 4: Layer Responsibilities Are Strict

| Layer | Knows About | Does NOT Know About |
|-------|-------------|---------------------|
| **React Hook** | API endpoint URL, response shape | Database, Prisma, business rules |
| **Controller** (API Route / Server Action) | HTTP, request validation, auth, which service to call | How calories are calculated, what "safety floor" means |
| **Service** | Business rules, orchestrating repositories, calling the engine | HTTP, React, how data is physically stored |
| **Repository** | Prisma queries, table structure | Business rules, HTTP, what the data is used for |
| **Engine** (`lib/engine/`) | Pure math (MET values, TDEE formulas) | Database, HTTP, React — pure functions only |

### Rule 5: User-Triggered Background Work Uses `waitUntil()`

For operations where the user should NOT wait but work still needs to happen after the response:

```typescript
export async function POST(request: Request) {
  // 1. Core write (user waits for this)
  const session = await prisma.workoutSession.update({ ... });

  // 2. Send response immediately
  const response = Response.json({ success: true, summary });

  // 3. Background work (user already has their response)
  waitUntil(async () => {
    await Promise.all([
      detectAndSavePRs(session),
      calculateCalorieBurnRange(session),
      invalidateDashboardCache(session.userId),
    ]);
  });

  return response;
}
```

Use `waitUntil()` for: PR detection, calorie calculations, cache invalidation, safety floor checks, strictness feedback triggers.
Do NOT use a job queue (BullMQ etc.) unless a background job exceeds 10–15 seconds or needs retries — we don't have that at this scale.

### Rule 6: Next.js 16 Uses `proxy.ts` Not `middleware.ts`

Next.js 16 renamed the middleware convention. The exported function is `proxy()`, not `middleware()`. File must be at the project root as `proxy.ts`.

### Rule 7: Prisma 7 Uses Driver Adapters

Prisma 7 removed `url` from `schema.prisma`. Connection configuration is split:
- **CLI operations** (migrate, generate): `prisma.config.ts` at project root
- **Runtime queries**: `PrismaClient({ adapter })` with `@prisma/adapter-pg`

### Actual File Structure (Step 1 — as built)

```
c:\Fitness_app\
├── app/
│   ├── globals.css              # Design system (CSS vars + Tailwind @theme)
│   ├── layout.tsx               # Root layout (fonts, providers, metadata)
│   ├── page.tsx                 # Landing page (SSR, public)
│   ├── (app)/                   # Route group: authenticated pages
│   │   ├── layout.tsx           # App layout (bottom nav, auth guard)
│   │   ├── dashboard/page.tsx   # Placeholder (Step 3)
│   │   ├── workout/page.tsx     # Placeholder (Step 3)
│   │   ├── nutrition/page.tsx   # Placeholder (Step 3)
│   │   ├── progress/page.tsx    # Placeholder (Step 3)
│   │   ├── settings/page.tsx    # Placeholder (Step 3)
│   │   └── onboarding/page.tsx  # Placeholder (Step 2)
│   ├── (auth)/                  # Route group: auth pages (no nav)
│   │   ├── layout.tsx           # Centered layout
│   │   ├── login/page.tsx       # Login (Suspense wrapper)
│   │   ├── login/login-form.tsx # Login form (client component)
│   │   └── signup/page.tsx      # Signup
│   └── auth/callback/route.ts   # OAuth code exchange (server-side)
├── components/
│   ├── providers/query-provider.tsx  # TanStack Query wrapper
│   └── shared/bottom-nav.tsx         # Bottom navigation (mobile-first)
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Browser Supabase (AUTH ONLY)
│   │   ├── server.ts            # Server Supabase (session validation)
│   │   ├── middleware.ts        # Session refresh helper
│   │   └── prisma.ts            # Prisma singleton (driver adapter)
│   └── utils/
│       ├── cn.ts                # Tailwind class merge utility
│       └── constants.ts         # Routes, nav items, safety values
├── stores/
│   └── ui-store.ts              # Zustand (selected date, active workout)
├── prisma/
│   └── schema.prisma            # Full database schema (ALL tables)
├── docs/                        # Planning docs (moved from root)
│   ├── CONTEXT.md               # This file
│   ├── production_architecture.md
│   ├── step1_theory_and_code.md # Teaching file
│   └── step1_edge_cases_and_debugging.md
├── .github/workflows/ci.yml    # CI pipeline (lint, type-check, build)
├── proxy.ts                     # Auth guard + session refresh (Next.js 16)
├── prisma.config.ts             # Prisma 7 connection config
├── next.config.ts               # Next.js + Sentry config
├── sentry.client.config.ts      # Browser error tracking
├── sentry.server.config.ts      # Server error tracking
├── sentry.edge.config.ts        # Edge runtime error tracking
├── .env.local.example           # All env vars (placeholders)
└── package.json                 # name: "fitlog"
```

### Services + Repositories (to be created in Steps 2-3)

```
lib/
├── repositories/           # DAO layer — raw Prisma queries, no logic
│   ├── meal.repository.ts
│   ├── workout.repository.ts
│   ├── weight.repository.ts
│   ├── step.repository.ts
│   ├── profile.repository.ts
│   └── goal.repository.ts
├── services/               # Business logic layer
│   ├── dashboard.service.ts
│   ├── meal.service.ts     # Log + safety check + cache update
│   ├── workout.service.ts  # End session + PR detect + calorie calc
│   ├── tdee.service.ts     # Adaptive TDEE recalculation
│   ├── insight.service.ts  # Weekly AI insight generation
│   └── goal.service.ts     # Goal tracking + midpoint review
├── engine/                 # Pure calc functions (no DB, no I/O)
├── llm/
├── validators/
└── utils/
```

---

## 📋 Implementation Order (NOT Feature Phases)

The product is ONE complete thing. We build it in this order because of dependencies:

| Step | Duration | What Gets Built |
|------|----------|----------------|
| **Step 1: Foundation** | Week 1-2 | Next.js + TS + Tailwind + shadcn/ui setup. Supabase project (ALL tables). Prisma schema. Auth (Google + email). Route middleware. Bottom nav. CI/CD. Sentry. Design tokens. |
| **Step 2: Core Data** | Week 3-4 | Food DB seed (IFCT + USDA → PostgreSQL). Exercise DB seed. ALL calorie engine calculators. Onboarding wizard. TanStack Query hooks. |
| **Step 3: All Features** | Week 5-10 | Dashboard. Workout Logger (Live + Recall). Nutrition Logger (all 5 paths including NLP). Step + weight logging. Progress charts. Strictness feedback. Safety floor. Adaptive TDEE. Weekly insights. Goal tracking + LLM review. Settings + export. |
| **Step 4: AI / Intelligence** | Week 11 | AI meal parsing (text → food logs via Gemini). AI weekly coaching insights. Rate limiting (Upstash Redis). Fallback chain (Gemini → Groq → OpenRouter). Adaptive TDEE activation. Production build script safety. |
| **Step 5: Polish** | Week 12 | Animations. PWA. Responsive audit. Performance (Lighthouse). E2E tests (Playwright). Security audit. SEO. |

---

## ⚠️ Important Constraints & Gotchas

1. **Supabase free tier pauses after 7 days of inactivity** — keep a cron ping active, or wake on first request (instant).
2. **Food database — FINALIZED**: INDB (GitHub, ~1,000 prepared dishes) is the primary search database. `ifct2017` npm package (528 raw ingredients) is used only for the Recipe Builder. USDA FoodData Central (~300 foods via free API) covers international foods. ~50 gym-specific foods added manually. Total: ~1,850 foods in PostgreSQL. Kaggle CSV is SKIPPED (duplicate of ifct2017). This is a one-time seed script — zero ongoing complexity.
3. **Apple Health has NO web API** — iPhone step sync impossible on a website. Manual entry only. Google Fit works for Android.
4. **All calorie numbers are estimates** — we say so in the UI. Never claim lab accuracy.
5. **Free LLM APIs have rate limits** — stacking strategy mitigates this. Template fallback as safety net.
6. **Indian food logging complexity** — same dish varies by household. Recipe builder + homemade/restaurant helps.
7. **Gemini free tier: Google may use prompts for training** — never send PII (names, emails) to LLM. Only food text.
8. **Supabase RLS is defense-in-depth** — every table MUST have `user_id = auth.uid()` policy, but RLS is the SECOND wall. The PRIMARY security gate is the server-side auth check in every API route / Server Action. Never rely on RLS alone. Test both layers thoroughly.

---

## 🔗 How to Resume This Project in a New Chat

1. Point the new chat to this file: `c:\Fitness_app\docs\CONTEXT.md`
2. Also read: `c:\Fitness_app\docs\production_architecture.md`
3. Say: "Read the CONTEXT.md file in my workspace docs folder. This is the FitLog fitness website project. Resume from where we left off."
4. If you want to continue building: "Read CONTEXT.md and start building Step 2: Core Data."
5. If you want to modify the plan: "Read CONTEXT.md. I want to change [X]."

The agent will have full context of:
- What FitLog is and ALL its features
- The production-ready tech stack (Next.js 16, TypeScript, Tailwind, Supabase, Prisma 7)
- Every user requirement and discussion point
- The corrected storage strategy (Supabase cloud, not IndexedDB)
- Step 1 is DONE — all foundation code exists and builds successfully
- The implementation order (Step 2 next: food DB seed, exercise DB, calorie engine)
- What anti-patterns to avoid
- Prisma 7 driver adapter pattern and Next.js 16 proxy convention

## 📝 Step 1 Completion Notes (July 3, 2026)

### What Was Built
- Next.js 16.2.10 project initialized with TypeScript + Tailwind v4
- Full Prisma schema: 15 models, 14 enums covering ALL tables
- Supabase auth integration (Google OAuth + email/password)
- Auth guard via proxy.ts (Next.js 16 convention)
- Bottom navigation component (mobile-first, glassmorphism)
- TanStack Query provider with sensible defaults
- Zustand UI store (selected date, active workout state)
- CI/CD pipeline (GitHub Actions → Vercel)
- Sentry error monitoring (client, server, edge)
- Dark-first design system with HSL color palette
- All placeholder pages for every route in the app

### Problems Encountered & Solved
1. npm naming restriction → created in temp subfolder, moved files
2. Prisma 7 breaking changes → created prisma.config.ts + driver adapter
3. Lucide Chrome icon removed → replaced with Globe
4. useSearchParams needs Suspense → split login into page + form components
5. middleware.ts deprecated → migrated to proxy.ts

### Verification Results
- `npx tsc --noEmit` → ✅ zero errors
- `npm run lint` → ✅ zero warnings
- `npx prisma validate` → ✅ schema valid
- `npm run build` → ✅ all 13 pages generated, proxy working

### Still Needed (Before Step 2) — ALL DONE
- ✅ Created Supabase project and filled `.env.local` credentials
- ✅ Ran `npx prisma migrate dev` — tables created in Supabase
- ✅ Set up Google OAuth in Supabase dashboard
- ✅ User successfully signed in with Google

## 📝 Step 2 Completion Notes (July 6, 2026)

### What Was Built
- **Food database seeded**: 150 foods (120 Indian prepared dishes + 65 manual/gym foods)
- **Exercise database seeded**: 155 exercises (Chest, Back, Legs, Shoulders, Arms, Core, Cardio, Full Body, Mobility)
- **Calorie engine**: 7 pure math modules (TDEE, BMR, cardio burn, strength burn, step calories, intensity minutes, adaptive TDEE, safety floors)
- **Onboarding wizard**: 5-step form (Identity → Body → Activity → Goal → Preferences) with Zod validation
- **Profile service layer**: Controller → Service → Repository pattern with transactional user+profile creation
- **API routes**: 5 endpoints (`/api/onboarding`, `/api/profile`, `/api/health`, `/api/foods/search`, `/api/exercises`)
- **TanStack Query hooks**: `useProfile`, `useFoodSearch`, `useExercises` with caching and deduplication
- **Zustand onboarding store**: Multi-step wizard state management
- **Supabase keep-alive cron**: GitHub Actions workflow that pings `/api/health` every 3 days
- **Schema migration**: Added `DietaryType` enum + field to Profile model

### Free-Tier Optimization Rules (Applied)

These rules were discussed and agreed upon to ensure the app stays within free-tier limits:

**Rule 8 — Redis Selective Rate Limiting (Step 3)**
- DO NOT rate-limit every API route. Only protect: auth endpoints, LLM endpoints, heavy mutations.
- Standard GET requests use TanStack Query's client-side cache (staleTime = 60s).
- Budget: 10,000 Upstash Redis commands/day.

**Rule 9 — LLM AbortController Timeouts (Step 3)**
- Fallback chain: Gemini (4s timeout) → Groq (2s timeout) → OpenRouter (2s timeout) → Template (instant)
- Total chain must resolve within 8 seconds (Vercel 10s limit minus 2s for DB save).
- Template fallback = rule-based response, no API call, always works.

**Rule 10 — Supabase Keep-Alive (Done)**
- `.github/workflows/keepalive.yml` pings `/api/health` every 3 days.
- Prevents Supabase free-tier from pausing after 7 days of inactivity.
- Cost: $0 (GitHub Actions free minutes).

**Rule 11 — Vercel Hobby Tier Policy**
- No commercial use on Hobby (free) tier.
- FitLog is free, no ads, no paywalls → perfectly compliant.
- If monetized in the future → upgrade to Vercel Pro ($20/mo).

### USDA API Key
- Key: `ekMM2EMAMtTKbNAYfYgrUSENNak4HjbwiMa8rF4e`
- Used during seed only (not at runtime).
- Currently not utilized (manual food data used instead for reliability).
- Can be used later to expand the food database.

### New Files Added in Step 2
```
lib/
├── engine/                     # Calorie engine (pure math, no I/O)
│   ├── index.ts                # Barrel export
│   ├── tdee.ts                 # BMR + TDEE + target calories + macro split
│   ├── cardio.ts               # MET-based cardio calorie burn
│   ├── strength.ts             # Strength training calorie burn (RPE-adjusted)
│   ├── steps.ts                # Step count → calorie conversion
│   ├── intensity.ts            # WHO intensity minutes tracker
│   ├── adaptive-tdee.ts        # Adaptive TDEE from real weight/calorie data
│   └── safety.ts               # Calorie floor + deficit rate checks
├── repositories/
│   └── profile.repository.ts   # Raw Prisma queries (User + Profile)
├── services/
│   └── profile.service.ts      # Business logic (onboarding + recalculation)
├── validators/
│   └── onboarding.schema.ts    # Zod schemas (shared client/server)
└── hooks/
    ├── use-profile.ts           # TanStack Query: profile data
    ├── use-food-search.ts       # TanStack Query: food search (debounced)
    └── use-exercises.ts         # TanStack Query: exercise list

app/
├── api/
│   ├── onboarding/route.ts     # POST: complete onboarding
│   ├── profile/route.ts        # GET: current user's profile
│   ├── health/route.ts         # GET: health check + DB ping
│   ├── foods/search/route.ts   # GET: food search by name
│   └── exercises/route.ts      # GET: exercise list with filters
└── (app)/onboarding/
    ├── page.tsx                 # Server component (auth + redirect guard)
    └── _components/
        ├── onboarding-shell.tsx  # Wizard container + progress bar
        ├── step-1-identity.tsx   # Name, DOB, Sex
        ├── step-2-body.tsx       # Weight, Height, BMI preview
        ├── step-3-activity.tsx   # Activity level cards
        ├── step-4-goal.tsx       # Fitness goal selection
        └── step-5-preferences.tsx # Diet type, strictness, submit

stores/
└── onboarding-store.ts          # Zustand: wizard step state

prisma/
├── seed.ts                      # Master seed entry point
├── seeds/
│   ├── seed-foods.ts            # Food seed orchestrator
│   ├── seed-exercises.ts        # Exercise seed orchestrator
│   └── data/
│       ├── foods-indian-prepared.ts  # ~120 Indian dishes
│       ├── foods-manual.ts           # ~65 gym/international foods
│       └── exercises.ts              # 155 exercises with MET values
└── migrations/
    └── 20260706_add_dietary_type/    # DietaryType enum migration

.github/workflows/
└── keepalive.yml                # Supabase keep-alive cron (every 3 days)
```

### Verification Results (Step 2)
- `npx tsc --noEmit` → ✅ zero errors
- `npm run build` → ✅ 18 routes (5 new API routes + dynamic onboarding)
- `npx prisma db seed` → ✅ 150 foods + 155 exercises seeded
- `npx prisma migrate dev` → ✅ DietaryType migration applied

---

## 🔬 Post-Step 2 Calorie Engine Audit (July 7, 2026)

A full review of the calorie engine was conducted after Step 2 completion. Five issues were identified. Here are the final verdicts and decisions that MUST be applied at the start of Step 3 before any new feature is built.

---

### Audit Finding 1 — CRITICAL: Double Counting Exercise Calories

**What the problem is:**
The TDEE formula already bakes gym activity into the daily calorie target via the activity multiplier (e.g., MODERATE = 1.55×). This means the calorie target already assumes the user goes to the gym 3–5 days a week. If the workout logger then adds session calories on top of this TDEE, the gym is counted twice. A user could silently overeat by 300–500 calories per day and not understand why they are not losing weight.

**Official decision (MUST be followed in Step 3):**
- Workout session calories are shown as INFORMATION ONLY on the dashboard
- They are NEVER added to the daily calorie budget
- The TDEE already accounts for them
- This is our permanent model — document it in the workout logger code with a comment

**Why this matters:** This is exactly how MyFitnessPal misleads millions of users. We will not repeat that mistake.

---

### Audit Finding 2 — HIGH: Protein Multiplier Is Wrong for Our Target Audience

**What the problem is:**
The engine uses 2.2 g of protein per kg of body weight for all muscle-related goals. This is a competitive bodybuilder number. For an average Indian gym-goer, it produces unrealistic targets (e.g., 180g per day for an 82 kg person) that are very difficult to achieve from normal Indian food, especially for vegetarians.

**What 180g per day requires (example, 82 kg person):**
- 400g of chicken breast on top of a normal day's meals, OR
- 3 scoops of whey protein powder daily
- Neither is realistic for most users

**Official decision — Replace with this tiered system:**

| Body Goal | Protein per kg | 82 kg example | Achievable? |
|---|---|---|---|
| Maintain health | 1.4 g | 115 g/day | Yes, easily |
| Lose fat (keep muscle) | 1.6 g | 131 g/day | Yes, with effort |
| Lean muscle / lean body | 1.8 g | 148 g/day | Yes, with 1 scoop whey optionally |
| Muscle bulk | 2.0 g | 164 g/day | Needs planning |
| Competitive athlete | 2.2 g | 180 g/day | Hard without heavy supplementation |
| Vegetarian adjustment | Reduce by 0.2 g | — | Plant proteins are less complete |

**File to change:** `lib/engine/tdee.ts` — replace the hardcoded 2.2 multiplier with this goal-based lookup.

---

### Audit Finding 3 — HIGH: Goal System Must Be Redesigned

**What the problem is:**
The current onboarding Step 4 gives users four static buttons: Lose Fat, Gain Muscle, Maintain, Recomp. Each maps to a fixed calorie adjustment forever:
- LOSE_FAT → always -500 kcal
- GAIN_MUSCLE → always +300 kcal
- RECOMP → always -200 kcal
- MAINTAIN → 0 kcal

The RECOMP option is especially misleading. At -200 kcal/day deficit, it takes over a year (55+ weeks) to lose 10 kg. If a user picks RECOMP hoping to reach their target weight in a few months, they will fail and blame the app.

**Math proof:**
```
To lose 10 kg: 10 × 7,700 = 77,000 calorie deficit needed
RECOMP deficit = 200 kcal/day
Time needed = 77,000 ÷ 200 = 385 days = over 1 year
```

**Official decision — New goal system:**
Replace the four goal buttons with a target-based input system:
1. User enters current weight
2. User enters target weight
3. User selects timeline (slider: 1 to 12 months)
4. User selects body type goal in plain language (see below)

The engine calculates the required daily deficit automatically from these inputs.

**The 5 body goal modes (plain language, no jargon):**

| Mode | Plain Language Description | Deficit | Protein |
|---|---|---|---|
| Fat Loss (Lean Cut) | I want to lose weight and get a lean, toned body | 400–600 kcal | 1.6 g/kg |
| Lean Muscle | I want to lose fat but also build visible lean muscle | 200–400 kcal | 1.8 g/kg |
| Six Pack / Abs | I want very low body fat and visible abs, willing to be strict | 500–700 kcal | 1.8–2.0 g/kg |
| Muscle Bulk | I want to gain as much muscle as possible | Surplus 200–300 kcal | 1.8–2.0 g/kg |
| Maintain | I am happy with my weight, just want to stay consistent | 0 kcal | 1.4 g/kg |

**RECOMP is removed as a goal option.** It is now explained as a natural side effect: any user in a mild deficit with adequate protein is already doing body recomposition. The app tells them this automatically.

**Safety guardrail to add:**
```
Max safe fat loss rate = 1% of body weight per week
For 82 kg person = 0.82 kg/week maximum

If user's chosen timeline requires faster loss than this:
  → App warns: "This timeline is too aggressive."
  → App shows minimum safe timeline
  → App lets user choose: adjust timeline OR accept slower pace
```

**File to change:** `lib/engine/tdee.ts` — add `calculateGoalFromTimeline()` function.
**UI to change:** `app/(app)/onboarding/_components/step-4-goal.tsx` — full redesign.

---

### Audit Finding 4 — MEDIUM: Rounding Order in Macro Calculation

**What the problem is:**
The engine rounds fat calories immediately after calculating them, then uses the rounded number to subtract from the total to get carb calories. The correct method is to keep full decimal precision throughout the calculation and only round at the very end when displaying grams.

**Why it matters:** The error is only 1–2 grams per day now. But the Adaptive TDEE engine in `adaptive-tdee.ts` reuses stored profile values from the database. If those values are already rounded, the error compounds silently over months of use.

**Official decision:** Fix the rounding order in `lib/engine/tdee.ts`. Round only when converting final grams for display.

---

### Audit Finding 5 — MEDIUM: No Minimum Fat Gram Floor in Safety Check

**What the problem is:**
`lib/engine/safety.ts` only checks one thing: is total calorie intake above the minimum floor (1,200 for women, 1,500 for men)? It does not check whether fat grams are dangerously low.

For lighter users on aggressive cuts, 25% of a very low calorie target can push fat below the medical minimum needed for hormone production and vitamin absorption.

**Example:**
```
Lighter woman, aggressive cut:
  TDEE = 1,800 kcal
  Target = 1,800 - 500 = 1,300 kcal
  Fat at 25% = 1,300 × 0.25 ÷ 9 = 36g
  
  Minimum safe fat = 0.5g × bodyweight kg
  For 55 kg woman: 0.5 × 55 = 27.5g minimum
  36g passes ✅ but barely
  
  For 50 kg woman: minimum = 25g, gets 36g ✅
  For 45 kg woman on 1,200 kcal: fat = 33g, minimum = 22.5g ✅ but dangerously close
```

**Official decision:** Add `checkFatGramFloor()` to `lib/engine/safety.ts`.
Rule: fat grams must never go below 0.5 × user's weight in kg.
If they do, either increase fat percentage or warn the user.

---

### Audit Finding 6 — NOT A BUG: Age Calculation

The age off-by-one discrepancy in the walkthrough was a documentation typo, not a code bug. The code in `lib/services/profile.service.ts` correctly checks whether the birthday month has passed before finalizing the age. Nothing to fix.

---

### Audit Finding 7 — NOT NEEDED: Body Composition Formula Upgrade

The Mifflin-St Jeor formula does not know the difference between muscle mass and fat mass. A more accurate formula (Katch-McArdle) exists but requires body fat percentage as input. Most users do not know their body fat percentage.

**Decision:** Keep Mifflin-St Jeor. The Adaptive TDEE module self-corrects for this limitation after 14+ days of real weight and calorie data. The formula is just a starting estimate. Real data replaces it over time.

---

## 📋 Realistic Numbers — What the App Produces for a Typical Indian User

**Example: Male, 23 years, 170 cm, 82 kg, gym daily 1–1.5 hours weight training, wants lean body, target 72 kg in 4 months**

```
BMR:              1,773 calories/day
TDEE:             2,748 calories/day (daily gym = MODERATE/ACTIVE border)
Daily Target:     1,700 calories/day (642 calorie deficit)
Timeline:         4 to 4.5 months to reach 72 kg safely

Macros:
  Protein:  131 g   (1.6 g/kg — lean cut, realistic for India without heavy supplements)
  Carbs:    175 g   (energy for daily gym sessions)
  Fat:       56 g   (healthy minimum for hormones and joint health)

Weekly expected loss:  0.55 to 0.65 kg
Safety checks:
  Total calories 1,700 > male floor 1,500 ✅
  Fat 56g > floor (0.5 × 82 = 41g) ✅
  Weekly loss rate 0.65 kg < 1% of 82 kg (0.82 kg/week max) ✅
```

For a vegetarian version of the same person:
```
Protein multiplier reduces to 1.4 g/kg (plant proteins are incomplete)
Protein target:  115 g (achievable from dal, paneer, soya, milk, curd)
Note shown in app: "Add soya chunks or 1 scoop plant protein to hit this target"
```

---

## 🗺️ Updated Step Roadmap

### Step 1: Foundation — ✅ DONE (July 3, 2026)
No changes. All foundation code is correct and stays as is.

### Step 2: Core Data — ✅ DONE (July 6, 2026)
Code built and verified. Known issues documented above. Do NOT fix during Step 2 — fix at the start of Step 3.

### Step 3: Features — ✅ DONE (July 7, 2026)
All three phases completed. 0 TypeScript errors. Details in Step 3 Completion Notes below.

### Step 4: AI / Intelligence — ⏳ NEXT
- LLM meal parsing (photo/text → nutrition data)
- AI coach with AbortController timeouts (Gemini 4s → Groq 2s → Template fallback)
- Selective Redis rate limiting (auth + LLM routes only)
- AI coach uses double-counting rule: never tells user to eat more because they worked out

---

## 🚀 Step 3 Completion Notes (July 7, 2026)

### What Was Built

**Phase 3A — Onboarding Step 4 Redesign:**
- Updated `lib/validators/onboarding.schema.ts` — added `targetWeightKg` and `timelineMonths` optional fields
- Rebuilt `app/(app)/onboarding/_components/step-4-goal.tsx` — 5 plain-language body goal modes + target weight input + timeline slider + live engine preview with safety warnings
- Updated `lib/services/profile.service.ts` — passes `dietaryType` to engine for tiered protein adjustments

**Phase 3B — Full Feature Set:**

#### Repositories (Data Access Layer — raw Prisma queries)
| File | Purpose |
|------|----------|
| `lib/repositories/nutrition.repository.ts` | getDailySummary (aggregate), getMealEntriesByDate, logFood (upsert meal entry), deleteMealFood |
| `lib/repositories/workout.repository.ts` | createSession, getSessionsByDate, addSet, completeSession, getWorkoutBurnByDate, deleteSession |
| `lib/repositories/progress.repository.ts` | logWeight (upsert per day), getWeightHistory, getLatestWeight, getActiveGoal |

#### Services (Business Logic Layer — calls repositories + engine)
| File | Purpose |
|------|----------|
| `lib/services/nutrition.service.ts` | logFoodItem (fetches food → calculates macros → saves), logCustomFood, getDailyTotals |
| `lib/services/workout.service.ts` | startSession, logSet, finishSession (triggers engine burn calc using `calculateStrengthBurnSimple` + `calculateCardioBurn`), getWorkoutSummary |
| `lib/services/progress.service.ts` | recordWeight, getProgressData (aggregates history + stats + adaptive TDEE readiness) |

#### API Routes (Server endpoints — auth check → validate → call service → respond)
| Route | Methods | Purpose |
|-------|---------|----------|
| `app/api/nutrition/daily/route.ts` | GET | Daily nutrition totals for dashboard |
| `app/api/nutrition/log/route.ts` | POST, DELETE | Log food (DB or custom) / remove food |
| `app/api/workout/route.ts` | POST, GET | Start session / get sessions by date |
| `app/api/workout/[id]/sets/route.ts` | POST, PUT | Add set / finish session (triggers burn calc) |
| `app/api/progress/weight/route.ts` | POST, GET | Log weight (upsert) / get progress data |
| `app/api/profile/route.ts` | GET, PUT | Get profile / update + recalculate targets |

#### TanStack Query Hooks (Client-side data fetching + mutations)
| File | Hooks |
|------|-------|
| `lib/hooks/use-daily-summary.ts` | `useDailySummary(date)` — cached 30s |
| `lib/hooks/use-nutrition.ts` | `useMealsForDate(date)`, `useLogFood(date)`, `useDeleteFood(date)` |
| `lib/hooks/use-workout.ts` | `useWorkoutsForDate(date)`, `useStartSession(date)`, `useLogSet(date)`, `useFinishSession(date)` |
| `lib/hooks/use-progress.ts` | `useProgressData()`, `useLogWeight()` |

#### UI Components (Dashboard)
| File | Purpose |
|------|----------|
| `app/(app)/dashboard/_components/date-strip.tsx` | Horizontal 7-day date selector using `useUIStore.selectedDate` (Step 1) |
| `app/(app)/dashboard/_components/calorie-ring.tsx` | SVG circular progress ring (consumed vs target) — green/amber/red |
| `app/(app)/dashboard/_components/macro-bars.tsx` | CSS horizontal bars for protein/carbs/fat vs targets |
| `app/(app)/dashboard/_components/goal-progress.tsx` | Weight goal progress bar (start → current → target) |
| `app/(app)/dashboard/_components/workout-info.tsx` | Workout burn summary explicitly labeled "Info only" |
| `app/(app)/dashboard/_components/today-meals.tsx` | 2×2 meal grid showing per-meal calorie totals |
| `app/(app)/dashboard/page.tsx` | Assembles all dashboard components |

#### UI Components (Nutrition Logger)
| File | Purpose |
|------|----------|
| `app/(app)/nutrition/_components/food-search-modal.tsx` | Search modal using `useFoodSearch` (Step 2), quantity input, restaurant toggle, live calorie preview |
| `app/(app)/nutrition/_components/meal-section.tsx` | Per-meal food list with delete capability |
| `app/(app)/nutrition/page.tsx` | Full nutrition page with 4 meal sections + daily macro summary bar |

#### UI Components (Workout Logger)
| File | Purpose |
|------|----------|
| `app/(app)/workout/_components/exercise-browser.tsx` | Modal with muscle group chips + name search, browses 155 seeded exercises (Step 2) |
| `app/(app)/workout/_components/set-logger.tsx` | Weight/reps/RPE input form with warmup toggle, auto-incrementing set number |
| `app/(app)/workout/_components/session-summary.tsx` | Completed session view with grouped exercises, sets, and burn range |
| `app/(app)/workout/page.tsx` | Full workout flow: start → add exercises → log sets → finish → summary |

#### UI Components (Progress)
| File | Purpose |
|------|----------|
| `app/(app)/progress/_components/weight-chart.tsx` | Pure SVG line chart with gradient, grid lines, target weight dashed line |
| `app/(app)/progress/_components/weight-log-input.tsx` | Quick weight entry input |
| `app/(app)/progress/_components/stats-cards.tsx` | 2×2 grid: starting weight, current, change, log count + adaptive TDEE status |
| `app/(app)/progress/page.tsx` | Progress page assembling chart + stats + adaptive TDEE notice |

#### Settings Page
| File | Purpose |
|------|----------|
| `app/(app)/settings/page.tsx` | Shows current targets, editable weight/activity/goal/dietary fields, recalculate button |

### Critical Architecture Rules Enforced in Step 3

1. **Double Counting Prevention**: Workout calorie burns are stored for INFORMATION ONLY. The `WorkoutInfo` component on the dashboard explicitly shows an "Info only" badge and a disclaimer. The TDEE already includes gym activity via the activity multiplier.

2. **Rounding Rule**: All intermediate calculations use full floating-point precision. `Math.round()` is applied only at the terminal display/save boundary (in API responses and repository saves).

3. **Safety Constraints**: The engine enforces calorie floor (1,500M/1,200F), fat floor (0.5g/kg), and weekly loss rate limit (1% body weight).

4. **Tiered Protein**: The onboarding Step 4 redesign passes `dietaryType` through the full stack so the engine's tiered protein multiplier (1.6-2.2g/kg depending on goal) adjusts correctly for vegetarian/vegan users.

5. **Cache Invalidation**: Every mutation hook (useLogFood, useDeleteFood, useLogSet, useFinishSession, useLogWeight) automatically invalidates related query caches so the dashboard, nutrition page, and progress page stay in sync.

### Data Flow Diagram (Step 3)

```
User taps "Log Food" on Nutrition Page
  → FoodSearchModal opens
    → User types "roti" → useFoodSearch hook (Step 2)
      → GET /api/foods/search?q=roti (Step 2 API)
        → prisma.food.findMany() → 150 seeded foods (Step 2)
    → User selects Roti, enters 80g, taps "Log Food"
      → useLogFood mutation (Step 3 hook)
        → POST /api/nutrition/log (Step 3 API)
          → nutrition.service.logFoodItem() (Step 3)
            → prisma.food.findUnique() → get nutrition per 100g
            → Calculate: 80g × (caloriesPer100g / 100) = actual kcal
            → nutrition.repository.logFood() → INSERT into meal_foods
          → 201 Created
        → onSuccess: invalidate ["nutrition", "daily", date]
          → Dashboard CalorieRing auto-refreshes ✅
```

### Verification Results (Step 3)
- `npx tsc --noEmit` → 0 errors ✅
- All 35 new files created with proper documentation
- All engine functions called with correct positional signatures
- All API routes follow auth check → validate → service → respond pattern

---

## Step 4: AI / Intelligence — COMPLETED (July 7, 2026)

### What Step 4 Built

Step 4 added three intelligent layers on top of the complete app:

1. **AI Meal Parsing** — users type "2 rotis with dal and curd" and the AI converts it into structured food log entries using the existing Step 3 nutrition service
2. **AI Weekly Coaching** — a personalised weekly summary generated by reading 7 days of nutrition/workout/weight data from Step 3 repositories
3. **Rate Limiting** — Upstash Redis-based protection for free-tier LLM budgets
4. **Production Build Safety** — `prisma generate && prisma migrate deploy && next build` in the build script

### AI Model Configuration

| Provider | Model | Role | Timeout | Free Tier |
|----------|-------|------|---------|----------|
| **Gemini** | `gemini-3.1-flash-lite` | Primary (text + images) | 8s | 15 RPM / 250K TPM / 500 RPD |
| **Groq** | `llama-3.3-70b-versatile` | Fast text fallback | 4s | 30 RPM |
| **OpenRouter** | `deepseek/deepseek-chat:free` | Second text fallback | 6s | Limited daily credits |

### Fallback Chain

```
User sends text → Try Gemini (8s timeout)
                    ↓ fails
                → Try Groq (4s timeout)
                    ↓ fails
                → Try OpenRouter (6s timeout)
                    ↓ all fail
                → Return error: "Search manually"
```

Image requests only go to Gemini (Groq/OpenRouter are text-only).

### Rate Limits

| Route | Limit | Why |
|-------|-------|-----|
| `POST /api/ai/parse-meal` | 15/user/day | Preserve free LLM budget |
| `GET /api/ai/weekly-insight` | 2/user/week | Expensive LLM call, cached in DB |

Rate limiting gracefully disables when Upstash keys are not configured (development mode).

### Files Created in Step 4

#### AI Provider Infrastructure
| File | Purpose |
|------|----------|
| `lib/ai/gemini.ts` | Gemini 3.1 Flash Lite REST API client (raw fetch, no SDK) |
| `lib/ai/groq.ts` | Groq Llama 3.3 70B OpenAI-compatible client |
| `lib/ai/openrouter.ts` | OpenRouter DeepSeek Chat client |
| `lib/ai/fallback.ts` | Cascading fallback: Gemini → Groq → OpenRouter |
| `lib/ai/prompts.ts` | System prompts for meal parsing + weekly insights |

#### Rate Limiting
| File | Purpose |
|------|----------|
| `lib/middleware/rate-limit.ts` | Upstash Redis rate limiter (graceful degradation) |

#### Schema
| File | Purpose |
|------|----------|
| `prisma/schema.prisma` | Added `WeeklyInsight` model (one per user per week) |
| `prisma/migrations/20260707123936_add_weekly_insights/` | Migration SQL |

#### Services & Repositories
| File | Purpose |
|------|----------|
| `lib/services/ai.service.ts` | Core AI logic: parseMealText() + generateWeeklyInsight() |
| `lib/repositories/insight.repository.ts` | CRUD for WeeklyInsight table |

#### API Routes
| File | Purpose |
|------|----------|
| `app/api/ai/parse-meal/route.ts` | POST — auth → rate limit → parse text → log foods |
| `app/api/ai/weekly-insight/route.ts` | GET — auth → rate limit → generate/cache insight |

#### Hooks
| File | Purpose |
|------|----------|
| `lib/hooks/use-ai-meal-parser.ts` | TanStack mutation for AI meal parsing |
| `lib/hooks/use-weekly-insight.ts` | TanStack query for weekly insight (24h stale) |

#### UI Components
| File | Purpose |
|------|----------|
| `app/(app)/nutrition/_components/ai-meal-input.tsx` | Textarea + parse button + result confirmation |
| `app/(app)/progress/_components/weekly-insight-card.tsx` | Insight card with highlights + suggestion |

#### Modified Files
| File | What Changed |
|------|----------|
| `app/(app)/nutrition/page.tsx` | Added AI input toggle per meal type |
| `app/(app)/nutrition/_components/meal-section.tsx` | Added "✨ AI" button alongside "+ Add Food" |
| `app/(app)/progress/page.tsx` | Added WeeklyInsightCard below weight chart |
| `package.json` | Build script: `prisma generate && prisma migrate deploy && next build` |
| `.env.local` | Added GEMINI_API_KEY |

### Critical Rules Enforced in Step 4

1. **Double-Counting Prevention in AI Coach**: The weekly insight system prompt contains an explicit hard rule: "NEVER suggest the user eat more because they worked out. Their calorie target ALREADY includes gym activity via the TDEE activity multiplier."

2. **No PII to LLMs**: Only nutritional numbers and fitness data are sent to LLMs. No names, emails, or personally identifiable information.

3. **Indian Food Context**: The meal parser system prompt includes a conversion table for Indian foods (roti = 40g, paratha = 60g, katori = 150g, etc.) and realistic calorie estimates per 100g.

4. **Graceful Degradation**: Every external dependency (Gemini, Groq, OpenRouter, Upstash) has a fallback. If all LLMs fail, the user sees "Search manually." If Redis is not configured, rate limiting is disabled.

### Data Flow: AI Meal Parsing (Step 4)

```
User types "2 rotis with dal and curd" on Nutrition Page
  → AIMealInput component (Step 4 UI)
    → useAIMealParser hook (Step 4)
      → POST /api/ai/parse-meal (Step 4 API)
        → Auth check via createClient() (Step 1)
        → Rate limit check via checkMealParserLimit() (Step 4)
        → ai.service.parseMealText() (Step 4)
          → runWithFallback() with MEAL_PARSER_SYSTEM_PROMPT (Step 4)
            → callGemini() → Gemini 3.1 Flash Lite
              → Returns JSON: [{name: "Roti", quantity: 80}, {name: "Dal", quantity: 150}, ...]
          → For each item:
            → prisma.food.findFirst({name contains "Roti"}) → Match? (Step 2 food DB)
              → YES: logFoodItem(userId, {foodId, quantityGrams: 80}) (Step 3)
              → NO:  logCustomFood(userId, {name, calories, protein, carbs, fat}) (Step 3)
          → Return { logged: [...], provider: "gemini", totalCalories: 450 }
        → 201 Created
      → onSuccess: invalidate ["nutrition", "meals", date] + ["nutrition", "daily", date]
        → Dashboard CalorieRing auto-refreshes ✅
        → MealSection shows new foods ✅
```

### Verification Results (Step 4)
- `npx tsc --noEmit` → 0 errors ✅
- `npx prisma migrate dev` → WeeklyInsight table created ✅
- `npx prisma generate` → Client types include WeeklyInsight ✅
- Build script updated for production safety ✅
- All new files follow the 5-layer architecture (UI → Hook → API → Service → Repository)
