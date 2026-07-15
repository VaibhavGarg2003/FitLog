# FitLog — Auth Linking, Goal Weight & Exercise UX Plan

## Context

FitLog already supports **email/password** and **Google OAuth** via Supabase Auth (server routes + httpOnly cookies). App data lives in Prisma (`public.users` + related tables), keyed by the **same UUID** as `auth.users.id`.

Gaps today:

| Area | Current state |
|------|----------------|
| Connect Google after email signup | **Not implemented** (no `linkIdentity`, no Settings/prompt UI) |
| Goal weight | Collected in onboarding, **not persisted**; Dashboard hardcodes `targetWeight={null}`; Settings has no goal weight |
| Skip goal | Goal step is **required** — no Skip |
| Exercise muscle chips | `overflow-x-auto` shows a **visible scrollbar** (poor mobile/desktop UX) |
| Same-email method conflicts | **Unhandled** in app; generic errors / silent `?error=auth_failed` |

This plan answers every product question and sequences implementation so each step is safe and builds on the previous one.

---

## Design principles (apply to all work)

1. **Identity link ≠ data merge.** When Google is linked while the user is already logged in, Supabase attaches a second identity to the **same** `auth.users` row. The UUID never changes → all workouts, meals, profile, progress stay put. No copy/merge job needed for the happy path.
2. **Never create a second app user for the same person.** The dangerous path is *logged-out* OAuth that creates a *new* auth user while the original account still exists. Manual linking + email matching + clear UX prevent that.
3. **Fail closed on mismatch.** Wrong Google account → clear error, stay on original session, zero writes to profile/workout/nutrition/progress tables.
4. **Ship UX fixes before identity complexity.** Goal display and exercise chips are independent of auth and reduce user pain immediately.

---

## Implementation sequence (do in this order)

```
Phase 1  Exercise picker chip bar UX          (quick, isolated)
Phase 2  Goal system: persist + display + skip  (data + UI)
Phase 3  Auth identity foundation             (detect providers, errors, Supabase config)
Phase 4  "Connect Google" linking service     (core API + wrong-account rules)
Phase 5  Connect-Google product UX            (prompt + Settings + skip)
Phase 6  Reverse flow: Google-only → password (signup/login conflict handling)
Phase 7  Hardening & verification matrix      (edge cases, no-dupe guarantees)
```

---

# Phase 1 — Exercise browser muscle-group bar UX

## Problem (answer)

When adding an exercise, the muscle filter row (`All | Chest | Back | Legs | …`) uses:

```tsx
// app/(app)/workout/_components/exercise-browser.tsx
className="flex gap-2 overflow-x-auto p-3 border-b border-border"
```

There are **9 chips** that often exceed the modal width. `overflow-x-auto` correctly allows swipe, but the **browser draws a horizontal scrollbar**, which feels broken—especially with nested scroll (chips X + list Y) inside a `max-h-[80vh]` modal.

`DateStrip` already tries `scrollbar-hide`, but that utility is **not defined** in `globals.css`, so hide styles are incomplete project-wide.

## Solution

| Change | Detail |
|--------|--------|
| Hide scrollbar, keep swipe | Add a real `.scrollbar-hide` utility in `globals.css` (WebKit + Firefox `scrollbar-width: none`) |
| Apply to chip row | Use `scrollbar-hide` on the muscle chip container |
| Optional polish | Soft edge fade (`mask-image`) so overflow is discoverable without a bar |
| Optional layout | Slightly denser chips (`text-xs`, tighter padding) so more fit without scrolling on common phone widths |
| Keep list scroll only | Only the exercise list scrolls vertically; chips never show a thumb |

## Critical files

- `app/(app)/workout/_components/exercise-browser.tsx`
- `app/globals.css`
- Optional consistency: `app/(app)/dashboard/_components/date-strip.tsx` (same hide utility)

## Out of scope for this phase

- Changing muscle group data model or adding Mobility chip (seed has Mobility; chips do not) — can be a tiny follow-up if desired.

## Verification

- Open Workout → Add Exercise on a narrow viewport and laptop.
- Chip row: swipe works; **no horizontal scrollbar** visible.
- Exercise list still scrolls vertically.
- Selecting Chest / Back / All still filters correctly.

---

