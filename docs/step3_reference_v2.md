# FitLog Step 3 — File Structure + Interview Prep

---

## Part 1: File Structure (New Files Added in Step 3)

```
c:\Fitness_app\
│
├── 📁 lib/
│   │
│   ├── 📁 repositories/                    DATA ACCESS LAYER — only raw Prisma queries
│   │   │                                   No business logic. No calculations.
│   │   │                                   Profile repository was already here (Step 2).
│   │   │                                   Three new repositories added in Step 3:
│   │   │
│   │   ├── 📄 nutrition.repository.ts      MEAL + FOOD DATABASE OPERATIONS
│   │   │                                   getDailySummary(): prisma.mealFood.aggregate()
│   │   │                                     SINGLE query — sums calories, protein,
│   │   │                                     carbs, fat for a user on a date
│   │   │                                     Returns totals used by the calorie ring
│   │   │                                   getMealEntriesByDate(): all meal entries for
│   │   │                                     a date, includes mealFoods and food details
│   │   │                                   logFood(): prisma.$transaction()
│   │   │                                     Step A: findFirst → does meal entry exist?
│   │   │                                     Step B: if not → create MealEntry
│   │   │                                     Step C: create MealFood under that entry
│   │   │                                     Both in one transaction — no orphan entries
│   │   │                                   deleteMealFood(): verifies userId ownership,
│   │   │                                     deletes MealFood, then checks if MealEntry
│   │   │                                     is now empty — if yes, deletes entry too
│   │   │                                     (cleanup prevents ghost empty meal sections)
│   │   │
│   │   ├── 📄 workout.repository.ts        WORKOUT SESSION + SETS DATABASE OPERATIONS
│   │   │                                   createSession(): new WorkoutSession row
│   │   │                                     status = IN_PROGRESS
│   │   │                                     startedAt = now() for LIVE mode
│   │   │                                   getSessionsByDate(): all sessions for a date
│   │   │                                     includes exerciseSets with exercise details
│   │   │                                     (name, muscleGroup, category, metValue)
│   │   │                                   addSet(): new ExerciseSet row under a session
│   │   │                                     links to session + exercise reference table
│   │   │                                   completeSession(): updates session to COMPLETED
│   │   │                                     sets durationMin, caloriesBurnedLow,
│   │   │                                     caloriesBurnedHigh, endedAt, rpe, notes
│   │   │                                   getWorkoutBurnByDate(): lightweight query
│   │   │                                     only reads caloriesBurnedLow/High + duration
│   │   │                                     used by the dashboard WorkoutInfo card
│   │   │                                   deleteSession(): verifies userId ownership first
│   │   │                                     Cascade set in schema: deleting session
│   │   │                                     auto-deletes all its ExerciseSets
│   │   │
│   │   └── 📄 progress.repository.ts       WEIGHT LOG + GOAL DATABASE OPERATIONS
│   │                                       logWeight(): prisma.weightLog.upsert()
│   │                                         unique key: (userId, date)
│   │                                         If user logs weight twice in one day →
│   │                                         second entry OVERWRITES first. No duplicates.
│   │                                       getWeightHistory(): last 90 days, oldest first
│   │                                         Used by the SVG weight chart
│   │                                       getWeightLogCount(): quick count for checking
│   │                                         if adaptive TDEE can run (needs 14+)
│   │                                       getLatestWeight(): most recent entry
│   │                                         Used by the dashboard and settings
│   │                                       getActiveGoal(): finds goal with status=ACTIVE
│   │                                         includes GoalCheckpoints for weekly targets
│   │
│   ├── 📁 services/                        BUSINESS LOGIC LAYER
│   │   │                                   Profile service was already here (Step 2).
│   │   │                                   Three new services added in Step 3:
│   │   │
│   │   ├── 📄 nutrition.service.ts         FOOD LOGGING BUSINESS LOGIC
│   │   │                                   logFoodItem(): orchestrates the full flow
│   │   │                                     1. Fetch Food record from DB (get per-100g data)
│   │   │                                     2. Calculate: quantity / 100 → multiplier
│   │   │                                     3. Apply restaurant factor if isRestaurant=true
│   │   │                                        (food.restaurantMultiplier = 1.4–1.6×)
│   │   │                                     4. Round macros (only at this terminal point)
│   │   │                                     5. Call logFood() from repository → save
│   │   │                                   logCustomFood(): for manually typed entries
│   │   │                                     user provides all numbers directly
│   │   │                                     no lookup, no calculation — just save
│   │   │                                   getDailyTotals(): thin wrapper over repository
│   │   │                                     used by the dashboard API route
│   │   │
│   │   ├── 📄 workout.service.ts           WORKOUT SESSION BUSINESS LOGIC
│   │   │                                   startSession(): creates session in DB
│   │   │                                   logSet(): adds one ExerciseSet to a session
│   │   │                                   finishSession(): the critical one
│   │   │                                     Gets session from DB to see what exercises
│   │   │                                     were done (strength vs cardio?)
│   │   │                                     Strength portion → calculateStrengthBurnSimple()
│   │   │                                       engine: blendedMET × weight × duration × RPE
│   │   │                                     Cardio portion → calculateCardioBurn()
│   │   │                                       engine: MET × weight × duration
│   │   │                                     Saves as RANGE: (low, high) — honest about
│   │   │                                     uncertainty (±15%)
│   │   │                                   ⚠️ CRITICAL RULE:
│   │   │                                     These calories are stored for INFO ONLY
│   │   │                                     NEVER added to the daily calorie budget
│   │   │                                     The TDEE already includes gym activity via
│   │   │                                     the activity multiplier (1.55× for MODERATE)
│   │   │
│   │   └── 📄 progress.service.ts          WEIGHT TRACKING BUSINESS LOGIC
│   │                                       recordWeight(): thin wrapper → repository.logWeight
│   │                                       getProgressData(): parallel fetches with Promise.all
│   │                                         → getWeightHistory(90 days)
│   │                                         → getLatestWeight()
│   │                                         → getFirstWeight() (starting weight)
│   │                                         → getWeightLogCount()
│   │                                         → getActiveGoal()
│   │                                         Calculates: totalChange (current - start)
│   │                                         Sets: canUseAdaptiveTDEE (logCount >= 14)
│   │                                         Returns one aggregated object to the API
│   │
│   ├── 📁 validators/
│   │   └── 📄 onboarding.schema.ts         UPDATED in Step 3 — step4Schema changed
│   │                                       Added: targetWeightKg (optional number, 30-300)
│   │                                       Added: timelineMonths (optional, 1-24 months)
│   │                                       These feed calculateGoalFromTimeline() in engine
│   │                                       All other steps unchanged
│   │
│   └── 📁 hooks/                           TANSTACK QUERY HOOKS — client-side
│       │                                   use-profile.ts, use-food-search.ts,
│       │                                   use-exercises.ts were here from Step 2.
│       │                                   Four new hooks added in Step 3:
│       │
│       ├── 📄 use-daily-summary.ts         DAILY CALORIE TOTALS HOOK
│       │                                   queryKey: ["nutrition", "daily", date]
│       │                                   staleTime: 30 seconds (changes during meal logging)
│       │                                   Fetches GET /api/nutrition/daily?date=...
│       │                                   Returns: { totalCalories, totalProtein,
│       │                                             totalCarbs, totalFat }
│       │                                   Used by: Dashboard (CalorieRing, MacroBars)
│       │
│       ├── 📄 use-nutrition.ts             MEAL LIST + LOG/DELETE MUTATIONS
│       │                                   useMealsForDate(date):
│       │                                     queryKey: ["nutrition", "meals", date]
│       │                                     fetches full meal entries with food items
│       │                                   useLogFood(date):
│       │                                     mutation → POST /api/nutrition/log
│       │                                     onSuccess: invalidates both "meals" and
│       │                                     "daily" cache keys → ring updates instantly
│       │                                   useDeleteFood(date):
│       │                                     mutation → DELETE /api/nutrition/log
│       │                                     onSuccess: same cache invalidation chain
│       │
│       ├── 📄 use-workout.ts               WORKOUT SESSION + SET MUTATIONS
│       │                                   useWorkoutsForDate(date):
│       │                                     queryKey: ["workout", "sessions", date]
│       │                                     fetches sessions with all sets + exercises
│       │                                   useStartSession(date):
│       │                                     mutation → POST /api/workout
│       │                                     returns new sessionId used for set logging
│       │                                   useLogSet(date):
│       │                                     mutation → POST /api/workout/[id]/sets
│       │                                     invalidates session cache on success
│       │                                   useFinishSession(date):
│       │                                     mutation → PUT /api/workout/[id]/sets
│       │                                     triggers burn calculation in the service
│       │
│       └── 📄 use-progress.ts             WEIGHT HISTORY + LOG MUTATION
│                                           useProgressData():
│                                             queryKey: ["progress", "weight"]
│                                             staleTime: 60 seconds
│                                             fetches full progress stats from API
│                                           useLogWeight():
│                                             mutation → POST /api/progress/weight
│                                             invalidates "progress" cache on success
│
│
├── 📁 app/
│   │
│   └── 📁 api/                             API ROUTES — server-side, no UI
│       │                                   Every route checks auth first (supabase.getUser)
│       │
│       ├── 📁 nutrition/
│       │   ├── 📁 daily/
│       │   │   └── 📄 route.ts            GET /api/nutrition/daily?date=YYYY-MM-DD
│       │   │                               Auth → get userId → getDailyTotals(userId, date)
│       │   │                               Returns: { totalCalories, protein, carbs, fat }
│       │   │                               Used by: dashboard, nutrition page summary bar
│       │   │
│       │   └── 📁 log/
│       │       └── 📄 route.ts            POST /api/nutrition/log — log a food item
│       │                                   body has foodId → logFoodItem() (service calcs)
│       │                                   body has no foodId → logCustomFood() (user calcs)
│       │                                   DELETE /api/nutrition/log — remove a food item
│       │                                   body: { mealFoodId }
│       │                                   Ownership verified inside repository before delete
│       │
│       ├── 📁 workout/
│       │   ├── 📄 route.ts                POST /api/workout — start a new session
│       │   │                               body: { date, mode: "LIVE"|"RECALL", splitType }
│       │   │                               GET /api/workout?date=YYYY-MM-DD
│       │   │                               Returns sessions with full exercise set details
│       │   │
│       │   └── 📁 [id]/
│       │       └── 📁 sets/
│       │           └── 📄 route.ts        POST /api/workout/[id]/sets — add one set
│       │                                   body: { exerciseId, setNumber, weight, reps, rpe }
│       │                                   PUT /api/workout/[id]/sets — finish session
│       │                                   body: { durationMin, rpe, notes }
│       │                                   Fetches user's weight from profile for burn calc
│       │                                   Calls finishSession() → engine → completeSession()
│       │
│       ├── 📁 progress/
│       │   └── 📁 weight/
│       │       └── 📄 route.ts            POST /api/progress/weight — log today's weight
│       │                                   Validates: 30 ≤ weightKg ≤ 300
│       │                                   Upsert: logging twice same day overwrites
│       │                                   GET /api/progress/weight
│       │                                   Returns full progress stats (history, change, goal)
│       │
│       └── 📁 profile/
│           └── 📄 route.ts                GET /api/profile — unchanged from Step 2
│                                           PUT /api/profile — ADDED in Step 3
│                                             Called from Settings page
│                                             body: { weightKg, activityLevel, goal, dietaryType }
│                                             Calls recalculateProfile() → reruns engine
│                                             Saves new targets to database
│                                             Client then invalidates ["profile"] cache
│
│
├── 📁 app/(app)/                           AUTHENTICATED PAGES
│   │
│   ├── 📁 dashboard/
│   │   ├── 📄 page.tsx                    MAIN DASHBOARD PAGE
│   │   │                                   "use client" — reads from Zustand store
│   │   │                                   useProfile() → targets (from Step 2 engine)
│   │   │                                   useDailySummary(selectedDate) → consumed
│   │   │                                   Renders all 6 components below in sequence
│   │   │                                   Loading: skeleton placeholder cards
│   │   │
│   │   └── 📁 _components/
│   │       ├── 📄 date-strip.tsx          HORIZONTAL 7-DAY DATE SELECTOR
│   │       │                               useUIStore → reads/writes selectedDate (Step 1)
│   │       │                               7 buttons for last 7 days including today
│   │       │                               Active date = green background
│   │       │                               Today (if not selected) = small green dot
│   │       │                               Changing date re-fetches all data on the page
│   │       │
│   │       ├── 📄 calorie-ring.tsx        SVG CIRCULAR PROGRESS RING
│   │       │                               Props: consumed, target (numbers)
│   │       │                               SVG circle + stroke-dashoffset math
│   │       │                               Green (0-89%) → Amber (90-99%) → Red (100%+)
│   │       │                               Animated: transition on stroke-dashoffset
│   │       │                               Center text: consumed kcal eaten
│   │       │                               Right side: target + remaining (or over by)
│   │       │                               No charting library — pure SVG (~30 lines)
│   │       │
│   │       ├── 📄 macro-bars.tsx          CSS HORIZONTAL PROGRESS BARS
│   │       │                               Three bars: Protein (blue), Carbs (amber), Fat (red)
│   │       │                               Colors from design system CSS variables
│   │       │                               Width = (consumed / target × 100)%
│   │       │                               Capped at 100% width; excess shown in red text
│   │       │                               Glow effect: box-shadow with color at 40% opacity
│   │       │                               No charting library — pure CSS div widths
│   │       │
│   │       ├── 📄 goal-progress.tsx       WEIGHT GOAL PROGRESS BAR
│   │       │                               Shows: startWeight → current → targetWeight
│   │       │                               Large number: kg lost/gained so far
│   │       │                               CSS bar with green fill and glow
│   │       │                               "X.X kg to go" remaining display
│   │       │                               If no goal: shows "Log weight to track" message
│   │       │
│   │       ├── 📄 workout-info.tsx        WORKOUT CALORIE BURN CARD
│   │       │                               ⚠️ Shows "Info only" badge in top-right
│   │       │                               Burn shown as RANGE: "~320–380 kcal"
│   │       │                               (honest about ±15% uncertainty)
│   │       │                               Explicit disclaimer: "These calories are NOT
│   │       │                               added to your budget"
│   │       │                               Empty state: "No workout logged today" message
│   │       │
│   │       └── 📄 today-meals.tsx         MEAL SUMMARY GRID
│   │                                       2×2 grid: Breakfast / Lunch / Dinner / Snacks
│   │                                       Each cell shows kcal total for that meal slot
│   │                                       Empty slots show "—" instead of 0
│   │                                       Tapping any slot → navigates to /nutrition
│   │                                       "View all →" link in top-right corner
│   │
│   ├── 📁 nutrition/
│   │   ├── 📄 page.tsx                    NUTRITION LOGGER PAGE
│   │   │                                   "use client"
│   │   │                                   Shared DateStrip from dashboard components
│   │   │                                   Daily macro summary bar (total kcal/P/C/F)
│   │   │                                   4 MealSection components (one per meal type)
│   │   │                                   FoodSearchModal (controlled via useState)
│   │   │                                   Tapping "Add Food" opens modal with that mealType
│   │   │
│   │   └── 📁 _components/
│   │       ├── 📄 meal-section.tsx        ONE MEAL SLOT (Breakfast / Lunch / etc.)
│   │       │                               Props: mealType, emoji, label, foods[], date
│   │       │                               Header: emoji + label + total calories for slot
│   │       │                               Food list: each item shows name, quantity, kcal
│   │       │                               Per-item macros (P/C/F) on wider screens
│   │       │                               ✕ button per item → useDeleteFood mutation
│   │       │                               "Add Food" button at bottom → triggers onAddFood
│   │       │
│   │       └── 📄 food-search-modal.tsx   FOOD SEARCH BOTTOM SHEET
│   │                                       isOpen controls visibility (no render if false)
│   │                                       Two states: search results / quantity input
│   │                                       State 1 (search):
│   │                                         Input box → useFoodSearch hook (Step 2)
│   │                                         Results show: name, nameHindi, kcal per 100g
│   │                                         P/C/F quick stats below each result
│   │                                         Tap result → switch to state 2
│   │                                       State 2 (quantity):
│   │                                         Selected food shown in green card
│   │                                         Gram input (default: food.defaultGrams)
│   │                                         Restaurant toggle (applies restaurantMultiplier)
│   │                                         Live preview: "This will log: X kcal"
│   │                                         "Log Food" → useLogFood mutation → close
│   │
│   ├── 📁 workout/
│   │   ├── 📄 page.tsx                    WORKOUT LOGGER PAGE
│   │   │                                   "use client"
│   │   │                                   State: activeSessionId, activeExercise,
│   │   │                                          setsLogged, showFinish, duration
│   │   │                                   Flow 1 (no session): shows "Start Workout" button
│   │   │                                   Flow 2 (session active, no exercise):
│   │   │                                     "Add Exercise" + "Finish Workout" buttons
│   │   │                                   Flow 3 (exercise selected):
│   │   │                                     renders SetLogger for that exercise
│   │   │                                   Flow 4 (finish screen):
│   │   │                                     duration input + "Complete Workout" button
│   │   │                                   Below: completed sessions as SessionSummary cards
│   │   │
│   │   └── 📁 _components/
│   │       ├── 📄 exercise-browser.tsx    EXERCISE SEARCH MODAL
│   │       │                               isOpen controls visibility
│   │       │                               useExercises hook (Step 2) with filters
│   │       │                               Muscle group chips: All/Chest/Back/Legs/...
│   │       │                               Name search input
│   │       │                               Each result shows: name, muscleGroup,
│   │       │                               Compound badge, equipment badge
│   │       │                               Tap → calls onSelect() → closes modal
│   │       │
│   │       ├── 📄 set-logger.tsx          SET INPUT FORM
│   │       │                               Shows exercise name + "Set N" counter
│   │       │                               3 inputs: Weight (kg) / Reps / RPE (1-10)
│   │       │                               Warmup checkbox (warmup sets excluded from volume)
│   │       │                               "Log Set N" button → calls onLogSet()
│   │       │                               Weight persists between sets (usually same)
│   │       │                               Reps and RPE reset per set
│   │       │                               "Done with this exercise" → back to exercise list
│   │       │
│   │       └── 📄 session-summary.tsx     COMPLETED SESSION CARD
│   │                                       Groups sets by exercise name
│   │                                       Header: ✅ status + duration + burn range
│   │                                       Burn range labeled "Info only"
│   │                                       Per exercise: S1/S2/W1 rows with weight × reps
│   │                                       RPE shown if logged
│   │
│   ├── 📁 progress/
│   │   ├── 📄 page.tsx                    PROGRESS TRACKING PAGE
│   │   │                                   "use client"
│   │   │                                   WeightLogInput at top (always visible)
│   │   │                                   useProgressData() → loads history + stats
│   │   │                                   Loading: animated skeleton cards
│   │   │                                   StatsCards (2×2 grid)
│   │   │                                   WeightChart (SVG line chart)
│   │   │                                   Adaptive TDEE notice (shown if 14+ logs)
│   │   │
│   │   └── 📁 _components/
│   │       ├── 📄 weight-chart.tsx        SVG LINE CHART
│   │       │                               Pure SVG — no Recharts, no Chart.js
│   │       │                               chartW × chartH coordinate space
│   │       │                               Grid lines at 0%, 25%, 50%, 75%, 100%
│   │       │                               Y-axis labels: weight in kg
│   │       │                               Data points: small circles (larger if < 30 entries)
│   │       │                               Latest point: larger circle with surface border
│   │       │                               Line: stroke-linecap="round" green path
│   │       │                               Area: gradient fill (30% opacity → transparent)
│   │       │                               Target weight: amber dashed horizontal line
│   │       │                               Needs 2+ entries to render (else shows message)
│   │       │
│   │       ├── 📄 weight-log-input.tsx    QUICK WEIGHT ENTRY
│   │       │                               Single number input + "Log" button
│   │       │                               useLogWeight() mutation
│   │       │                               On success: "✅ Weight logged!" confirmation
│   │       │                               Upsert behavior: safe to log multiple times/day
│   │       │
│   │       └── 📄 stats-cards.tsx         2×2 STATS GRID
│   │                                       Card 1: Starting weight
│   │                                       Card 2: Current weight
│   │                                       Card 3: Total change (green=loss, amber=gain)
│   │                                       Card 4: Log count
│   │                                         Green if ≥ 14: "Adaptive TDEE ready ✨"
│   │                                         Muted if < 14: "X more for Adaptive TDEE"
│   │
│   └── 📁 settings/
│       └── 📄 page.tsx                    SETTINGS + RECALCULATION PAGE
│                                           "use client"
│                                           Top section: current targets (read-only)
│                                             targetCalories, TDEE, protein, carbs, fat
│                                           Edit section:
│                                             Weight input (number)
│                                             Activity level buttons (5 options)
│                                             Goal buttons (4 options)
│                                             Diet type buttons (4 options)
│                                           "Recalculate Targets" button
│                                             PUT /api/profile with changed fields
│                                             → recalculateProfile() reruns engine
│                                             → invalidates ["profile"] cache
│                                             → dashboard picks up new targets
│                                           Shows success/error message after submit
│                                           Account section: shows name + email (read-only)
│
│
└── 📁 app/(app)/onboarding/
    └── 📁 _components/
        └── 📄 step-4-goal.tsx             ONBOARDING GOAL STEP — REDESIGNED in Step 3
                                            BEFORE: 4 static buttons (Lose/Gain/Maintain/Recomp)
                                            AFTER: 5 body goal modes in plain language:
                                              🔥 Lean Cut → LOSE_FAT (400-600 deficit)
                                              💪 Lean Muscle → RECOMP (200-400 deficit)
                                              🎯 Six Pack → LOSE_FAT (500-700 deficit)
                                              🏋️ Muscle Bulk → GAIN_MUSCLE (200-300 surplus)
                                              ⚖️ Maintain → MAINTAIN (no change)
                                            After mode selection (except Maintain):
                                              Target weight input (kg)
                                              Timeline slider: 1-12 months
                                            Live preview: calls calculateGoalFromTimeline()
                                              with real BMR/TDEE from form data
                                              Shows: daily calories, weekly change rate,
                                                     estimated weeks to goal
                                              Safety warning if timeline too aggressive
                                            Continue disabled until mode + valid target chosen
```

