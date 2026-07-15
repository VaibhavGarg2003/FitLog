# Auth Linking, Goal Weight & Exercise UX — Implementation

_What was built, in what order, how each piece works, and the mental model behind it._

This document records the implementation of the merged plan (an external plan +
three verified corrections). It is written so a future reader can understand the
**why**, not just the diff.

---

## Mental model (read this first)

Three ideas underpin everything below:

1. **Identity ≠ data.** A person has ONE `auth.users` row (their identity) and
   ONE `public.users` row + app data, joined by the **same UUID**. "Connecting
   Google" adds a second *identity* to the same auth user — it never creates a
   second user, so profile/workouts/nutrition/progress are untouched by
   construction. The only dangerous path is a *logged-out* OAuth that mints a new
   user; we avoid it by linking only while logged in.

2. **Two stores, one response.** Current weight + macros live on the `Profile`
   row; the *target* weight lives on a separate `Goal` row. `GET /api/profile`
   now returns both (`profile` + `activeGoal`) so the dashboard/settings can show
   a target without a second request.

3. **Fail closed, prevent then cure.** For Google linking we both *prevent* the
   wrong-account mistake (`login_hint` pre-selects the right Google account) and
   *cure* it (the callback unlinks a mismatched account). On any failure, nothing
   changes.

---

## Implementation sequence (the order it was built, and why)

UX fixes first (no auth risk), then goals (self-contained data feature), then
the auth work from foundation → linking → UX, because each auth step depends on
the previous one.

| Phase | What | Why here |
|-------|------|----------|
| 1 | Exercise chip scrollbar | Trivial, isolated, immediate win |
| 2 | Goal persist + display + skip | Self-contained; no auth coupling |
| 3 | Auth identities API + login errors | Foundation the linking UI reads |
| 6-fix | Duplicate-signup detection + add-password route | Closes the silent dead-end before more users hit it |
| 4 | Connect-Google link flow | Core linking + wrong-account rules |
| 5 | Settings account card | UI on top of 3+4+6 |

---

## Phase 1 — Exercise browser filter bar

**Problem:** the muscle-group chip row used `overflow-x-auto`, so 9 chips wider
than the modal drew a chunky horizontal scrollbar (ugly on Windows/desktop).
Also, `date-strip` referenced a `.scrollbar-hide` class that **was never defined**
— so its scrollbar showed too.

**Fix:**
- Defined the missing `.scrollbar-hide` utility once in
  [`app/globals.css`](../app/globals.css) (`scrollbar-width: none` +
  `::-webkit-scrollbar { display:none }`). This fixes `date-strip` for free.
- [`exercise-browser.tsx`](<../app/(app)/workout/_components/exercise-browser.tsx>):
  chip row is now `overflow-x-auto scrollbar-hide lg:flex-wrap lg:overflow-visible`
  — swipeable with no bar on mobile, and **wraps to show every filter at once**
  on laptop.

**Mental model:** on touch devices, hide the bar but keep the swipe; on desktop,
there's room to wrap so nothing scrolls at all.

---

## Phase 2 — Goal weight: persist, display, skip

**Root cause found:** onboarding *collected* `targetWeightKg` + `timelineMonths`,
but `completeOnboarding()` **silently dropped them** and never wrote a `Goal`
row; the dashboard hard-coded `targetWeight={null}`. The whole pipeline existed
except the write.

**What was built:**
- **Persist (atomic).** [`profile.repository.ts`](../lib/repositories/profile.repository.ts)
  `createUserWithProfile()` gained an `extras` arg and now, **in the same
  transaction**, also (a) seeds an onboarding-day `WeightLog` (so the Progress
  page has a start/current point) and (b) creates the `ACTIVE` `Goal`
  (retiring any prior active goal first — the "one active goal" invariant).
- **Decide when to create a goal.** [`profile.service.ts`](../lib/services/profile.service.ts)
  `completeOnboarding()` builds the goal only when the user picked a real target
  (not Maintain, not skipped, and target ≠ current). It always seeds the initial
  weight log.
- **Expose it.** `getUserProfile()` now returns `{ ...profile, activeGoal }`
  (reusing `getActiveGoal`), so `GET /api/profile` carries the goal.
- **Show it.** The dashboard [`goal-progress.tsx`] card now receives
  `targetWeight = activeGoal.targetValue`, `startWeight = activeGoal.startValue`
  — the card already knew how to render a progress bar. Progress page works too
  (it already read `activeGoal`).
- **Edit it.** New [`api/goals/route.ts`](../app/api/goals/route.ts) (`POST` set /
  `DELETE` remove) + repo `setActiveGoal` / `abandonActiveGoals`, driven by a new
  Settings [`goal-card.tsx`](<../app/(app)/settings/_components/goal-card.tsx>).
- **Skip it.** [`step-4-goal.tsx`](../app/onboarding/_components/step-4-goal.tsx)
  keeps the goal *mode* required (the calorie engine needs it) but adds a
  **"Skip — I'll set a target later"** link that proceeds without a target → no
  goal row → dashboard shows the goal type with no progress bar.

**Mental model:** goal *mode* → drives calorie/macro math (always needed).
Target *weight* → optional; it's what turns on the progress bar. They're stored
in different tables and combined at read time.

**Verified:** DB-level test confirmed the goal insert (enums/columns), the
one-active-goal invariant, and cascade cleanup.