# Phase 2 — Goal weight: persist, show, skip

## Problem (answer)

| What you see | Why |
|--------------|-----|
| Current weight on Dashboard | From `profile.weightKg` |
| Goal weight **missing** | Onboarding collects `targetWeightKg` but `completeOnboarding` never saves it; `Goal` table is **never written**; Dashboard passes `targetWeight={null}` hard-coded |
| Settings | Edits current weight + goal **type** only — no numeric target |

So the UI is working as coded: it only has current weight + goal enum, not a real target weight pipeline.

## Solution overview

### 2A — Persist goal on onboarding completion

When onboarding finishes (and user chose a real weight goal):

1. Keep writing `Profile` as today (`goal` enum, macros, etc.).
2. **Also create** an `ACTIVE` row in `goals` via a new repository helper, e.g. `createActiveGoal({ userId, type, startValue, targetValue, startDate, targetDate })`.
3. Seed an initial `WeightLog` for onboarding day with `weightKg` (so progress charts and start weight are consistent).
4. Prefer timeline-aware calories when `targetWeightKg` + `timelineMonths` exist (`calculateGoalFromTimeline` already exists) instead of only static enum deficits — at least store the goal row even if calorie formula stays enum-based in v1.

**Schema note:** `Goal` model already exists (`targetValue`, `startValue`, dates, `status`). Prefer using it over adding `targetWeightKg` on `Profile`, so Dashboard/Progress share one source of truth. Optional later: denormalize onto Profile for fewer joins.

### 2B — Show goal weight on Dashboard and Settings

**Dashboard** (`app/(app)/dashboard/page.tsx` + `goal-progress.tsx`):

- Load active goal (extend `useProfile` or add `useActiveGoal` / fold into progress API already used by Progress tab).
- Pass real `targetWeight`, `startWeight` from goal; current weight from latest weight log **or** `profile.weightKg`.
- Full progress bar when all three exist; if user skipped target, show goal type only + optional “Set a target weight” CTA.

**Settings** (`app/(app)/settings/page.tsx`):

- Read-only or editable fields: **Current weight**, **Goal type**, **Goal / target weight**, optional timeline.
- “Recalculate Targets” updates profile macros **and** updates or recreates the active `Goal` when target changes.
- If no goal set: show “No weight goal set” + “Set goal” control.

### 2C — Skip goal (product rule)

On **Step 4 (Goal)**:

| User choice | Stored state | UI after |
|-------------|--------------|----------|
| Picks LOSE/GAIN/RECOMP + target | `Goal` ACTIVE + profile.goal set | Full progress card |
| Picks Maintain | Goal optional; target = current or no Goal row | “Maintain” label; no progress bar needed |
| **Skip** | `profile.goal = MAINTAIN` (or nullable if you open schema later) **and no ACTIVE Goal** | Dashboard: “No weight goal — set one anytime in Settings”; calories = maintain/TDEE |

Implementation details:

- Add **Skip** button next to Continue on `step-4-goal.tsx`.
- Relax client gate: `canContinue` true when skipped.
- Zod already treats `targetWeightKg` as optional; ensure final `onboardingSchema` allows skip without requiring goal modes if you introduce an explicit `goalSkipped: true` flag in the store.
- Engine: if skipped → `calculateFullProfile` with `MAINTAIN` (safe default macros).

## Critical files

| Area | Paths |
|------|--------|
| Schema (likely no migration if Goal already enough) | `prisma/schema.prisma` |
| Onboarding UI | `app/onboarding/_components/step-4-goal.tsx`, `onboarding-shell.tsx` |
| Store / validation | `stores/onboarding-store.ts`, `lib/validators/onboarding.schema.ts` |
| Persist | `lib/services/profile.service.ts`, `lib/repositories/progress.repository.ts` (or new `goal.repository.ts`) |
| Dashboard | `app/(app)/dashboard/page.tsx`, `.../goal-progress.tsx` |
| Settings | `app/(app)/settings/page.tsx`, `app/api/profile/route.ts`, `lib/services/profile.service.ts` |
| Progress (already reads active goal) | `lib/services/progress.service.ts`, `getActiveGoal` |

## Existing pieces to reuse