---

### How Step 3 Files Connect to Each Other and to Steps 1 + 2

```
USER TAPS "Log Food" ON NUTRITION PAGE
         │
         ▼
app/(app)/nutrition/page.tsx
  └── useUIStore() → selectedDate (Step 1 — ui-store.ts)
  └── opens FoodSearchModal with mealType
         │
         ▼
food-search-modal.tsx
  └── user types "roti"
  └── useFoodSearch("roti") → Step 2 hook → GET /api/foods/search (Step 2 API)
      └── returns 150 seeded foods (Step 2 seed data)
  └── user selects Chapati, enters 80g, taps "Log Food"
  └── useLogFood(date) mutation → POST /api/nutrition/log
         │
         ▼
app/api/nutrition/log/route.ts
  └── createClient() from lib/supabase/server.ts (Step 1 file)
  └── supabase.auth.getUser() → get userId from session
  └── body.foodId present → logFoodItem(userId, body)
         │
         ▼
lib/services/nutrition.service.ts
  └── prisma.food.findUnique({ id: body.foodId }) → fetch food record
  └── multiplier = 80 / 100 = 0.8
  └── calories = 297 × 0.8 = 237.6 → Math.round → 238 kcal
      (rounding only at this terminal boundary — Step 2 rounding rule)
  └── logFood(userId, { calories: 238, ... })
         │
         ▼
lib/repositories/nutrition.repository.ts
  └── prisma.$transaction():
        findFirst → Lunch MealEntry for this date?
        if not → create MealEntry (userId, date, "LUNCH")
        create MealFood (mealEntryId, name, quantity, calories, ...)
  └── returns { mealEntry, mealFood }
         │
         ▼
POST /api/nutrition/log returns 201 Created
         │
         ▼
useLogFood.onSuccess()
  └── queryClient.invalidateQueries(["nutrition", "meals", date])
  └── queryClient.invalidateQueries(["nutrition", "daily", date])
         │
         ▼
useDailySummary(date) refetches automatically
  └── Dashboard CalorieRing and MacroBars update ✅
  └── Nutrition page summary bar updates ✅
```

