# FitLog Step 2 — File Structure + Interview Prep

---

## Part 1: File Structure (New Files Added in Step 2)

```
c:\Fitness_app\
│
├── 📁 lib/
│   │
│   ├── 📁 engine/                      CALORIE MATH ENGINE — pure functions, no database
│   │   │                               Takes numbers in, returns numbers out
│   │   │                               Zero imports from database or Supabase
│   │   │                               Safe to unit test in isolation
│   │   │
│   │   ├── 📄 index.ts                 BARREL EXPORT
│   │   │                               Re-exports everything from all 7 engine files
│   │   │                               Other files import from "@/lib/engine" not
│   │   │                               individual files. One import covers all.
│   │   │
│   │   ├── 📄 tdee.ts                  CORE CALCULATOR — most important engine file
│   │   │                               calculateBMR(): weight, height, age, sex → kcal
│   │   │                               Uses Mifflin-St Jeor formula
│   │   │                               calculateTDEE(): BMR × activity multiplier
│   │   │                               calculateTargetCalories(): TDEE + goal adjustment
│   │   │                               calculateMacroSplit(): protein first, fat second,
│   │   │                                 carbs as remainder (round only at the end)
│   │   │                               calculateFullProfile(): runs all above in sequence
│   │   │
│   │   ├── 📄 cardio.ts                CARDIO BURN CALCULATOR
│   │   │                               Uses MET (Metabolic Equivalent of Task) values
│   │   │                               Formula: MET × weight_kg × duration_hours
│   │   │                               Returns calories burned with ±15% margin of error
│   │   │                               MET values: walking=3.5, running=10, cycling=8
│   │   │
│   │   ├── 📄 strength.ts              WEIGHT TRAINING BURN CALCULATOR
│   │   │                               Splits workout into active (lifting) + rest periods
│   │   │                               Active time: higher MET (5.0)
│   │   │                               Rest time: near-resting MET (1.5)
│   │   │                               Adjusts by RPE (Rate of Perceived Exertion)
│   │   │                               RPE 7 = easier set → 0.9× multiplier
│   │   │                               RPE 10 = max effort → 1.15× multiplier
│   │   │
│   │   ├── 📄 steps.ts                 STEP COUNT → CALORIE CONVERTER
│   │   │                               Accounts for user's body weight
│   │   │                               Heavier person burns more per step
│   │   │                               Formula based on stride length estimation
│   │   │
│   │   ├── 📄 intensity.ts             WHO INTENSITY MINUTES TRACKER
│   │   │                               Classifies activities as moderate or vigorous
│   │   │                               WHO target: 150 moderate OR 75 vigorous per week
│   │   │                               Returns weekly intensity score
│   │   │
│   │   ├── 📄 adaptive-tdee.ts         SELF-CORRECTING TDEE ENGINE
│   │   │                               After 14+ days of real data, calculates actual TDEE
│   │   │                               Formula: uses real weight change + calorie intake
│   │   │                               1 kg fat = 7,700 calories of stored energy
│   │   │                               More accurate than any formula after 2 weeks
│   │   │                               Replaces the static Mifflin-St Jeor estimate
│   │   │
│   │   └── 📄 safety.ts                SAFETY GUARD — prevents dangerous recommendations
│   │                                   checkCalorieFloor(): never below 1,500 (men)
│   │                                     or 1,200 (women)
│   │                                   TODO (Step 3): checkFatGramFloor() — fat must not
│   │                                     go below 0.5g × weight_kg (hormone health)
│   │                                   TODO (Step 3): checkWeeklyLossRate() — max 1%
│   │                                     of body weight per week
│   │
│   ├── 📁 repositories/                DATA ACCESS LAYER — only raw Prisma queries here
│   │   │                               No business logic. No calculations.
│   │   │                               Just: read from DB, write to DB, return result.
│   │   │
│   │   └── 📄 profile.repository.ts    USER + PROFILE DATABASE OPERATIONS
│   │                                   createUserWithProfile(): single transaction
│   │                                     Step A: prisma.user.upsert() — creates/updates user
│   │                                     Step B: prisma.profile.upsert() — creates/updates profile
│   │                                     Both wrapped in prisma.$transaction()
│   │                                     If either fails → BOTH rolled back (no orphans)
│   │                                   getProfileByUserId(): fetches profile + linked user
│   │                                   updateProfile(): recalculates and saves new targets
│   │                                   isUserOnboarded(): quick boolean check for proxy
│   │
│   ├── 📁 services/                    BUSINESS LOGIC LAYER
│   │   │                               Orchestrates: validates → calculates → saves
│   │   │                               Calls engine + repository, never calls DB directly
│   │   │
│   │   └── 📄 profile.service.ts       ONBOARDING + PROFILE BUSINESS LOGIC
│   │                                   completeOnboarding():
│   │                                     1. Calculate exact age from date of birth
│   │                                        (handles whether birthday passed this year)
│   │                                     2. Call calculateFullProfile() from engine
│   │                                     3. Call createUserWithProfile() from repository
│   │                                     4. Return saved profile + calculated numbers
│   │                                   getUserProfile(): thin wrapper over repository
│   │                                   recalculateProfile(): when user updates weight/goal
│   │                                     in settings, merges with current data and
│   │                                     recalculates all targets
│   │
│   ├── 📁 validators/                  ZOD VALIDATION SCHEMAS
│   │   │                               Shared between client (form validation) and
│   │   │                               server (API route validation)
│   │   │                               TypeScript types derived from schemas — always in sync
│   │   │
│   │   └── 📄 onboarding.schema.ts     5 STEP SCHEMAS + COMBINED SCHEMA
│   │                                   step1Schema: name, dateOfBirth, sex
│   │                                   step2Schema: weightKg (30-300), heightCm (100-250)
│   │                                   step3Schema: activityLevel enum
│   │                                   step4Schema: goal enum
│   │                                   step5Schema: dietaryType, strictness, unitSystem
│   │                                   onboardingSchema: all 5 merged together
│   │                                   OnboardingFormData: TypeScript type from schema
│   │
│   └── 📁 hooks/                       TANSTACK QUERY HOOKS — client-side data fetching
│       │                               Replace useState + useEffect + fetch manually
│       │                               Auto-cache, auto-retry, auto-deduplication
│       │
│       ├── 📄 use-profile.ts           PROFILE DATA HOOK
│       │                               Fetches GET /api/profile
│       │                               Cache: 2 minutes (profile rarely changes)
│       │                               Retry: once on failure
│       │                               queryKey: ["profile"]
│       │
│       ├── 📄 use-food-search.ts       FOOD SEARCH HOOK
│       │                               Fetches GET /api/foods/search?q=...
│       │                               Only runs when query is 2+ characters
│       │                               Cache: 5 minutes (food data is static)
│       │                               Keeps previous results while new ones load
│       │                               queryKey: ["foods", "search", query]
│       │
│       └── 📄 use-exercises.ts         EXERCISE LIST HOOK
│                                       Fetches GET /api/exercises with filters
│                                       Optional filters: muscleGroup, category, query
│                                       Cache: 10 minutes (exercise data never changes)
│                                       queryKey: ["exercises", options]
│
│
├── 📁 app/
│   └── 📁 api/                         API ROUTES — server-side only, no UI
│       │                               Every route checks auth first (supabase.getUser)
│       │                               Returns 401 if no valid session
│       │
│       ├── 📁 onboarding/
│       │   └── 📄 route.ts             POST /api/onboarding
│       │                               Called when user completes the 5-step wizard
│       │                               Step 1: Auth check (who is making this request?)
│       │                               Step 2: Parse request body (JSON)
│       │                               Step 3: Zod validate all fields
│       │                               Step 4: Call completeOnboarding() from service
│       │                               Step 5: Return 201 with profile + calculated numbers
│       │                               User ID comes from SESSION, not request body
│       │                               (prevents creating profiles for other users)
│       │
│       ├── 📁 profile/
│       │   └── 📄 route.ts             GET /api/profile
│       │                               Returns current user's profile data
│       │                               Used by dashboard header, settings, hooks
│       │                               Returns 404 with isOnboarded:false if no profile
│       │
│       ├── 📁 health/
│       │   └── 📄 route.ts             GET /api/health
│       │                               Runs: SELECT 1 (trivial DB query)
│       │                               Returns: status, timestamp, dbLatencyMs
│       │                               Pinged by GitHub Actions every 3 days
│       │                               Keeps Supabase free tier from pausing
│       │
│       ├── 📁 foods/
│       │   └── 📁 search/
│       │       └── 📄 route.ts         GET /api/foods/search?q=roti&limit=20
│       │                               Case-insensitive search across name, nameHindi,
│       │                               category columns
│       │                               Max limit: 50 results (prevents overload)
│       │                               Returns array of food items with full macro data
│       │
│       └── 📁 exercises/
│           └── 📄 route.ts             GET /api/exercises?muscle=Chest&category=COMPOUND
│                                       Optional filters: muscle group, category, name search
│                                       Returns exercises with MET values and instructions
│
│
├── 📁 app/(app)/onboarding/            ONBOARDING WIZARD PAGES
│   │
│   ├── 📄 page.tsx                     SERVER COMPONENT — the gatekeeper
│   │                                   Runs on the server before any UI renders
│   │                                   Step 1: createClient() → getUser()
│   │                                   Step 2: isUserOnboarded(userId) from repository
│   │                                   If already onboarded → redirect("/dashboard")
│   │                                   If not → render <OnboardingShell />
│   │
│   └── 📁 _components/                 CLIENT COMPONENTS (underscore = internal only)
│       │
│       ├── 📄 onboarding-shell.tsx     WIZARD CONTAINER + SUBMISSION HANDLER
│       │                               useOnboardingStore() → reads current step + data
│       │                               Renders Step 1-5 components based on currentStep
│       │                               Shows progress bar (currentStep / 5 × 100%)
│       │                               handleSubmit(): validates full form → POST to API
│       │                               On success: reset store → router.push("/dashboard")
│       │                               On failure: shows error message above submit button
│       │
│       ├── 📄 step-1-identity.tsx      WHO ARE YOU? — Name, Date of Birth, Sex
│       │                               step1Schema.safeParse() on "Continue" click
│       │                               Sex selection: large tap-friendly toggle buttons
│       │                               Date input with [color-scheme:dark] fix for browser
│       │
│       ├── 📄 step-2-body.tsx          YOUR BODY — Weight (kg), Height (cm)
│       │                               Live BMI preview updates as user types
│       │                               BMI categories: Underweight/Normal/Overweight/Obese
│       │                               step2Schema validates range limits
│       │
│       ├── 📄 step-3-activity.tsx      ACTIVITY LEVEL — 5 option cards with emoji
│       │                               Large tap-friendly cards (full width)
│       │                               Options: Sedentary / Lightly Active /
│       │                                 Moderately Active / Very Active / Extremely Active
│       │                               Continue disabled until selection made
│       │
│       ├── 📄 step-4-goal.tsx          FITNESS GOAL — 4 option cards
│       │                               NOTE: This file needs redesign in Step 3
│       │                               Current: Lose Fat / Gain Muscle / Maintain / Recomp
│       │                               Future: Target weight + timeline + body mode
│       │                               Cards show calorie adjustment explanation
│       │
│       └── 📄 step-5-preferences.tsx   PREFERENCES — Diet type, Strictness
│                                       Dietary: Vegetarian / Non-Veg / Vegan / Eggetarian
│                                       Strictness: Relaxed / Moderate / Strict
│                                       Submit button has loading spinner + gradient style
│                                       isSubmitting prop passed from onboarding-shell
│
│
├── 📁 stores/
│   └── 📄 onboarding-store.ts          ZUSTAND STORE FOR WIZARD STATE
│                                       Holds form data across all 5 steps in memory
│                                       currentStep: 1-5
│                                       formData: Partial<OnboardingFormData>
│                                       nextStep() / prevStep() / setStep()
│                                       updateFormData(): merges partial updates
│                                       reset(): clears everything after successful submit
│                                       WHY ZUSTAND: if each step used useState locally,
│                                         going back to step 2 would lose step 1 data.
│                                         Global store preserves everything.
│
│
├── 📁 prisma/
│   │
│   ├── 📄 seed.ts                      MASTER SEED ENTRY POINT
│   │                                   Imports PrismaPg adapter (required for Prisma 7 CLI)
│   │                                   Calls seedFoods() then seedExercises() in sequence
│   │                                   Uses direct connection (port 5432, not pooler)
│   │                                   Run with: npx prisma db seed
│   │
│   ├── 📁 seeds/
│   │   │
│   │   ├── 📄 seed-foods.ts            FOOD SEED ORCHESTRATOR
│   │   │                               Reads from data/foods-indian-prepared.ts
│   │   │                               Reads from data/foods-manual.ts
│   │   │                               Uses prisma.food.upsert() — safe to run multiple times
│   │   │                               Upsert: if food exists → update; if not → create
│   │   │                               Total: ~150 foods inserted
│   │   │
│   │   ├── 📄 seed-exercises.ts        EXERCISE SEED ORCHESTRATOR
│   │   │                               Reads from data/exercises.ts
│   │   │                               Uses prisma.exercise.upsert() — safe to re-run
│   │   │                               Total: 155 exercises inserted
│   │   │
│   │   └── 📁 data/
│   │       ├── 📄 foods-indian-prepared.ts  ~120 INDIAN DISHES
│   │       │                               Dal, roti, rice, sabzi, street food
│   │       │                               Includes nameHindi, category, restaurantMultiplier
│   │       │                               caloriesPer100g + protein + carbs + fat + fiber
│   │       │                               defaultUnit (katori/roti/piece/cup)
│   │       │
│   │       ├── 📄 foods-manual.ts      ~65 GYM AND INTERNATIONAL FOODS
│   │       │                               Eggs, chicken, protein powder, oats
│   │       │                               International: pasta, pizza, burger estimates
│   │       │
│   │       └── 📄 exercises.ts         155 EXERCISES WITH MET VALUES
│   │                                   8 muscle groups: Chest, Back, Legs, Shoulders,
│   │                                     Arms, Core, Cardio, Full Body, Mobility
│   │                                   Each has: name, MET value, isCompound, equipment,
│   │                                     instructions for correct form
│   │
│   └── 📁 migrations/
│       └── 📁 20260706_add_dietary_type/
│           └── 📄 migration.sql        ADDS DietaryType ENUM + COLUMN
│                                       ALTER TYPE adds: VEG, NON_VEG, VEGAN, EGGETARIAN
│                                       ALTER TABLE Profile adds dietaryType column
│
│
└── 📁 .github/workflows/
    └── 📄 keepalive.yml                SUPABASE KEEP-ALIVE CRON
                                        Runs: every 3 days at 06:00 UTC
                                        Action: curl GET /api/health
                                        If response ≠ 200 → workflow fails → GitHub alert
                                        Cost: $0 (GitHub Actions free minutes)
                                        Purpose: Supabase pauses free projects after
                                          7 days of inactivity. This prevents that.
```