- `Goal` / `GoalCheckpoint` models  
- `getActiveGoal(userId)` in `progress.repository.ts`  
- `GoalProgress` three-state UI (already designed for target weight)  
- `calculateGoalFromTimeline` in `lib/engine/tdee.ts`  
- Onboarding fields `targetWeightKg`, `timelineMonths` in store + Zod  

## Verification

1. Onboard with Lean Cut + target 70 kg → Dashboard shows target + progress; Settings shows target.
2. Onboard with Skip → lands on dashboard with no fake progress; can set goal later in Settings.
3. Maintain → no misleading “kg to go”.
4. Progress tab `activeGoal` is non-null when a real goal was set.

---

# Phase 3 — Auth identity foundation

## Why before “Connect Google”

Linking UI must know:

- Does this session already have a Google identity?
- Did OAuth fail? Why?
- Is Supabase configured for **manual** identity linking?

## Answers that drive this phase

App uses **Supabase Auth only**. Providers live in `auth.identities`, not Prisma. The app never inspects them today.

### Supabase project config (required)

In Supabase Dashboard → Authentication:

1. Enable **Manual identity linking** (recommended for this product).
2. Confirm Google provider is enabled (client ID/secret).
3. Allowlist redirect URLs: `/auth/callback`.
4. Decide **Automatic linking**: prefer **off** when using manual link flows, so a second Google sign-in cannot silently attach or create ambiguous states. Document the chosen policy in `docs/`.

### App foundation work

| Work item | Detail |
|-----------|--------|
| Identity status API | e.g. `GET /api/auth/identities` → `{ email, providers: ["email","google"], hasPassword, hasGoogle }` via `supabase.auth.getUser()` + `user.identities` |
| Login error surfacing | `LoginForm` reads `?error=` and shows messages (`auth_failed`, `account_exists_use_google`, `email_mismatch`, etc.) |
| OAuth callback query errors | Map Supabase/error codes to safe, user-facing redirects |
| Optional metadata | Cache `providers` on profile only if needed for UI; source of truth remains Supabase |

## Critical files

- `app/auth/callback/route.ts`
- `app/(auth)/login/login-form.tsx`
- New: `app/api/auth/identities/route.ts` (or extend profile GET)
- `lib/supabase/server.ts` (`getAuthUser`)
- Docs: short “Auth linking runbook”

## Verification

- Email-only user → API reports `providers: ["email"]` only.
- Google-only user → `["google"]`.
- Fake `?error=auth_failed` on login shows a visible banner.

---

# Phase 4 — Connect Google linking service (core)

## Product answer: How do we do “Connect your Google account”?

### Happy path (email/password user already has data)

```
User is logged in (email/password session, same UUID as public.users)
        │
        ▼
UI: "Connect Google" (Settings and/or post-onboarding card)
        │
        ▼
Server starts OAuth in LINK mode (not a fresh sign-up)
  → supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: ... } })
  OR equivalent server-safe flow with skipBrowserRedirect
        │
        ▼
User picks Google account in Google UI
        │
        ▼
/auth/callback?flow=link  exchanges code
        │
        ▼
Server validates:
  1. Session still the original user (or re-bound correctly by Supabase link)
  2. Google email (normalized) === account email (normalized)
  3. Google identity not already linked to a *different* auth user
        │
   ┌────┴────┐
   │ pass    │ fail
   ▼         ▼
Mark linked  Unlink if partial / abort
Stay on      Show error; session = original
same UUID    email user; NO app DB writes
All data intact
```

### Why data is not overwritten or duplicated

| Layer | Behavior on successful link |
|-------|-----------------------------|
| `auth.users` | **Same row**; new row in `auth.identities` (provider = google) |
| `public.users` | **Same `id`** — no second user |
| `profiles`, workouts, meals, weight_logs, goals, templates, insights | All FK to same `user_id` — **untouched** |
| Avatar/name | Optional: fill empty `avatarUrl`/`name` from Google **only if currently null** (never clobber user-edited profile) |

There is **no** “merge two public users” step in the happy path because there is only one public user.

### What we must **not** do

- Do **not** call logged-out `signInWithOAuth` and hope Supabase merges — that can create a second auth user if linking fails.
- Do **not** run onboarding again after link.
- Do **not** upsert profile from Google metadata over existing fitness data.
- Do **not** re-key `user_id` on any table after a correct link (unnecessary and risky).

