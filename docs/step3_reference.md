# Step 3: Features — Reference File

> **Completed**: July 7, 2026
> **TypeScript Errors**: 0
> **Files Created**: 35

---

## What Step 3 Does

Step 3 takes the pure engine functions (Step 2) and the foundation infrastructure (Step 1) and connects them through a full-stack feature set that users actually interact with.

**In one sentence**: Step 3 built the entire working application — from database queries, through server-side business logic, through API endpoints, through client-side data hooks, all the way to the UI components the user sees and touches.

---

## Architecture Layers (How Every Request Flows)

```
┌─────────────────────────────────────────────────┐
│  UI Component  (React — what user sees)          │
│  e.g., CalorieRing, MealSection, SetLogger       │
│                                                   │
│  Calls hooks ↓                                    │
├─────────────────────────────────────────────────┤
│  TanStack Hook  (Client — caching + mutations)   │
│  e.g., useDailySummary, useLogFood, useLogWeight  │
│                                                   │
│  Calls API via fetch() ↓                          │
├─────────────────────────────────────────────────┤
│  API Route  (Server — auth + validation)          │
│  e.g., GET /api/nutrition/daily                   │
│  Checks Supabase auth → calls service ↓           │
├─────────────────────────────────────────────────┤
│  Service  (Server — business logic)               │
│  e.g., nutrition.service.ts                       │
│  Fetches food → multiplies by quantity → calls ↓  │
├─────────────────────────────────────────────────┤
│  Repository  (Server — raw Prisma queries)        │
│  e.g., nutrition.repository.ts                    │
│  prisma.mealFood.create() → PostgreSQL ↓          │
├─────────────────────────────────────────────────┤
│  Supabase PostgreSQL  (Cloud database)            │
│  Tables: meal_entries, meal_foods, workout_...    │
└─────────────────────────────────────────────────┘
```

---

## Phase 3A: Onboarding Step 4 Redesign

### Changed Files