```
USER FINISHES A WORKOUT SESSION
         │
         ▼
app/(app)/workout/page.tsx
  └── user taps "Complete Workout" with duration=45 min
  └── useFinishSession(date).mutate({ sessionId, durationMin: 45, rpe: 7 })
         │
         ▼
app/api/workout/[id]/sets/route.ts  [PUT method]
  └── createClient() → getUser() → userId verified
  └── getProfileByUserId(userId) from profile.repository.ts (Step 2 file)
      └── needs weightKg for calorie burn calculation
  └── finishSession(sessionId, userId, { durationMin: 45, rpe: 7, userWeightKg: 82 })
         │
         ▼
lib/services/workout.service.ts
  └── getSessionsByDate(userId, today) → find this session
  └── session has strength sets? → yes
  └── calculateStrengthBurnSimple(45, 82, 7) from lib/engine/strength.ts (Step 2 file)
      └── blendedMET=3.5 × 82kg × 0.75hr × 0.9(RPE7) = 193 kcal
      └── returns { low: 164, high: 222, estimate: 193 }
  └── completeSession(sessionId, { caloriesBurnedLow: 164, caloriesBurnedHigh: 222 })
         │
         ▼
lib/repositories/workout.repository.ts
  └── prisma.workoutSession.update({ status: "COMPLETED", caloriesBurnedLow: 164, ... })
         │
         ▼
useFinishSession.onSuccess()
  └── invalidates ["workout", "sessions", date]
  └── WorkoutInfo card on dashboard shows: "~164–222 kcal  [Info only]" ✅
  (These calories are NEVER added to the daily budget ✅)
```

