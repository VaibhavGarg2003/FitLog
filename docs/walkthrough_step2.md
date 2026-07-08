# Step 2: Core Data — Full Walkthrough

> **What was built**: Food database (150 entries), Exercise database (155 entries), Calorie engine (7 math modules), 5-step onboarding wizard, API routes, TanStack Query hooks, and Supabase keep-alive cron.
>
> **Build status**: ✅ `tsc --noEmit` zero errors, `npm run build` 18 routes, `prisma db seed` 305 entries.

---

## What Step 2 Added to the Project

### Before Step 2 (End of Step 1)
```
User logs in with Google → lands on /dashboard → sees empty placeholder page.
No profile exists. No food data. No exercise data. No calorie calculations.
```

### After Step 2
```
User logs in with Google → /onboarding page checks if profile exists → 
  If no profile → 5-step wizard collects body data → 
    calorie engine calculates TDEE/macros → 
    profile saved to Supabase → redirect to /dashboard.
  If profile exists → redirect to /dashboard directly.

Database now has:
  - 150 foods (searchable via API)
  - 155 exercises (filterable by muscle group)
  - User's profile with calculated targets
```

---

## How Step 1 Files Connect to Step 2 Files

```
STEP 1 (Foundation)                    STEP 2 (Core Data)
════════════════════                   ═══════════════════

proxy.ts                               
  └─ Still guards all routes            (No change needed)
  └─ /onboarding is already protected

lib/supabase/server.ts ─────────────► app/api/onboarding/route.ts
  (creates authenticated                  (imports createClient() to
   Supabase client)                        verify who is making the request)

lib/supabase/prisma.ts ─────────────► lib/repositories/profile.repository.ts
  (Prisma singleton)                      (imports prisma to run queries)
                                     ► app/api/foods/search/route.ts
                                          (imports prisma for food search)
                                     ► app/api/exercises/route.ts
                                          (imports prisma for exercise list)
                                     ► app/api/health/route.ts
                                          (imports prisma for DB health ping)

prisma/schema.prisma ───────────────► prisma/seeds/seed-foods.ts
  (defines Food, Exercise models)        (creates data matching those models)
                                     ► lib/engine/tdee.ts
                                          (calorie calculations stored in
                                           Profile model fields)

components/providers/query-provider ► lib/hooks/use-profile.ts
  (wraps app in QueryClientProvider)     (useQuery works because the
                                          provider is set up in Step 1)

stores/ui-store.ts ─────────────────► stores/onboarding-store.ts
  (Zustand pattern reused)               (same Zustand create() pattern)

lib/utils/cn.ts ────────────────────► All Step 2 UI components
  (class merger utility)                 (onboarding steps use cn() everywhere)

app/(app)/layout.tsx ───────────────► app/(app)/onboarding/page.tsx
  (wraps with BottomNav)                 (onboarding page is a child of this layout)
```

---

## The Complete Onboarding Flow (Step by Step)

Here is exactly what happens when a user signs up and completes onboarding:

### 1. User clicks "Sign in with Google" on `/login`

```
login-form.tsx → supabase.auth.signInWithOAuth({ provider: 'google' })
  → Browser redirects to Google
  → User approves
  → Google redirects to /auth/callback?code=xxx
  → app/auth/callback/route.ts exchanges code for session
  → Redirect to /dashboard
```

### 2. Proxy intercepts the `/dashboard` request

```
proxy.ts → updateSession() → user exists → route is protected → ALLOW
  → Next.js renders app/(app)/layout.tsx → renders /dashboard page
```

### 3. Eventually user visits `/onboarding` (or we redirect them there)

```
app/(app)/onboarding/page.tsx [SERVER COMPONENT]:
  1. createClient() → supabase.auth.getUser() → gets user ID
  2. isUserOnboarded(userId) → queries profiles table
  3. Profile not found or isOnboarded=false → render <OnboardingShell />
  4. If isOnboarded=true → redirect("/dashboard")
```

### 4. User fills out the 5-step wizard