---

### How Step 2 Files Connect to Each Other

```
USER SUBMITS ONBOARDING FORM
         │
         ▼
onboarding-shell.tsx
  └── reads formData from onboarding-store.ts (Zustand)
  └── validates with onboardingSchema from validators/onboarding.schema.ts
  └── POST fetch → /api/onboarding
         │
         ▼
app/api/onboarding/route.ts
  └── imports createClient from lib/supabase/server.ts (Step 1 file)
  └── imports onboardingSchema from lib/validators/onboarding.schema.ts
  └── imports completeOnboarding from lib/services/profile.service.ts
         │
         ▼
lib/services/profile.service.ts
  └── imports calculateFullProfile from lib/engine/index.ts
  │       │
  │       ▼
  │   lib/engine/tdee.ts
  │     └── calculateBMR() → calculateTDEE() → calculateTargetCalories()
  │     └── calculateMacroSplit() → protein, fat, carbs (unrounded until end)
  │     └── returns { tdee, targetCalories, targetProtein, targetCarbs, targetFat }
  │
  └── imports createUserWithProfile from lib/repositories/profile.repository.ts
          │
          ▼
      lib/repositories/profile.repository.ts
        └── imports prisma from lib/supabase/prisma.ts (Step 1 file)
        └── prisma.$transaction([
              prisma.user.upsert(...),     ← writes to User table
              prisma.profile.upsert(...)   ← writes to Profile table
            ])
        └── Both succeed together OR both fail together (atomic)
         │
         ▼
     SUPABASE POSTGRESQL
       User table: id, email, name, avatarUrl
       Profile table: userId, age, weight, TDEE, targetCalories, macros...
```