```
USER UPDATES WEIGHT IN SETTINGS
         │
         ▼
app/(app)/settings/page.tsx
  └── useProfile() → reads current profile (Step 2 hook)
  └── user changes weight to 80kg, taps "Recalculate Targets"
  └── PUT /api/profile with { weightKg: 80 }
         │
         ▼
app/api/profile/route.ts  [PUT handler — added in Step 3]
  └── createClient() → getUser()
  └── recalculateProfile(userId, { weightKg: 80 })
         │
         ▼
lib/services/profile.service.ts (Step 2 file, updated in Step 3)
  └── getProfileByUserId(userId) → get current values to merge with update
  └── calculateFullProfile({ weightKg: 80, sex, heightCm, age, activityLevel,
                             goal, dietaryType }) from lib/engine/tdee.ts
      └── BMR recalculated with 80kg (not 82kg)
      └── tiered protein: 80 × 1.6 = 128g (for LOSE_FAT goal)
      └── dietaryType passed → adjusts multiplier for VEG/VEGAN users
  └── updateProfile(userId, { weightKg: 80, targetCalories: ..., targetProtein: 128 })
         │
         ▼
PUT /api/profile returns updated profile
         │
         ▼
settings/page.tsx
  └── queryClient.invalidateQueries(["profile"])
  └── useDailySummary on dashboard refetches against new 128g protein target ✅
```