### Edge case: wrong Google account (answer)

Assume account email is `user@gmail.com`. User connects Google but picks `other@gmail.com`.

| Step | What happens (intended product behavior) |
|------|------------------------------------------|
| 1 | Google OAuth completes for `other@gmail.com` |
| 2 | Callback / link handler compares emails (case-insensitive) |
| 3 | **Mismatch** → treat as failure |
| 4 | If Supabase already attached the wrong identity, **unlink** it immediately (`unlinkIdentity`) |
| 5 | User remains logged into the **email/password** account |
| 6 | **Zero** changes to profile, workouts, nutrition, goals, weight logs |
| 7 | UI message: *“That Google account uses a different email. Choose the Google account for user@gmail.com.”* |
| 8 | User can retry or Skip |

**If Supabase rejects the link** (identity already used elsewhere): show *“This Google account is already connected to another FitLog account. Sign in with that Google account, or pick a different one.”* Still no data merge.

**If emails match but Google account was already linked to this same user:** treat as success (idempotent).

### Email match rule (product decision — recommended)

**Strict match:** Google primary email must equal the FitLog account email (after `trim` + `toLowerCase()`).

- Pros: Simple mental model; avoids linking a personal Gmail to a work email account.
- Cons: User who signed up with a non-Gmail email cannot link a different Gmail. Document that: *“Connect only works when Google uses the same email you signed up with.”*

Alternative (not recommended for v1): allow different emails with extra confirmation — higher support load and phishing risk.

## Critical files

| Role | Path |
|------|------|
| Start link OAuth | New `GET /api/auth/link/google` (or extend oauth route with `?mode=link`) |
| Callback | `app/auth/callback/route.ts` — branch on `flow=link` |
| Unlink on failure | server helper using Supabase admin or user `unlinkIdentity` as appropriate |
| Status | identities API from Phase 3 |
| Keep tokens server-side | Same pattern as existing oauth/login (httpOnly cookies, no browser token JSON) |

## Implementation notes for Supabase + this codebase

- Prefer **authenticated** `linkIdentity` so UUID is stable.
- Callback must distinguish `flow=login|signup|link` via safe query params (already have `safeRedirectPath`).
- After link success: redirect to `/settings?linked=google` or `/dashboard?linked=1`.
- After mismatch: redirect to `/settings?error=google_email_mismatch` (or onboarding prompt surface).
- Unit-test pure email normalize/compare helper.

## Verification

1. Email user with lots of workouts links matching Google → next visit “Continue with Google” signs into **same** dashboard data.
2. Link wrong Google → error; DB row counts for that `user_id` unchanged.
3. Link already-used Google → clear error; no second `public.users` row.
4. `GET identities` shows both `email` and `google`.

---

# Phase 5 — “Connect Google” product UX

## Where it appears

1. **Post-onboarding / first dashboard visit (email-only users)**  
   Soft card: *“Connect Google so you can sign in next time without remembering your password.”*  
   Actions: **Connect Google** | **Not now** (skip; dismiss for session or N days via cookie/local preference).

2. **Settings → Account** (always available if not linked)  
   Status: “Signed in with email” / “Google connected ✓”  
   Button: Connect Google / Disconnect (disconnect optional v1.1).

3. **Not shown** for users who already have a Google identity.

## Skip behavior

- Skip is **allowed** always (linking is convenience, not required).
- Skipping does not block dashboard or features.
- User can connect later from Settings.

## Critical files

- `app/(app)/settings/page.tsx` — Account card
- New component e.g. `components/shared/connect-google-card.tsx`
- Dashboard or layout mount for one-time prompt
- Optional: `localStorage` / cookie `google_connect_dismissed_at`

## Verification

- Email-only after onboarding sees prompt; Skip hides it; Settings still offers Connect.
- Google-only user never sees “Connect Google”.
- Linked user sees connected state.

---

# Phase 6 — Reverse flow: Google account first, then email/password

## Scenario (your question)

1. User signs up with **Google** (email `a@gmail.com`), completes onboarding, has full data.
2. Signs out.
3. Tries to **sign up or log in with email + password** using `a@gmail.com` (not Google button).

## What happens today (current app)