```
<OnboardingShell /> [CLIENT COMPONENT]:
  ├─ useOnboardingStore() ← Zustand global state
  ├─ currentStep = 1
  │
  ├─ Step 1: User enters name, DOB, sex
  │   └─ updateFormData({ name: "Vaibhav", dateOfBirth: "2003-...", sex: "MALE" })
  │   └─ step1Schema.safeParse() → validates → nextStep()
  │
  ├─ Step 2: User enters weight (75) and height (175)
  │   └─ updateFormData({ weightKg: 75, heightCm: 175 })
  │   └─ BMI preview calculates: 75 / (1.75)² = 24.5 → "Normal weight"
  │   └─ step2Schema.safeParse() → validates → nextStep()
  │
  ├─ Step 3: User selects "Moderately Active"
  │   └─ updateFormData({ activityLevel: "MODERATE" })
  │   └─ nextStep()
  │
  ├─ Step 4: User selects "Gain Muscle"
  │   └─ updateFormData({ goal: "GAIN_MUSCLE" })
  │   └─ nextStep()
  │
  └─ Step 5: User selects "Non-Veg", "Moderate" strictness
      └─ updateFormData({ dietaryType: "NON_VEG", strictness: "MODERATE" })
      └─ Clicks "Complete Setup"
      └─ handleSubmit() called
```

### 5. handleSubmit sends data to the API

```
handleSubmit() in onboarding-shell.tsx:
  1. onboardingSchema.safeParse(formData) → validates ALL fields together
  2. fetch("/api/onboarding", { method: "POST", body: JSON.stringify(data) })
```

### 6. API route receives the request

```
app/api/onboarding/route.ts:
  1. createClient() → supabase.auth.getUser() → { id: "abc-123", email: "vaibhav@..." }
  2. Parse request body (JSON)
  3. onboardingSchema.safeParse(body) → validates on server too (double validation)
  4. completeOnboarding(user, validatedData) → calls the service layer
```

### 7. Service layer calculates everything and saves

```
lib/services/profile.service.ts → completeOnboarding():
  1. Calculate age: 2026 - 2003 = 23 years old
  
  2. calculateFullProfile() from lib/engine/tdee.ts:
     BMR = (10 × 75) + (6.25 × 175) - (5 × 23) + 5
         = 750 + 1093.75 - 115 + 5
         = 1,733 kcal/day
     
     TDEE = 1,733 × 1.55 (MODERATE multiplier)
          = 2,686 kcal/day
     
     Target = 2,686 + 300 (GAIN_MUSCLE surplus)
            = 2,986 kcal/day
     
     Macros:
       Protein = 75kg × 2.2 = 165g (660 kcal)
       Fat     = 2,986 × 0.25 / 9 = 83g (747 kcal)
       Carbs   = (2,986 - 660 - 747) / 4 = 395g
  
  3. createUserWithProfile() from lib/repositories/profile.repository.ts:
     prisma.$transaction():
       a. prisma.user.upsert({ id: "abc-123", email: "vaibhav@...", name: "Vaibhav" })
       b. prisma.profile.upsert({
            userId: "abc-123",
            age: 23,
            heightCm: 175,
            weightKg: 75,
            sex: "MALE",
            activityLevel: "MODERATE",
            goal: "GAIN_MUSCLE",
            dietaryType: "NON_VEG",
            tdee: 2686,
            targetCalories: 2986,
            targetProtein: 165,
            targetCarbs: 395,
            targetFat: 83,
            isOnboarded: true
          })
```

### 8. Success — redirect to dashboard

```
onboarding-shell.tsx:
  1. res.ok → true
  2. reset() → clears Zustand store
  3. router.push("/dashboard")
  4. router.refresh() → re-runs server components
```

### 9. Next time user visits `/onboarding`

```
page.tsx → isUserOnboarded("abc-123") → true → redirect("/dashboard")
User never sees the wizard again.
```

---

## The Architecture Pattern: Controller → Service → Repository

### Why Three Layers?