```
USER OPENS DASHBOARD (Step 3+ — hook already built)
         │
         ▼
lib/hooks/use-profile.ts
  └── useQuery({ queryKey: ["profile"] })
  └── TanStack Query checks cache → hit? → return cached data instantly
  └── miss? → fetch GET /api/profile
         │
         ▼
app/api/profile/route.ts
  └── imports createClient from lib/supabase/server.ts
  └── imports getUserProfile from lib/services/profile.service.ts
  └── returns profile JSON → cached for 2 minutes
```

```
USER TYPES IN FOOD SEARCH BOX
         │
         ▼
lib/hooks/use-food-search.ts
  └── useQuery({ queryKey: ["foods", "search", "roti"], enabled: query.length >= 2 })
  └── fetch GET /api/foods/search?q=roti
         │
         ▼
app/api/foods/search/route.ts
  └── imports prisma from lib/supabase/prisma.ts
  └── prisma.food.findMany({ where: { name: { contains: query, mode: "insensitive" } }})
  └── returns array of foods → cached 5 minutes by TanStack Query
```

```
HOW ONBOARDING PAGE DECIDES WHAT TO SHOW
         │
         ▼
app/(app)/onboarding/page.tsx  [SERVER COMPONENT]
  └── imports createClient from lib/supabase/server.ts
  └── imports isUserOnboarded from lib/repositories/profile.repository.ts
  └── isUserOnboarded checks Profile table for this userId
  └── true? → redirect("/dashboard")
  └── false? → render <OnboardingShell />
```