| Action | Today |
|--------|--------|
| Email signup same email | Supabase rejects duplicate; API returns generic *“Could not create account…”* |
| Email login | *“Invalid email or password”* (no password on that auth user) |
| Where they land | Stay on `/signup` or `/login` with a vague error — **no path to their data** unless they use Google |

There is **no** automatic migration of Google identity into a password account without either linking while logged in or setting a password on the existing user.

## Recommended product flow (implement in this phase)

### A) Signup with email when Google account already exists

```
POST /api/auth/signup { email: a@gmail.com, password }
        │
        ▼
Supabase: user already registered
        │
        ▼
App returns structured error code (not only generic text):
  code: "ACCOUNT_EXISTS_USE_GOOGLE"
  message: "An account already exists for this email with Google.
            Sign in with Google, then you can add a password in Settings."
        │
        ▼
Signup UI shows message + primary button "Continue with Google"
  (redirect=/dashboard or /onboarding as onboarded state dictates)
```

User lands on **their existing account and data** after Google sign-in — never a second empty account.

### B) Login with email/password when only Google identity exists

```
POST /api/auth/login
        │
        ▼
No password / invalid credentials
        │
        ▼
Optional enhancement (if Supabase allows probing carefully):
  Prefer not to leak “this email is registered with Google” to strangers.
  
Practical UX (recommended):
  On failed password login, show secondary help:
  "Used Google before? Continue with Google"
  + "Forgot password?" only if email identity/password is known to exist
```

**Security note:** Avoid a precise oracle that always says “this email is Google-only” to unauthenticated callers. Prefer:

- Generic invalid credentials, **plus** always-visible Google button on login (already present).
- After successful Google login, Settings offers **“Add a password”** (`updateUser({ password })`) so next time email login works.

### C) “Add password” for Google users (mirror of Connect Google)

While logged in with Google:

- Settings → Account → **Set password**
- `supabase.auth.updateUser({ password })` (server route)
- Result: same auth user now has **email+password + google** identities
- Future: either method works; same UUID; **same data**

### D) Where does the user land? (clear answer)

| Path | Landing |
|------|---------|
| Correct: Continue with Google | `/dashboard` if onboarded, else `/onboarding` (existing layout guard) |
| Wrong: email signup duplicate | Stay on `/signup` with “use Google” CTA — **not** into a new empty app |
| Wrong: email login without password | Stay on `/login` — **not** into someone else’s data |
| After adding password in Settings | Still same session/dashboard; next visit can use either method |

### E) Do we need a data merge for this reverse flow?

**No**, if we never create a second user. All paths re-authenticate the **existing** Supabase user.

Merge would only be needed if a bug created two `auth.users` / two `public.users` for the same email — that is an incident recovery script, not normal product flow (see Phase 7).

## Critical files

- `app/api/auth/signup/route.ts` — structured error codes
- `app/api/auth/login/route.ts` — optional safer messaging
- `app/(auth)/signup/page.tsx`, `login-form.tsx` — CTAs
- New: `POST /api/auth/password` (set/change password while authenticated)
- Settings Account section

## Verification

1. Google onboarded user → email signup same email → clear CTA → Google login → **same** workouts still there.
2. Google user sets password → logout → email login → same dashboard.
3. No second `public.users` row for that email.

---

# Phase 7 — Hardening, edge cases, no-dupe guarantees

## Edge-case matrix (final answers)

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| 1 | Email signup → Connect Google (matching email) | Same UUID; data preserved; both login methods work |
| 2 | Email signup → Connect wrong Google | Error; unlink if needed; data untouched; still email login |
| 3 | Email signup → Skip Connect Google | Full app access; can connect later |
| 4 | Google signup → later email signup same email | Blocked; “Use Google” / then optional set password |
| 5 | Google signup → later email login (no password) | Fail login; use Google; optional set password after |
| 6 | Two different people, same Google (impossible) | N/A — Google account is unique per Google |
| 7 | Google identity already linked to another FitLog user | Link fails; message; no merge |
| 8 | User has heavy data then links | **No overwrite, no duplicate rows** — identity-only change |
| 9 | Partial OAuth failure mid-link | Callback error; original session restored if possible |
| 10 | Automatic linking misconfigured | Runbook: disable auto-link; use manual + app validation |