---

## Phase 3 — Auth identities foundation

The app now runs auth entirely through server routes (`/api/auth/*`, httpOnly
cookies). To build linking UI we first need to know what's connected.

- New [`api/auth/identities/route.ts`](../app/api/auth/identities/route.ts) →
  `{ email, providers, hasPassword, hasGoogle }` from Supabase (`user.identities`).
- [`login-form.tsx`](<../app/(auth)/login/login-form.tsx>): surfaces
  `?error=auth_failed` from the OAuth callback as a banner, and on a failed
  password login adds a **generic** hint ("Signed up with Google? Use Continue
  with Google") — deliberately non-enumerating (never confirms an email is
  Google-only to a stranger).

---

## Phase 6-fix — Duplicate email signup (the silent dead-end)

**The trap:** with Supabase's email-enumeration protection ON (default),
`signUp()` for an already-registered email returns **no error** and a decoy user
with an **empty `identities` array** — and sends no email. The old route replied
`needsConfirmation: true`, so the UI showed "Check your email" *forever*.

**Fix:** [`api/auth/signup/route.ts`](../app/api/auth/signup/route.ts) now detects
`data.user.identities?.length === 0` → returns `409 { code: "ACCOUNT_EXISTS" }`.
[`signup/page.tsx`](<../app/(auth)/signup/page.tsx>) shows a dedicated screen:
_"You already have an account"_ + **Continue with Google** + **Go to login** —
never a dead end.

**Mirror flow (Google-only → wants a password):** new
[`api/auth/password/route.ts`](../app/api/auth/password/route.ts) (`updateUser({ password })`)
adds a password identity to the **same** auth user. Surfaced in Settings (Phase 5).

---

## Phase 4 — Connect Google (linking) + wrong-account rules

**Start:** [`api/auth/link/google/route.ts`](../app/api/auth/link/google/route.ts)
— for the logged-in user, calls `linkIdentity({ provider: 'google' })` with
`login_hint: user.email` (pre-selects the right Google account) and
`redirectTo=/auth/callback?flow=link`.

**Finish + enforce:** [`auth/callback/route.ts`](../app/auth/callback/route.ts)
branches on `flow=link`. After the code exchange it compares the linked Google
identity's email to the account email:

| Outcome | Handling |
|---------|----------|
| Emails match | redirect `/settings?linked=google` (same user id, +1 identity) |
| **Wrong account** (mismatch) | `unlinkIdentity()` to undo → `/settings?error=google_email_mismatch`. Nothing else changes. |
| Link error (e.g. manual linking off, or Google already linked elsewhere) | `/settings?error=link_failed` |

**Why data is safe:** linking only adds an `auth.identities` row under the same
`auth.users.id`; there is **no code path** from linking into any app table, and
onboarding never re-runs (`isUserOnboarded` stays true). Same UUID → same data.

---

## Phase 5 — Settings account UX

New [`signin-methods-card.tsx`](<../app/(app)/settings/_components/signin-methods-card.tsx>)
(mounted in Settings, wrapped in `<Suspense>` because it reads `useSearchParams`):
- Reads `/api/auth/identities`; shows Email ✓ / Google ✓ or a **Connect** /
  **Add password** action as appropriate.
- **Connect** → `/api/auth/link/google`. **Add password** → inline form →
  `/api/auth/password`.
- Translates the callback's `?linked` / `?error` params into friendly banners.
- Google-only users get an inline "Add password" form; email-only users get a
  "Connect Google for one-tap sign-in" nudge.

---

## Files added / changed

**Added:** `api/goals/route.ts`, `api/auth/identities/route.ts`,
`api/auth/link/google/route.ts`, `api/auth/password/route.ts`,
`settings/_components/goal-card.tsx`, `settings/_components/signin-methods-card.tsx`.

**Changed:** `globals.css`, `exercise-browser.tsx`, `profile.repository.ts`,
`progress.repository.ts`, `profile.service.ts`, `use-profile.ts`,
`dashboard/page.tsx`, `step-4-goal.tsx`, `settings/page.tsx`,
`login-form.tsx`, `signup/page.tsx`, `signup/route.ts`, `auth/callback/route.ts`.

---

## Verification status

- ✅ `npx tsc --noEmit` clean; `npm run build` passes (all new routes registered).
- ✅ Goal write-path verified at the DB level (insert, one-active invariant, cascade).
- ⚠️ **Not yet exercised in a browser** (auth-gated + external OAuth): the goal
  UI, the signup/login CTA screens, and the full Google link/unlink round-trip.
- ⚠️ **Runtime-untested by nature:** the linking flow needs a real Google OAuth
  round-trip.

## Required Supabase dashboard actions (cannot be done from code)

1. **Auth → Settings → enable "Allow manual linking"** — `linkIdentity` errors
   (→ `link_failed`) until this is on. Required for Phase 4/5.
2. **Auth → URL Configuration → Redirect URLs** must include `/auth/callback`
   and `/confirmed` (prod + localhost).
3. Keep Supabase's **automatic linking ON** (default) — it merges a same-verified-
   email Google sign-in into the existing account. Do **not** disable it.

## Deliberately out of scope

Apple/Facebook providers; a dual-account merge/admin tool; disconnecting the last
identity; goal checkpoints / midpoint LLM review (schema exists, unused here).