---
---

## Part 2: Interview Questions — "What If This Goes Wrong?"

---

### Category 1: Dashboard and Calorie Ring

---

**Q: The dashboard shows consumed calories. But where exactly do those numbers come from? Walk through every layer.**

The consumed calorie number starts at the bottom — the `meal_foods` table in PostgreSQL. When a user logs a food, a row is written to this table with the calculated calories for that specific quantity.

When the dashboard loads, `useDailySummary(selectedDate)` fires. It calls `GET /api/nutrition/daily?date=...`. The API route authenticates the user, then calls `getDailyTotals()` in the nutrition service, which calls `getDailySummary()` in the nutrition repository. That repository function runs `prisma.mealFood.aggregate()` — a single SQL query that sums calories, protein, carbs, and fat for all foods logged by this user on this date. The aggregated result travels back up through the service, through the API response, into the TanStack Query cache, and finally into the `CalorieRing` component as the `consumed` prop.

The target calories (`targetCalories`) on the other side of the ring come from a separate path: `useProfile()` → `GET /api/profile` → the stored `targetCalories` field in the user's profile, which was calculated by the engine during onboarding and stored at that time.

---

**Q: What if the calorie ring shows the wrong number for a past date? The user changes the date to yesterday and sees today's calories.**

This is the date scoping mechanism. Every data hook in Step 3 takes `selectedDate` as a parameter and includes it in the TanStack query key. The key for the daily summary is `["nutrition", "daily", date]`. Each date has its own independent cache entry.