---
---

## Part 2: Interview Questions — "What If This Goes Wrong?"

---

### Category 1: Calorie Engine

---

**Q: What if the calorie engine gives a user a dangerously low calorie target?**

Two safety layers protect against this.

Layer 1 is `safety.ts`. The `checkCalorieFloor()` function runs after every calculation. If the target falls below 1,500 calories for men or 1,200 for women, the engine ignores the calculated deficit and returns the floor value instead.

Layer 2 is the adaptive TDEE system. After 14 days of real weight logging, `adaptive-tdee.ts` detects if the user is losing weight too fast (more than the expected rate). The system flags this and suggests the user slightly increase their intake.

What is NOT yet protected (TODO for Step 3): the fat gram floor. A lighter woman on a very aggressive cut could have fat grams drop below 0.5g per kg, which is needed for hormone production. The `checkFatGramFloor()` function needs to be added to `safety.ts`.

---

**Q: The calorie engine gives one number to everyone at the same activity level. What if the formula is just wrong for a specific user?**

Mifflin-St Jeor is an estimate based on population averages. It cannot know if someone has unusually high muscle mass (higher real BMR) or unusual metabolism.

This is exactly why `adaptive-tdee.ts` exists. After 14+ days of real data, the engine calculates actual TDEE from real weight change and actual calories eaten. This self-corrects for whatever the formula got wrong. The formula is only the starting point — real data replaces it within two weeks.

