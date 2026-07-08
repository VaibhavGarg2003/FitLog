# Step 3: Features — Complete Walkthrough

> **What this document is**: A teaching guide explaining everything built in Step 3 — what each file does, why it exists, how they all connect, and the theory behind every decision.

---

## The Big Picture: What Step 3 Actually Did

Steps 1 and 2 were invisible to users:
- **Step 1** built the skeleton (Next.js, auth, routes, stores)
- **Step 2** built the brain (calorie engine, food database, exercise database)

**Step 3 connected the skeleton to the brain and put a face on it.**

After Step 3, we have a working app with:
- A **Dashboard** that shows daily calories, macros, and workout info
- A **Nutrition Logger** where users search foods and log meals
- A **Workout Logger** where users log gym sessions and sets
- A **Progress Page** with weight tracking and goal progress
- A **Settings Page** to update profile and recalculate targets

---

## How The Layers Connect (The Full Stack)

Every feature follows the same 5-layer pattern. Understanding this once means you understand all of them.

### Layer 1: Repository (Data Access)
**What it does**: Talks to the database. Nothing else.
**Files**: `lib/repositories/*.repository.ts`
**Example**: `nutrition.repository.ts`

```typescript
// This function sends a SQL query to Supabase PostgreSQL via Prisma
export async function getDailySummary(userId: string, date: string) {
  return prisma.mealFood.aggregate({
    where: { mealEntry: { userId, date: new Date(date) } },
    _sum: { calories: true, protein: true, carbs: true, fat: true },
  });
}
```

**Why separate?** If we switch from Prisma to Drizzle or raw SQL someday, only this layer changes. Everything above stays the same.

---

### Layer 2: Service (Business Logic)
**What it does**: Calls repositories + adds business logic + calls the engine.
**Files**: `lib/services/*.service.ts`
**Example**: `nutrition.service.ts`

```typescript
export async function logFoodItem(userId, data) {
  // 1. Look up the food in the database (repository call)
  const food = await prisma.food.findUnique({ where: { id: data.foodId } });

  // 2. BUSINESS LOGIC: Calculate nutrition from quantity
  const multiplier = data.quantityGrams / 100;
  const calories = food.caloriesPer100g * multiplier;

  // 3. Save to database (repository call)
  return logFood(userId, { ...data, calories });
}
```

**Why separate from repository?** The repository is dumb — it just reads/writes. The service is smart — it knows that "logging 80g of roti" means "look up roti's calories per 100g, multiply by 0.8, then save."

---

### Layer 3: API Route (Server Endpoint)
**What it does**: Receives HTTP requests from the browser, checks auth, calls the service, returns JSON.
**Files**: `app/api/*/route.ts`
**Example**: `app/api/nutrition/log/route.ts`

```typescript
export async function POST(request: NextRequest) {
  // 1. AUTH CHECK — is the user logged in?
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. PARSE — what did the user send?
  const body = await request.json();

  // 3. DELEGATE — let the service handle the logic
  const result = await logFoodItem(user.id, body);

  // 4. RESPOND
  return NextResponse.json(result, { status: 201 });
}
```

**Why does auth happen here and not in the service?** Because auth is a web concern (HTTP headers, cookies). The service is pure business logic — it takes a userId and trusts it. The API route is the gatekeeper.

---

### Layer 4: TanStack Hook (Client-Side Cache)
**What it does**: Fetches data from the API and caches it. Provides mutations that auto-update the cache.
**Files**: `lib/hooks/*.ts`
**Example**: `lib/hooks/use-nutrition.ts`

```typescript
export function useLogFood(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/nutrition/log", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      // CACHE INVALIDATION: After logging food, tell TanStack
      // "the daily summary is stale — refetch it"
      queryClient.invalidateQueries({ queryKey: ["nutrition", "daily", date] });
    },
  });
}
```

**Why TanStack instead of raw fetch?** Because TanStack gives you:
- **Caching**: 10 components using `useDailySummary()` → only 1 API call
- **Auto-refresh**: When the cache is stale, it refetches in the background
- **Invalidation**: When you log food, the dashboard automatically updates

---

### Layer 5: UI Component (What the User Sees)
**What it does**: Reads data from hooks, renders the UI, handles user interactions.
**Files**: `app/(app)/*/_components/*.tsx`
**Example**: `CalorieRing`

```typescript
export function CalorieRing({ consumed, target }) {
  const percentage = (consumed / target) * 100;
  // SVG circle with stroke-dashoffset for animated fill
  // Color changes: green → amber → red as percentage increases
}
```

---

## How Step 3 Connects to Step 1 and Step 2

### Connections to Step 1 (Foundation)

| Step 1 File | Used By Step 3 |
|------------|----------------|
| `stores/ui-store.ts` (Zustand) | `DateStrip` reads/writes `selectedDate` — ALL data queries use this date |
| `components/shared/bottom-nav.tsx` | App layout wraps all pages with the bottom nav bar |
| `app/(app)/layout.tsx` | All 5 pages live inside this layout (provides padding for bottom nav) |
| `lib/supabase/server.ts` | Every API route uses `createClient()` for auth checks |
| `lib/utils/cn.ts` | Used throughout all UI components for conditional classNames |

### Connections to Step 2 (Core Data)