```
┌─────────────────────────────────────────┐
│  API ROUTE (Controller)                 │  ← Thin. Only: auth, parse, validate, respond.
│  app/api/onboarding/route.ts            │     Does NOT contain business logic.
├─────────────────────────────────────────┤
│  SERVICE (Business Logic)               │  ← Thick. Contains: calculations, decisions,
│  lib/services/profile.service.ts        │     orchestration. Calls engine + repository.
├─────────────────────────────────────────┤
│  REPOSITORY (Data Access)               │  ← Thin. Only: raw Prisma queries.
│  lib/repositories/profile.repository.ts │     Does NOT contain business logic.
├─────────────────────────────────────────┤
│  DATABASE (PostgreSQL via Prisma)       │
│  prisma/schema.prisma                   │
└─────────────────────────────────────────┘
```

### Why not put everything in the API route?

If you put all logic in the route:
```typescript
// ❌ BAD: Everything in one file
export async function POST(request) {
  const user = await getUser();
  const body = await request.json();
  const bmr = 10 * body.weightKg + 6.25 * body.heightCm - 5 * age + 5;
  const tdee = bmr * 1.55;
  // ... 50 more lines of calculations ...
  await prisma.user.create({ ... });
  await prisma.profile.create({ ... });
  return NextResponse.json({ ... });
}
```

Problems:
1. **Can't reuse**: If the settings page also recalculates TDEE, you copy-paste the math.
2. **Can't test**: You need a running HTTP server to test calorie calculations.
3. **Can't swap**: If you switch from Prisma to Drizzle, you rewrite every route.

With three layers:
```typescript
// ✅ GOOD: Each layer has one job
// Route: just orchestrate
const result = await completeOnboarding(user, validatedData);

// Service: business logic (reusable from settings page, admin panel, import script)
const calculated = calculateFullProfile(input);
await createUserWithProfile(userData, profileData);

// Repository: raw queries (swap Prisma for Drizzle here, nothing else changes)
await prisma.profile.upsert({ ... });

// Engine: pure math (testable without ANY database)
calculateBMR("MALE", 75, 175, 23) // → 1733
```

---

## The Calorie Engine — How Each Module Works

### TDEE Calculator (`lib/engine/tdee.ts`)

The foundation. Everything else builds on this.

```
User Input → BMR → TDEE → Target Calories → Macro Split

BMR (Basal Metabolic Rate):
  = Calories your body burns lying in bed all day
  = 10 × weight + 6.25 × height - 5 × age ± sex constant

TDEE (Total Daily Energy Expenditure):
  = BMR × activity multiplier
  = How many calories you ACTUALLY burn in a day

Target Calories:
  = TDEE + goal adjustment
  = TDEE - 500 (fat loss) or TDEE + 300 (muscle gain)

Macro Split:
  Protein = body weight × multiplier (1.8-2.2g per kg)
  Fat = 25% of total calories ÷ 9 kcal/g
  Carbs = remaining calories ÷ 4 kcal/g
```

### Cardio Calculator (`lib/engine/cardio.ts`)

```
Calories = MET × weight_kg × duration_hours

MET = Metabolic Equivalent of Task
  1 MET = sitting still
  Running (10 km/h) = 10 MET = 10× more energy than sitting

Example: Running 30 min, 75 kg person
  = 10 × 75 × 0.5 = 375 kcal (± 15% → 319-431 kcal range)
```

### Strength Calculator (`lib/engine/strength.ts`)

```
Unlike cardio, strength training is INTERMITTENT:
  30 sec lifting + 90 sec resting + 30 sec lifting + ...

So we split:
  Active burn = LIFTING_MET(5.0) × weight × active_time
  Rest burn   = RESTING_MET(1.5) × weight × rest_time
  Total       = active + rest, adjusted by RPE multiplier

RPE 7 (typical working set) → 0.9× multiplier
RPE 10 (max effort) → 1.15× multiplier
```

### Adaptive TDEE (`lib/engine/adaptive-tdee.ts`)