---

**Q: What if a user exercises but the workout logger adds those calories to their daily budget, and they overeat?**

This is one of the biggest accuracy risks we identified and have explicitly decided against.

The TDEE already includes gym activity via the activity multiplier (MODERATE = 1.55×). If workout session calories were added on top, gym time would be counted twice. A MODERATE user could silently overeat by 300-500 calories per day.

Our official decision: workout session calories are shown as information only ("you burned ~350 kcal today") and are never added to the daily calorie budget. This rule must be documented with a comment in every workout-related API route when built in Step 3.

---

**Q: What if the macro calculation gives a user a protein target they cannot realistically eat?**

The original engine used 2.2g protein per kg — a competitive bodybuilder number. For an 82kg person, that is 180g per day. On a normal Indian diet without heavy supplementation, a person realistically gets 75-100g from food.

We identified this as a problem and made an official decision to replace the single hardcoded multiplier with a tiered system based on the user's actual goal:
- Maintain: 1.4g/kg
- Lose fat: 1.6g/kg
- Lean muscle: 1.8g/kg
- Bulk: 2.0g/kg
- Competitive athlete: 2.2g/kg
- Vegetarian users: reduce by 0.2g/kg

This fix is to be applied to `lib/engine/tdee.ts` at the start of Step 3 before any dashboard is built.