When the user taps yesterday in the DateStrip, `selectedDate` in the Zustand store changes. Every component on the dashboard that reads `selectedDate` immediately re-renders. `useDailySummary(yesterday)` fires with the new date. Since yesterday's data has a different cache key, TanStack Query makes a fresh API call for that date. The calorie ring and macro bars update to show yesterday's logged data.

If the numbers are still wrong, the most likely cause is a timezone mismatch: the browser's `new Date()` is in local time, but the database query uses `new Date(date)` which converts to UTC midnight. Indian Standard Time (IST) is UTC+5:30. A date logged at 11pm IST is stored as the next calendar day in UTC. The fix is to ensure the date string passed to the API is always the local date string (YYYY-MM-DD), not a UTC timestamp.

---

**Q: What if the dashboard shows targets but consumed is always zero, even after logging food?**

The most likely causes, in order of frequency:

First, check cache invalidation. After `useLogFood` succeeds, it calls `queryClient.invalidateQueries({ queryKey: ["nutrition", "daily", date] })`. If the `date` variable passed to `useLogFood(date)` is different from the `date` used in `useDailySummary(date)`, the invalidation misses — it invalidates a different cache key than the one the ring is reading from. Both must use exactly the same date string format.

Second, check the date passed to the API. If `logFood()` writes to a different date (for example, UTC date instead of local date), the aggregate query for the local date finds zero rows.

Third, check if the food was actually saved. Open the browser Network tab, look at the POST /api/nutrition/log response — if it is 201, the data is in the database. If the ring still shows zero, the issue is in the query layer, not the save layer.

---

### Category 2: Food Logging and Nutrition

---

**Q: A user logs 80g of chapati. How are the calories calculated? Show the math.**

The food record in the `foods` table stores nutrition per 100g. For chapati: `caloriesPer100g = 297`, `proteinPer100g = 9.0`.

In `nutrition.service.logFoodItem()`, the calculation is:
```
multiplier = 80 / 100 = 0.8
calories = 297 × 0.8 = 237.6 → Math.round → 238 kcal
protein = 9.0 × 0.8 × 10 = 72, / 10 = 7.2g
```

Note that protein is multiplied by 10 before rounding and divided by 10 after. This preserves one decimal place of precision. We round only at this terminal boundary — not in intermediate steps — because of the Step 2 rounding rule. If we rounded each macro separately, the accumulated rounding error across 10+ food items per day would cause the calorie count to drift by ±10-20 kcal.