```
After 14+ days of real data, we can calculate your ACTUAL TDEE:

1. You ate 2,500 kcal/day for 14 days = 35,000 total
2. You lost 0.5 kg
3. 0.5 kg fat = 3,850 kcal deficit
4. Actual TDEE = (35,000 + 3,850) / 14 = 2,775 kcal/day

This is MORE accurate than any formula because it uses
YOUR body's actual response to food and exercise.
```

---

## The Food Search — How It Works End to End

```
User types "rot" in search box
  ↓
useFoodSearch("rot") hook
  ↓ enabled: query.length >= 2 ✓ (3 chars)
  ↓ queryKey: ["foods", "search", "rot"]
  ↓ TanStack Query checks cache → miss → calls queryFn
  ↓
fetch("/api/foods/search?q=rot&limit=20")
  ↓
app/api/foods/search/route.ts
  ↓ Auth check: supabase.auth.getUser() → valid
  ↓ Parse query: q="rot", limit=20
  ↓
prisma.food.findMany({
  where: { name: { contains: "rot", mode: "insensitive" } },
  take: 20
})
  ↓
PostgreSQL: SELECT * FROM foods WHERE name ILIKE '%rot%' LIMIT 20
  ↓
Returns: [
  { name: "Roti / Chapati", caloriesPer100g: 297, ... },
  { name: "Protein Bar (Generic)", caloriesPer100g: 350, ... }
]
  ↓
TanStack Query caches result for 5 minutes
  ↓ queryKey: ["foods", "search", "rot"] → cached
  ↓
Next time user types "rot" → instant result from cache, no API call
```

---

## Summary of All New Files

| File | Layer | Purpose |
|------|-------|---------|
| `lib/engine/tdee.ts` | Engine | BMR, TDEE, target calories, macro split |
| `lib/engine/cardio.ts` | Engine | MET-based cardio burn calculator |
| `lib/engine/strength.ts` | Engine | RPE-adjusted strength burn calculator |
| `lib/engine/steps.ts` | Engine | Step count → calorie converter |
| `lib/engine/intensity.ts` | Engine | WHO weekly intensity minutes |
| `lib/engine/adaptive-tdee.ts` | Engine | Real-data TDEE adjustment |
| `lib/engine/safety.ts` | Engine | Calorie floor + deficit rate checks |
| `lib/engine/index.ts` | Engine | Barrel export |
| `lib/repositories/profile.repository.ts` | Repository | Raw Prisma queries |
| `lib/services/profile.service.ts` | Service | Onboarding + recalculation logic |
| `lib/validators/onboarding.schema.ts` | Validator | Zod schemas (5 steps + combined) |
| `lib/hooks/use-profile.ts` | Hook | TanStack Query: profile (2min cache) |
| `lib/hooks/use-food-search.ts` | Hook | TanStack Query: food search (5min cache) |
| `lib/hooks/use-exercises.ts` | Hook | TanStack Query: exercises (10min cache) |
| `app/api/onboarding/route.ts` | API | POST: complete onboarding |
| `app/api/profile/route.ts` | API | GET: user profile |
| `app/api/health/route.ts` | API | GET: health check + DB ping |
| `app/api/foods/search/route.ts` | API | GET: food search |
| `app/api/exercises/route.ts` | API | GET: exercise list |
| `app/(app)/onboarding/page.tsx` | Page | Server component (auth + redirect) |
| `app/(app)/onboarding/_components/*` | UI | 5 wizard step components |
| `stores/onboarding-store.ts` | Store | Zustand wizard state |
| `prisma/seed.ts` | Seed | Master seed entry point |
| `prisma/seeds/seed-foods.ts` | Seed | Food insert orchestrator |
| `prisma/seeds/seed-exercises.ts` | Seed | Exercise insert orchestrator |
| `prisma/seeds/data/foods-indian-prepared.ts` | Data | ~120 Indian dishes |
| `prisma/seeds/data/foods-manual.ts` | Data | ~65 gym/international foods |
| `prisma/seeds/data/exercises.ts` | Data | 155 exercises with MET values |
| `.github/workflows/keepalive.yml` | CI/CD | Supabase keep-alive cron |