---

### Category 2: Database Transactions and Seeding

---

**Q: What if the onboarding form saves to the User table but the Profile table write fails? You have a user with no profile.**

This is exactly why we use `prisma.$transaction()`. Both writes — `prisma.user.upsert()` and `prisma.profile.upsert()` — are wrapped in a single transaction. PostgreSQL treats them as one atomic unit: either both succeed or neither does.

If the profile write fails for any reason, PostgreSQL automatically rolls back the user write as well. The user can retry onboarding and the transaction runs cleanly again. There is no state where a user exists without a profile.

---

**Q: What if the database seed runs twice? You get 300 duplicate foods and 310 exercises.**

We use `upsert()` instead of `create()` in both `seed-foods.ts` and `seed-exercises.ts`. `upsert` means: if a record with this unique identifier already exists, update it; if it does not exist, create it.

The unique identifier for foods is the `name` field. If you run `npx prisma db seed` ten times, the database still has exactly 150 foods and 155 exercises — no duplicates, no errors.

---

**Q: The seed fails halfway through. 80 foods are inserted but the rest are not. How do you fix it?**

Because we use `upsert()`, you simply run `npx prisma db seed` again. It processes all 150 foods from the data file. The 80 that already exist get updated (no-op, same data). The remaining 70 get created. End result: all 150 foods, no duplicates, no manual cleanup needed.

If the seed fails due to a data error (malformed macro data, invalid enum value), fix the data in the `data/` files and re-run the seed. The terminal output shows which exact record caused the failure.

---

**Q: The DietaryType migration ran on your local machine but not on production Supabase. Your Profile model has a dietaryType column locally but not in production. What happens?**

Every `prisma.profile.upsert()` call in `profile.repository.ts` includes a `dietaryType` field. If the column does not exist in production, Prisma throws a column-not-found error on every onboarding attempt. Every new user trying to sign up gets an error.

The fix: run `npx prisma migrate deploy` (not `dev`) from the CI/CD pipeline or manually in Vercel's build hook. The `deploy` command applies pending migrations without creating new ones. After this, the `dietaryType` column exists in production and the error stops.

Prevention: always test that `DATABASE_URL` in the Vercel environment points to the Supabase production database before going live.

---

### Category 3: API Routes

---

**Q: What if someone calls POST /api/onboarding without logging in and puts in a fake user ID?**

They cannot inject a user ID at all. The API route does not accept a user ID from the request body. It calls `supabase.auth.getUser()` which reads the session cookie from the browser. The user ID comes entirely from the verified session.

If there is no valid session, `getUser()` returns an error. The route immediately returns `401 Unauthorized` and stops. No data is ever read or written.

---

**Q: What if the food search API gets abused — someone writes a bot that calls it 10,000 times a second?**

Two protections:

Protection 1: The route requires a valid Supabase session. A bot without a logged-in session gets a 401 on every call and cannot reach the database.

Protection 2: The route enforces a result limit (`Math.min(limit, 50)`). Even if a request asks for 1,000 results, it only ever returns 50. Each database query is bounded.

For Step 3, if we add Redis rate limiting, it goes specifically on LLM and auth routes — not on food search, which is read-only and session-protected.

---

**Q: What if /api/health returns 503 at 3am when the GitHub Actions keep-alive cron runs?**

The `keepalive.yml` workflow checks the HTTP response code. If it is not 200, the workflow step fails. GitHub marks the workflow run as failed and sends an email notification to the repository owner.

This gives an alert that something is wrong with either the app or the database. The most common reasons: Supabase free tier has paused the project (the irony — the keep-alive itself proved the project needs the keep-alive), or Vercel has a temporary outage.

Fix: visit Supabase dashboard → your project → click Restore. Wait 30-60 seconds. The project resumes and subsequent health checks pass.

---

### Category 4: Onboarding Wizard

---

**Q: User fills out all 5 steps, clicks "Complete Setup," and the API returns an error. What does the user see? Is their data lost?**