| File | What Changed |
|------|-------------|
| [onboarding.schema.ts](file:///c:/Fitness_app/lib/validators/onboarding.schema.ts) | Added `targetWeightKg` (optional number) and `timelineMonths` (optional, 1-24) to step4Schema |
| [step-4-goal.tsx](file:///c:/Fitness_app/app/(app)/onboarding/_components/step-4-goal.tsx) | Replaced 4 static buttons with 5 body goal modes + target weight + timeline slider + live engine preview |
| [profile.service.ts](file:///c:/Fitness_app/lib/services/profile.service.ts) | Passes `dietaryType` to both `calculateFullProfile()` and `recalculateProfile()` |

### Body Goal Modes (Plain Language)

| Mode | Maps To | Deficit |
|------|---------|---------|
| 🔥 Lean Cut | LOSE_FAT | 400–600 kcal deficit |
| 💪 Lean Muscle | RECOMP | 200–400 kcal deficit |
| 🎯 Six Pack / Abs | LOSE_FAT | 500–700 kcal deficit |
| 🏋️ Muscle Bulk | GAIN_MUSCLE | 200–300 kcal surplus |
| ⚖️ Maintain | MAINTAIN | No change |

---

## Phase 3B: All New Files

### Repositories (Data Access)

| File | Key Functions |
|------|-------------|
| [nutrition.repository.ts](file:///c:/Fitness_app/lib/repositories/nutrition.repository.ts) | `getDailySummary()` (Prisma aggregate — single query), `getMealEntriesByDate()`, `logFood()` (upserts meal entry in transaction), `deleteMealFood()` (cleans up empty entries) |
| [workout.repository.ts](file:///c:/Fitness_app/lib/repositories/workout.repository.ts) | `createSession()`, `getSessionsByDate()` (includes exercise sets + exercise details), `addSet()`, `completeSession()`, `getWorkoutBurnByDate()`, `deleteSession()` (verifies ownership) |
| [progress.repository.ts](file:///c:/Fitness_app/lib/repositories/progress.repository.ts) | `logWeight()` (upsert — one per day), `getWeightHistory()` (90 days), `getWeightLogCount()`, `getLatestWeight()`, `getActiveGoal()` |

### Services (Business Logic)

| File | Key Functions |
|------|-------------|
| [nutrition.service.ts](file:///c:/Fitness_app/lib/services/nutrition.service.ts) | `logFoodItem()` — fetches Food record → multiplies nutrition by quantity → applies restaurant multiplier → saves |
| [workout.service.ts](file:///c:/Fitness_app/lib/services/workout.service.ts) | `finishSession()` — splits duration between strength/cardio → calls `calculateStrengthBurnSimple()` + `calculateCardioBurn()` → saves burn RANGE |
| [progress.service.ts](file:///c:/Fitness_app/lib/services/progress.service.ts) | `getProgressData()` — parallel fetches history + latest + first + count + goal → calculates total change |

### API Routes

| Route | File |
|-------|------|
| `GET /api/nutrition/daily?date=YYYY-MM-DD` | [route.ts](file:///c:/Fitness_app/app/api/nutrition/daily/route.ts) |
| `POST /api/nutrition/log` | [route.ts](file:///c:/Fitness_app/app/api/nutrition/log/route.ts) |
| `DELETE /api/nutrition/log` | Same file |
| `POST /api/workout` | [route.ts](file:///c:/Fitness_app/app/api/workout/route.ts) |
| `GET /api/workout?date=YYYY-MM-DD` | Same file |
| `POST /api/workout/[id]/sets` | [route.ts](file:///c:/Fitness_app/app/api/workout/[id]/sets/route.ts) |
| `PUT /api/workout/[id]/sets` | Same file (finish session) |
| `POST /api/progress/weight` | [route.ts](file:///c:/Fitness_app/app/api/progress/weight/route.ts) |
| `GET /api/progress/weight` | Same file |
| `PUT /api/profile` | [route.ts](file:///c:/Fitness_app/app/api/profile/route.ts) (added to existing GET) |

### TanStack Query Hooks

| File | Hooks |
|------|-------|
| [use-daily-summary.ts](file:///c:/Fitness_app/lib/hooks/use-daily-summary.ts) | `useDailySummary(date)` — staleTime: 30s |
| [use-nutrition.ts](file:///c:/Fitness_app/lib/hooks/use-nutrition.ts) | `useMealsForDate(date)`, `useLogFood(date)`, `useDeleteFood(date)` |
| [use-workout.ts](file:///c:/Fitness_app/lib/hooks/use-workout.ts) | `useWorkoutsForDate(date)`, `useStartSession(date)`, `useLogSet(date)`, `useFinishSession(date)` |
| [use-progress.ts](file:///c:/Fitness_app/lib/hooks/use-progress.ts) | `useProgressData()`, `useLogWeight()` |

### UI Components

| Page | Components |
|------|-----------|
| **Dashboard** | [date-strip.tsx](file:///c:/Fitness_app/app/(app)/dashboard/_components/date-strip.tsx), [calorie-ring.tsx](file:///c:/Fitness_app/app/(app)/dashboard/_components/calorie-ring.tsx), [macro-bars.tsx](file:///c:/Fitness_app/app/(app)/dashboard/_components/macro-bars.tsx), [goal-progress.tsx](file:///c:/Fitness_app/app/(app)/dashboard/_components/goal-progress.tsx), [workout-info.tsx](file:///c:/Fitness_app/app/(app)/dashboard/_components/workout-info.tsx), [today-meals.tsx](file:///c:/Fitness_app/app/(app)/dashboard/_components/today-meals.tsx) |
| **Nutrition** | [food-search-modal.tsx](file:///c:/Fitness_app/app/(app)/nutrition/_components/food-search-modal.tsx), [meal-section.tsx](file:///c:/Fitness_app/app/(app)/nutrition/_components/meal-section.tsx) |
| **Workout** | [exercise-browser.tsx](file:///c:/Fitness_app/app/(app)/workout/_components/exercise-browser.tsx), [set-logger.tsx](file:///c:/Fitness_app/app/(app)/workout/_components/set-logger.tsx), [session-summary.tsx](file:///c:/Fitness_app/app/(app)/workout/_components/session-summary.tsx) |
| **Progress** | [weight-chart.tsx](file:///c:/Fitness_app/app/(app)/progress/_components/weight-chart.tsx), [weight-log-input.tsx](file:///c:/Fitness_app/app/(app)/progress/_components/weight-log-input.tsx), [stats-cards.tsx](file:///c:/Fitness_app/app/(app)/progress/_components/stats-cards.tsx) |
| **Settings** | [settings/page.tsx](file:///c:/Fitness_app/app/(app)/settings/page.tsx) |

---

## Critical Rules Enforced

### 1. Double Counting Prevention
- Workout calories are `INFORMATION ONLY` — they are NEVER added to the daily budget
- The `WorkoutInfo` component on the dashboard shows an "Info only" badge
- The TDEE already includes gym activity via the activity multiplier (1.55× for MODERATE)
- This is enforced in the UI, API route comments, and service layer comments

### 2. Cache Invalidation Chain
Every mutation automatically invalidates related queries:
```
useLogFood.onSuccess → invalidate ["nutrition", "meals", date] + ["nutrition", "daily", date]
useDeleteFood.onSuccess → same invalidations
useLogSet.onSuccess → invalidate ["workout", "sessions", date]
useFinishSession.onSuccess → same
useLogWeight.onSuccess → invalidate ["progress", "weight"]
PUT /api/profile (Settings) → client invalidates ["profile"]
```

### 3. SVG vs Charting Library
- CalorieRing → pure SVG (20 lines vs 50KB library)
- MacroBars → pure CSS div widths
- WeightChart → pure SVG with gradient + grid
- No Recharts dependency needed for Step 3

### 4. Engine Function Signatures (Must Match)
```typescript
// CORRECT (positional args):
calculateStrengthBurnSimple(durationMin, weightKg, rpe)
calculateCardioBurn(metValue, weightKg, durationMin)
calculateBMR(sex, weightKg, heightCm, age)
calculateTDEE(bmr, activityLevel)

// WRONG (DO NOT use object args — these are not the signatures):
calculateStrengthBurn({ bodyWeightKg, durationMinutes, ... }) // ❌
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard shows 0 calories | Check `useDailySummary` — is the date correct? Is there food logged for that date? |
| Workout burn shows NaN | Check `calculateStrengthBurnSimple` args order — must be (durationMin, weightKg, rpe) |
| Profile recalculate fails | Check `PUT /api/profile` — does `recalculateProfile` get `dietaryType`? |
| Food search returns empty | Check Step 2 seed data — were 150 foods seeded? Run `prisma db seed` |
| Weight chart doesn't show | Need 2+ weight log entries — chart requires at least 2 data points |
| TypeScript error on map callback | Remove explicit type annotations on `.map()` callbacks — let TS infer from hook return type |