| Step 2 File | Used By Step 3 |
|------------|----------------|
| `lib/engine/tdee.ts` | `calculateGoalFromTimeline()` → Step 4 live preview. `calculateFullProfile()` → Settings recalculation |
| `lib/engine/strength.ts` | `calculateStrengthBurnSimple()` → called when finishing a workout session |
| `lib/engine/cardio.ts` | `calculateCardioBurn()` → called for cardio exercises in a session |
| `lib/engine/safety.ts` | Safety checks run during engine calculations |
| `lib/hooks/use-profile.ts` | Dashboard reads profile targets (targetCalories, targetProtein, etc.) |
| `lib/hooks/use-food-search.ts` | Food search modal uses this to search 150 seeded foods |
| `lib/hooks/use-exercises.ts` | Exercise browser uses this to browse 155 seeded exercises |
| `lib/repositories/profile.repository.ts` | `getProfileByUserId()` used by Settings recalculation |

---

## The 5 Critical Rules

### Rule 1: Double Counting Prevention
The TDEE formula already includes gym activity:
```
BMR × 1.55 (MODERATE) = TDEE that assumes 3-5 gym sessions/week
```

If we also add workout calories to the budget:
```
TDEE (2,695) + gym burn (350) = 3,045 ← WRONG, double counted
```

**How we enforce this:**
- `WorkoutInfo` component shows "Info only" badge
- Comment in `workout.repository.ts`: "INFORMATION ONLY"
- Comment in `workout.service.ts`: "NEVER added to daily calorie budget"
- Dashboard displays burn as a range "~320–380 kcal" (honest about uncertainty)

### Rule 2: Engine Function Signatures
The engine uses **positional arguments**, not object arguments:
```typescript
// ✅ CORRECT
calculateStrengthBurnSimple(45, 82, 7)  // (durationMin, weightKg, rpe)
calculateCardioBurn(9.0, 82, 20)        // (metValue, weightKg, durationMin)

// ❌ WRONG — this is what caused the Step 3 TypeScript errors
calculateStrengthBurn({ bodyWeightKg: 82, ... })
```

### Rule 3: Cache Invalidation Chain
Every mutation must invalidate related caches so the UI stays in sync:
```
Log food → invalidate ["nutrition", "daily", date]
         → Dashboard CalorieRing auto-refreshes ✅

Log weight → invalidate ["progress", "weight"]
           → Progress chart auto-refreshes ✅

Update profile → invalidate ["profile"]
               → Dashboard targets auto-refresh ✅
```

### Rule 4: SVG Over Charting Libraries
We used pure SVG for the calorie ring, macro bars, and weight chart. Why?
- CalorieRing = 1 SVG circle with `stroke-dashoffset`. Recharts would add ~50KB for this.
- MacroBars = CSS div with percentage width. No library needed.
- WeightChart = SVG path from data points. Simple enough without Recharts.

### Rule 5: Profile API Response Shape
Changed from `{ profile: {...} }` to returning the profile object directly. The `useProfile` hook was updated to match: `return res.json()` instead of `return data.profile`.

---

## Page-by-Page Breakdown

### Dashboard (`/dashboard`)
**Job**: Show the user's daily overview at a glance.

**Data sources**:
- `useProfile()` → targets (from Step 2 engine calculation during onboarding)
- `useDailySummary(selectedDate)` → consumed (from Step 3 nutrition logs)

**Components**: DateStrip → CalorieRing → MacroBars → GoalProgress → WorkoutInfo → TodayMeals

### Nutrition (`/nutrition`)
**Job**: Log what you eat.

**Flow**: User taps "Add Food" → FoodSearchModal opens → user types "roti" → useFoodSearch (Step 2) fires → user selects → enters quantity → taps "Log Food" → useLogFood mutation → POST /api/nutrition/log → service calculates from food DB → saves → cache invalidated → dashboard updates

### Workout (`/workout`)
**Job**: Log gym sessions.

**Flow**: Tap "Start Workout" → session created (RECALL mode) → tap "Add Exercise" → ExerciseBrowser opens → select exercise → SetLogger appears → enter weight/reps → tap "Log Set" → repeat → tap "Finish" → engine calculates burn range → session saved as COMPLETED

### Progress (`/progress`)
**Job**: Track body weight over time.

**Components**: WeightLogInput → StatsCards → WeightChart → Adaptive TDEE notice (shows after 14+ weight logs)

### Settings (`/settings`)
**Job**: Update profile and recalculate targets.

**Flow**: Change weight/activity/goal/diet → tap "Recalculate Targets" → PUT /api/profile → `recalculateProfile()` reruns `calculateFullProfile()` (Step 2 engine) → new targets saved → profile cache invalidated → dashboard picks up new targets

---

## Files Created in Step 3

**Total**: 35 files

- 3 repositories
- 3 services
- 4 hooks
- 6 API routes (across 6 files)
- 6 dashboard components + 1 page
- 2 nutrition components + 1 page
- 3 workout components + 1 page
- 3 progress components + 1 page
- 1 settings page

**Modified**: 4 existing files
- `lib/validators/onboarding.schema.ts`
- `app/(app)/onboarding/_components/step-4-goal.tsx`
- `lib/services/profile.service.ts`
- `app/api/profile/route.ts`
- `lib/hooks/use-profile.ts`

---

## Verification
- `npx tsc --noEmit` → **0 errors** ✅
- All engine functions called with correct positional signatures
- All API routes follow auth → validate → service → respond pattern
- All mutation hooks invalidate the correct cache keys
- `CONTEXT.md` updated with full Step 3 documentation