The data is safe in the Zustand store throughout the entire process. The store is only cleared after a successful API response. If the API returns an error, `handleSubmit()` in `onboarding-shell.tsx` catches it, shows the error message below the submit button, and leaves the user exactly where they are — step 5, all their data still in the form.

The user can read the error, fix any issue, and try again. Their name, weight, height, activity level, and all previous choices are still there.

---

**Q: User fills step 1 through 3, then closes the browser. They come back later. Do they have to start over?**

Yes, in the current implementation. Zustand stores state in memory. When the browser tab closes, all state is lost. The user comes back to `/onboarding` and starts from step 1 again.

The alternative would be to persist the Zustand store to `localStorage` using the `zustand/middleware` `persist` option. This would save the partial wizard state across sessions. This is a Step 3 polish item — it is not implemented yet.

---

**Q: The user is on step 4 and clicks the browser back button. What happens?**

The wizard's Back and Continue buttons call `prevStep()` and `nextStep()` from the Zustand store — they only change the `currentStep` number inside the store. The browser's back button navigates browser history, which for a single-page application goes back to wherever the user came from before `/onboarding`.

If the user presses the browser back button, they leave the `/onboarding` page entirely. When they come back to `/onboarding` (by typing the URL or clicking a link), the Zustand store still has their data from steps 1-3 in memory, so they see step 5 again (last step they were on). Wait — actually the `currentStep` is still stored in the Zustand store, so they resume at step 4.

However, if they navigated to a completely different page and back, the Zustand store reset would not have been called. They resume at step 4 with all their data still intact.

---

### Category 5: TanStack Query Hooks

---

**Q: 10 different components on the dashboard all call useProfile(). Does that trigger 10 separate API calls?**

No. This is one of TanStack Query's core features called deduplication. All 10 components use the same `queryKey: ["profile"]`. When the first component mounts and triggers the query, TanStack Query starts fetching. When the other 9 components mount and request the same key, they are all subscribed to the same in-flight request. Only one API call is ever made. All 10 components receive the same data when it arrives.

---

**Q: What if the profile API is temporarily down? The user opens the dashboard and nothing loads.**

TanStack Query has a `retry: 1` setting in `use-profile.ts`. On the first failure, it automatically retries once after a short delay. If the retry also fails, it puts the query into an error state and returns `{ error, isError: true }`.

The dashboard component checks `isError` and shows a fallback UI ("Unable to load your profile. Please refresh.") instead of crashing. The user sees a meaningful message rather than a blank screen or an unhandled error.

---

**Q: A user searches for "paneer" in the food log. The results appear. They search for "dal". Then they search for "paneer" again. Does it hit the API three times?**

No — only twice. The third search for "paneer" hits the TanStack Query cache. The queryKey `["foods", "search", "paneer"]` was already fetched and cached with a 5-minute staleTime. The cached result is returned instantly with zero API calls. The cache lives until 5 minutes after the first "paneer" search.

---

### Category 6: Supabase Keep-Alive

---

**Q: What if the GitHub Actions keep-alive cron itself fails silently for two weeks? Supabase pauses and all users get database errors.**

The cron is set to run every 3 days. If GitHub Actions has an outage or the workflow fails, GitHub sends a workflow failure email to the repository owner. The failure is not silent — it shows up in the GitHub Actions tab with a red X and triggers an email notification.

However, this depends on the repository owner monitoring their email. A more robust approach for Step 4 would be to add a second independent ping from a service like UptimeRobot (free tier, external monitoring), which runs completely outside GitHub and checks the health endpoint every 5 minutes.

---

**Q: The Supabase project pauses despite the keep-alive. How do you restore it?**

1. Go to supabase.com → sign in → find your project
2. The dashboard shows "Project Paused" with a Restore button
3. Click Restore — takes 30-60 seconds
4. All data is intact. Supabase pausing only stops the database from accepting connections — it does not delete data
5. Visit your app, health check passes, everything works

Prevention: if this keeps happening, check the keep-alive workflow logs. The most common reason the keep-alive fails to prevent pausing is that the Vercel deployment itself is down (returning non-200), so the health check ping does not count as real activity from Supabase's perspective.