The `restaurantMultiplier` only applies if `isRestaurant = true`. For chapati, it would be `297 × 0.8 × 1.5 = 356 kcal`, because restaurant chapati uses more ghee.

---

**Q: What if a user deletes a food item — does the empty meal section remain in the database?**

No. The `deleteMealFood()` function in the nutrition repository handles this specifically. After deleting the `MealFood` row, it checks: `prisma.mealFood.count({ where: { mealEntryId: ... } })`. If that count is zero, it also deletes the parent `MealEntry`. This is all inside one `prisma.$transaction()` so both deletes either succeed together or fail together.

The UI effect: the meal section shows "—" instead of a calorie count for empty slots, because the section is rendered even if there are no foods logged (it comes from the static `MEALS` array in the nutrition page, not from the database).

---

**Q: What if two users search for "paneer" at the same time? Do they interfere with each other?**

No. Each user has their own authenticated session and their own TanStack Query cache in their browser. The `useFoodSearch` hook runs in each browser independently. The food search API reads from the `foods` reference table, which is the same for all users — but it is read-only data, so concurrent reads never conflict.

TanStack Query caches results by `queryKey`. User A's cache key `["foods", "search", "paneer"]` and User B's cache key `["foods", "search", "paneer"]` are in separate browser processes. They do not share state.

---

### Category 3: Workout Logger and Calorie Burn

---

**Q: How does the app calculate how many calories a user burned during their workout? Walk through the engine call.**

When the user taps "Complete Workout" with duration 45 minutes and RPE 7, the `finishSession()` function in the workout service runs.

It first fetches the session from the database to see what exercises were done. Then it checks: were any exercises in the CARDIO category? Were any in COMPOUND or ISOLATION (strength)?

For a pure strength session (no cardio), it calls `calculateStrengthBurnSimple()` from `lib/engine/strength.ts` with three positional arguments: `(durationMin=45, weightKg=82, rpe=7)`.

Inside that function: `blendedMET = 3.5` (a blend of active lifting and rest periods). `durationHours = 45/60 = 0.75`. `rpeMultiplier = 0.9` (RPE 7 table lookup). `totalBurn = 3.5 × 82 × 0.75 × 0.9 = 193.7 kcal`. The function returns `{ low: 165, high: 223, estimate: 194 }` (±15%).

This range is saved to the database in `caloriesBurnedLow` and `caloriesBurnedHigh`. The dashboard shows "~165–223 kcal" with an "Info only" badge. These numbers are never added to the daily calorie budget.

---

**Q: Why does the workout calorie burn show as a range ("~165–223 kcal") instead of a single number?**

Because the single number would be a lie of precision. The MET-based calorie formula has a known ±15% margin of error. A person's actual metabolic efficiency, muscle mass, and recovery state all vary.

Showing "~165–223 kcal" is more honest than showing "194 kcal" which implies laboratory-level accuracy. The ±15% range is calculated as: `low = estimate × 0.85`, `high = estimate × 1.15`.

The UI reflects this uncertainty by labeling it "Info only" — not a target, not a budget item, just a reference. The user's actual calorie budget is their `targetCalories` from the engine, which already accounts for their gym activity.

---

**Q: What if a workout session is saved but the engine incorrectly calculates zero calories burned?**

The zero case is triggered when `durationMin` is 0 or the user weight is 0. Both are validated: `durationMin` has a default of 45 in the settings if the user leaves it blank, and `userWeightKg` falls back to 70 if the profile weight is null.

The more likely bug scenario is that `hasStrength` and `hasCardio` are both false (the session has no sets). This can happen if a user creates a session, never adds exercises, and immediately taps "Finish." In that case `totalBurnLow = 0` and `totalBurnHigh = 0` — which is actually correct. A session with no exercises has zero burn.

If the burn is unexpectedly zero for a session that does have sets, check that the exercise records in the database have `category` set correctly (COMPOUND, ISOLATION, or CARDIO). If `category` is null, `hasStrength` and `hasCardio` are both false.

---

### Category 4: Progress Page and Weight Tracking

---

**Q: A user logs their weight as 82kg in the morning and then 81.5kg in the evening. Which one is saved?**

The second one. The `logWeight()` function in the repository uses `prisma.weightLog.upsert()` with `where: { userId_date: { userId, date } }`. The `@@unique([userId, date])` constraint in the Prisma schema means there can be only one weight log per user per calendar date. If a second entry arrives for the same date, the `update` branch of the upsert runs, overwriting the first value.

This is the correct behavior. Weight measured at different times of day varies naturally by 0.5–1.5kg. We take the most recent measurement. The UI says nothing about this — the user just taps "Log" and the correct value is silently updated.

---

**Q: The weight chart requires 2 entries to render. What does the user see on their first day using the app?**

The chart component checks `if (history.length < 2)` and renders a placeholder instead: a bordered card with the message "Log at least 2 weight entries to see your chart 📈." The rest of the progress page still renders normally — the weight log input, the stats cards (which show "—" for most fields since there is only one entry), and the adaptive TDEE notice section.

This is intentional progressive disclosure. A chart with one data point is not a chart — it is a dot. The placeholder communicates the expectation clearly and prompts the behavior that makes the chart meaningful.