## Data domains that must never be duplicated by linking

All scoped by `user_id` (same after correct link):

- Onboarding / profile (`profiles`)
- Workouts (`workout_sessions`, `exercise_sets`)
- Nutrition (`meal_entries`, `meal_foods`) — “notation” treated as nutrition logging
- Progress (`weight_logs`, `step_logs`, `goals`, `goal_checkpoints`)
- Templates + weekly insights

Shared catalogs (`exercises`, `foods`) are global reference data — not per-user.

## Optional recovery tool (ops only)

If dual accounts ever appear (support rare):

- Script to merge secondary → primary by reassigning `user_id` with conflict resolution on unique keys (`userId+date` weight/meals, etc.)
- Only run manually; not part of normal UX
- Extend `scripts/reset-user.ts` patterns carefully — do not use reset as merge

## Logging / observability

- Structured logs: `auth.link.start`, `auth.link.success`, `auth.link.email_mismatch`, `auth.link.identity_in_use`
- Never log tokens; email can be redacted in production logs if needed

## Verification matrix (end-to-end)

| Test | Pass criteria |
|------|----------------|
| Exercise chips | No visible H-scrollbar; filters work |
| Goal set onboarding | Target visible Dashboard + Settings; Goal row exists |
| Goal skip | Onboarding completes; dashboard empty-goal state; set later in Settings |
| Link match | Dual providers; data row counts stable; Google login works |
| Link mismatch | Error UI; identities unchanged (or wrong identity unlinked); data stable |
| Reverse Google→password | Signup blocked helpfully; set password works; single user |
| Regression | Email-only and Google-only paths still onboard and reach dashboard |

---

## Recommended approach summary

**Do not build a database merge service for normal linking.** Build **identity linking on the same Supabase user** with **strict email match** and **profile-preserving** metadata rules. Fix goal persistence so Dashboard/Settings can show target weight, and allow skipping goals. Fix the exercise chip scrollbar as a pure CSS/UX pass first.

---

## Critical files (master list)

| Priority | File |
|----------|------|
| Phase 1 | `app/(app)/workout/_components/exercise-browser.tsx`, `app/globals.css` |
| Phase 2 | `lib/services/profile.service.ts`, `lib/repositories/progress.repository.ts`, `step-4-goal.tsx`, `dashboard/page.tsx`, `goal-progress.tsx`, `settings/page.tsx` |
| Phase 3–6 | `app/api/auth/*`, `app/auth/callback/route.ts`, login/signup UIs, settings Account |
| Schema | `prisma/schema.prisma` (`Goal` already present; use it) |
| Auth clients | `lib/supabase/server.ts` |

## Existing utilities to reuse

- `createClient` / `getAuthUser` / `getAuthUserId` — `lib/supabase/server.ts`
- OAuth start pattern — `app/api/auth/oauth/route.ts`
- Callback exchange — `app/auth/callback/route.ts`
- `safeRedirectPath` — `lib/utils/safe-redirect.ts`
- `getActiveGoal` — `progress.repository.ts`
- `GoalProgress` component states
- `calculateGoalFromTimeline` / `calculateFullProfile` — `lib/engine/tdee.ts`
- Onboarding skip/store patterns — `stores/onboarding-store.ts`

## Out of scope (unless requested later)

- Apple/Facebook providers  
- Force-merge dual-account admin UI  
- Disconnect Google / passwordless-only accounts  
- Changing RLS policies (linking is auth-layer; app tables stay RLS-locked to `user_id`)  
- Full goal checkpoint / midpoint LLM system (schema exists; product Phase 2 only needs ACTIVE goal + display)

## Implementation note (from project Agents.md)

This Next.js version may differ from training defaults. Before coding API routes or app router patterns, check `node_modules/next/dist/docs/` for current conventions.

---

## Suggested PR breakdown (when executing)

1. **PR1** — Exercise browser scrollbar UX  
2. **PR2** — Persist + display goal weight; skip goal  
3. **PR3** — Auth identities API + login error UX + Supabase config docs  
4. **PR4** — linkIdentity flow + email match + callback  
5. **PR5** — Connect Google card (dashboard + settings)  
6. **PR6** — Reverse Google→password flows + set password  

Each PR is independently testable; PRs 4–6 depend on 3.