---

**Q: What is adaptive TDEE and when does it become available?**

The Step 2 engine file `lib/engine/adaptive-tdee.ts` implements `calculateAdaptiveTDEE()`. The formula works by comparing actual weight change to expected weight change from calorie intake. Since 1kg of fat stores approximately 7,700 kcal, if a user ate 14 × 1,800 = 25,200 kcal over 14 days and lost 0.3kg, their actual TDEE can be inferred.

Mifflin-St Jeor estimates TDEE from body measurements. It has a known error range of ±15% for individuals. After 14 real data points, the adaptive formula calculates the user's actual TDEE from what really happened to their body — which is always more accurate than any formula.

The progress page checks `logCount >= 14` and shows a green notice when this threshold is met. The stats card also shows a "Adaptive TDEE ready ✨" subtitle on the log count card. The actual recalculation is triggered in Step 4 when the AI coach integration is built.

---

### Category 5: Settings Page and Target Recalculation

---

**Q: A user changes their activity level from MODERATE to SEDENTARY in Settings. What exactly changes in the database?**

The `PUT /api/profile` route calls `recalculateProfile(userId, { activityLevel: "SEDENTARY" })` in the profile service. That service fetches the current profile to get all other fields (weight, height, age, sex, goal, dietaryType), then merges the new `activityLevel` in.

It calls `calculateFullProfile()` from the Step 2 engine with the updated inputs. The TDEE drops: SEDENTARY multiplier is 1.2 instead of MODERATE's 1.55. If the user had TDEE=2,695 before, it becomes roughly 2,100. Their `targetCalories` decreases proportionally. Their protein, carbs, and fat targets are all recalculated from scratch using the new TDEE.

The `updateProfile()` repository call saves five fields: `activityLevel`, `tdee`, `targetCalories`, `targetProtein`, `targetCarbs`, `targetFat`. The settings page then invalidates the `["profile"]` cache. The next time the dashboard loads (or when TanStack refetches), it reads the new lower targets.

---

**Q: What if a user sets their goal to LOSE_FAT and their protein target drops to an unsafe level?**

It cannot drop because the tiered protein system sets the floor, not the TDEE. The protein calculation in `tdee.ts` uses `1.6g/kg` for LOSE_FAT. For an 80kg user, protein is always `80 × 1.6 = 128g`. This number does not depend on TDEE at all.

The calorie floor is a separate protection. If the resulting `targetCalories` from the deficit calculation would fall below 1,500 (men) or 1,200 (women), `checkCalorieFloor()` in `safety.ts` overrides it and returns the floor value. This means carbs are reduced to accommodate the floor, but protein and fat are calculated before calorie capping and remain intact.

---

### Category 6: Cache Invalidation and Data Consistency

---

**Q: A user logs food on the Nutrition page. The Dashboard is open in another browser tab. Does the dashboard update automatically?**

No. TanStack Query's cache invalidation only happens within a single browser tab's JavaScript context. If the user logs food in Tab A, Tab A's cache for `["nutrition", "daily", date]` is invalidated and the dashboard in Tab A refetches instantly. Tab B has its own independent TanStack Query client and cache. Tab B does not know that Tab A made a mutation.

When the user switches to Tab B, TanStack Query's `staleTime` of 30 seconds applies. If 30 seconds have passed since the last fetch, Tab B refetches automatically when the tab becomes active (focus refetching). The user sees updated numbers within seconds of switching tabs. If the 30 seconds have not passed, they see the stale data until the staleTime expires.

For real-time synchronization across tabs, you would need WebSockets or Server-Sent Events — that is a Step 4+ feature.

---

**Q: What is the exact chain of cache invalidations when a user logs a food item? Name every query key that gets invalidated.**

One mutation, two invalidations:

1. `["nutrition", "meals", date]` — the full meal list on the Nutrition page. This makes the new food item appear in the meal section immediately after logging.

2. `["nutrition", "daily", date]` — the daily summary totals on the Dashboard. This makes the CalorieRing ring fill up and the MacroBars extend immediately after logging.

No other caches are invalidated. The profile cache `["profile"]` is not touched — macros targets did not change. The workout cache `["workout", "sessions", date]` is not touched — no workout was involved.

This surgical precision is intentional. Invalidating too many keys causes unnecessary network requests. Invalidating too few leaves stale data visible. The key design rule: invalidate exactly the queries that consumed data that you just wrote.

---

**Q: What if a developer adds a new component that reads from `useDailySummary()` but forgets to invalidate after a new mutation? What bug appears?**

The new component would show stale data after mutations. For example, if a new "Quick Log" feature on the home screen logs food but does not call `queryClient.invalidateQueries({ queryKey: ["nutrition", "daily", date] })`, the CalorieRing and MacroBars on the dashboard would not update until the 30-second staleTime expires.

The user experience: tap "Quick Log", see 0 calories reflected on dashboard, get confused, check the log again to confirm it saved, eventually see it update 30 seconds later.

The fix: every mutation that writes food data must invalidate both `["nutrition", "meals", date]` and `["nutrition", "daily", date]`. This should be documented as a code rule and enforced in code review. In Step 4, when there are more mutation hooks, this could be extracted into a shared `invalidateNutritionCache(date)` utility function that all food-related mutations call.
