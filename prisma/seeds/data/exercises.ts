/**
 * Exercise Database — 160+ Exercises
 * ═══════════════════════════════════
 *
 * Each exercise has:
 * - name: display name
 * - category: COMPOUND | ISOLATION | CARDIO (matches Prisma enum)
 * - muscleGroup: primary muscle targeted
 * - equipment: what gear is needed (null = bodyweight)
 * - metValue: MET value for calorie calculation
 * - isCompound: targets multiple muscle groups?
 * - instructions: brief form cue
 *
 * MET VALUES SOURCE:
 * ──────────────────
 * Compendium of Physical Activities (2011 update)
 * https://sites.google.com/site/compendiumofphysicalactivities/
 */

export interface ExerciseSeedData {
  name: string;
  category: "COMPOUND" | "ISOLATION" | "CARDIO";
  muscleGroup: string;
  equipment: string | null;
  metValue: number;
  isCompound: boolean;
  instructions: string;
}

export const exercises: ExerciseSeedData[] = [
  // ═══════════════════════════════════════════
  // CHEST (20 exercises)
  // ═══════════════════════════════════════════
  { name: "Barbell Bench Press", category: "COMPOUND", muscleGroup: "Chest", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Lie flat, grip slightly wider than shoulders, lower bar to mid-chest, press up." },
  { name: "Incline Barbell Bench Press", category: "COMPOUND", muscleGroup: "Chest", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Set bench to 30-45°. Press barbell from upper chest to lockout." },
  { name: "Decline Barbell Bench Press", category: "COMPOUND", muscleGroup: "Chest", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Set bench to -15°. Press barbell from lower chest to lockout." },
  { name: "Dumbbell Bench Press", category: "COMPOUND", muscleGroup: "Chest", equipment: "Dumbbell", metValue: 5.5, isCompound: true, instructions: "Lie flat, press dumbbells from chest height to full extension." },
  { name: "Incline Dumbbell Press", category: "COMPOUND", muscleGroup: "Chest", equipment: "Dumbbell", metValue: 5.5, isCompound: true, instructions: "Set bench to 30-45°. Press dumbbells from shoulder height." },
  { name: "Dumbbell Fly", category: "ISOLATION", muscleGroup: "Chest", equipment: "Dumbbell", metValue: 4.5, isCompound: false, instructions: "Lie flat, arms wide with slight bend, bring dumbbells together in arc." },
  { name: "Incline Dumbbell Fly", category: "ISOLATION", muscleGroup: "Chest", equipment: "Dumbbell", metValue: 4.5, isCompound: false, instructions: "Set bench to 30°. Perform fly motion targeting upper chest." },
  { name: "Cable Fly", category: "ISOLATION", muscleGroup: "Chest", equipment: "Cable", metValue: 4.0, isCompound: false, instructions: "Stand between cables, bring handles together in front of chest." },
  { name: "Cable Crossover (High-to-Low)", category: "ISOLATION", muscleGroup: "Chest", equipment: "Cable", metValue: 4.0, isCompound: false, instructions: "Set pulleys high, bring handles down and together at waist level." },
  { name: "Cable Crossover (Low-to-High)", category: "ISOLATION", muscleGroup: "Chest", equipment: "Cable", metValue: 4.0, isCompound: false, instructions: "Set pulleys low, bring handles up and together at shoulder level." },
  { name: "Chest Press Machine", category: "COMPOUND", muscleGroup: "Chest", equipment: "Machine", metValue: 5.0, isCompound: true, instructions: "Sit with back flat, push handles forward to full extension." },
  { name: "Pec Deck / Machine Fly", category: "ISOLATION", muscleGroup: "Chest", equipment: "Machine", metValue: 4.0, isCompound: false, instructions: "Sit with arms at 90°, bring pads together in front." },
  { name: "Push-Up", category: "COMPOUND", muscleGroup: "Chest", equipment: null, metValue: 3.8, isCompound: true, instructions: "Hands shoulder-width, lower chest to floor, push back up." },
  { name: "Diamond Push-Up", category: "COMPOUND", muscleGroup: "Chest", equipment: null, metValue: 4.0, isCompound: true, instructions: "Hands together forming diamond shape. Emphasizes triceps and inner chest." },
  { name: "Decline Push-Up", category: "COMPOUND", muscleGroup: "Chest", equipment: null, metValue: 4.0, isCompound: true, instructions: "Feet elevated on bench. Targets upper chest more." },
  { name: "Dips (Chest)", category: "COMPOUND", muscleGroup: "Chest", equipment: "Bodyweight", metValue: 5.5, isCompound: true, instructions: "Lean forward slightly, lower until upper arms parallel to floor." },
  { name: "Landmine Press", category: "COMPOUND", muscleGroup: "Chest", equipment: "Barbell", metValue: 5.0, isCompound: true, instructions: "Press barbell end upward at an angle from chest height." },
  { name: "Svend Press", category: "ISOLATION", muscleGroup: "Chest", equipment: "Plate", metValue: 3.5, isCompound: false, instructions: "Squeeze two plates together, press forward from chest." },
  { name: "Plate Squeeze Press", category: "ISOLATION", muscleGroup: "Chest", equipment: "Plate", metValue: 3.5, isCompound: false, instructions: "Hold plate between palms, press forward while squeezing." },
  { name: "Close Grip Bench Press", category: "COMPOUND", muscleGroup: "Chest", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Grip narrower than shoulder width. Targets inner chest and triceps." },

  // ═══════════════════════════════════════════
  // BACK (20 exercises)
  // ═══════════════════════════════════════════
  { name: "Conventional Deadlift", category: "COMPOUND", muscleGroup: "Back", equipment: "Barbell", metValue: 6.5, isCompound: true, instructions: "Feet hip-width, hinge at hips, grip bar outside knees, drive up with legs and back." },
  { name: "Sumo Deadlift", category: "COMPOUND", muscleGroup: "Back", equipment: "Barbell", metValue: 6.5, isCompound: true, instructions: "Wide stance, toes out, grip inside knees, drive up." },
  { name: "Barbell Row (Bent Over)", category: "COMPOUND", muscleGroup: "Back", equipment: "Barbell", metValue: 5.5, isCompound: true, instructions: "Hinge forward 45°, pull barbell to lower chest, squeeze shoulder blades." },
  { name: "Pendlay Row", category: "COMPOUND", muscleGroup: "Back", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Torso parallel to floor, pull bar explosively from floor to lower chest." },
  { name: "Dumbbell Row (Single Arm)", category: "COMPOUND", muscleGroup: "Back", equipment: "Dumbbell", metValue: 5.0, isCompound: true, instructions: "One hand on bench, row dumbbell to hip, squeeze at top." },
  { name: "T-Bar Row", category: "COMPOUND", muscleGroup: "Back", equipment: "Barbell", metValue: 5.5, isCompound: true, instructions: "Straddle bar, row to chest using V-grip handle." },
  { name: "Pull-Up", category: "COMPOUND", muscleGroup: "Back", equipment: null, metValue: 8.0, isCompound: true, instructions: "Overhand grip, pull chin above bar, controlled descent." },
  { name: "Chin-Up", category: "COMPOUND", muscleGroup: "Back", equipment: null, metValue: 8.0, isCompound: true, instructions: "Underhand grip, pull chin above bar. More bicep involvement." },
  { name: "Lat Pulldown", category: "COMPOUND", muscleGroup: "Back", equipment: "Cable", metValue: 5.0, isCompound: true, instructions: "Wide grip, pull bar to upper chest, squeeze lats." },
  { name: "Close Grip Lat Pulldown", category: "COMPOUND", muscleGroup: "Back", equipment: "Cable", metValue: 5.0, isCompound: true, instructions: "V-grip or narrow handle, pull to chest. Emphasizes lower lats." },
  { name: "Seated Cable Row", category: "COMPOUND", muscleGroup: "Back", equipment: "Cable", metValue: 4.5, isCompound: true, instructions: "Sit upright, pull handle to lower chest, squeeze shoulder blades." },
  { name: "Face Pull", category: "ISOLATION", muscleGroup: "Back", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "High cable, rope handle, pull to face level with elbows high." },
  { name: "Straight Arm Pulldown", category: "ISOLATION", muscleGroup: "Back", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "Arms straight, push bar down in arc from shoulder to thigh." },
  { name: "Rack Pull", category: "COMPOUND", muscleGroup: "Back", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Barbell at knee height on rack, deadlift from there." },
  { name: "Hyperextension", category: "ISOLATION", muscleGroup: "Back", equipment: "Machine", metValue: 3.5, isCompound: false, instructions: "Hinge at hips on the GHD bench, extend back to neutral." },
  { name: "Dumbbell Pullover", category: "COMPOUND", muscleGroup: "Back", equipment: "Dumbbell", metValue: 4.0, isCompound: true, instructions: "Lie across bench, lower dumbbell behind head, pull back over chest." },
  { name: "Machine Row (Hammer Strength)", category: "COMPOUND", muscleGroup: "Back", equipment: "Machine", metValue: 4.5, isCompound: true, instructions: "Chest against pad, pull handles to sides." },
  { name: "Meadows Row", category: "COMPOUND", muscleGroup: "Back", equipment: "Barbell", metValue: 5.0, isCompound: true, instructions: "Landmine row with overhand grip, pull to hip." },
  { name: "Inverted Row", category: "COMPOUND", muscleGroup: "Back", equipment: null, metValue: 5.0, isCompound: true, instructions: "Hang under bar, pull chest to bar. Bodyweight row." },
  { name: "Shrugs (Barbell)", category: "ISOLATION", muscleGroup: "Back", equipment: "Barbell", metValue: 4.0, isCompound: false, instructions: "Hold barbell at hips, elevate shoulders straight up, hold, lower." },

  // ═══════════════════════════════════════════
  // LEGS (25 exercises)
  // ═══════════════════════════════════════════
  { name: "Barbell Back Squat", category: "COMPOUND", muscleGroup: "Legs", equipment: "Barbell", metValue: 6.5, isCompound: true, instructions: "Bar on upper traps, feet shoulder-width, squat to parallel or below." },
  { name: "Front Squat", category: "COMPOUND", muscleGroup: "Legs", equipment: "Barbell", metValue: 6.5, isCompound: true, instructions: "Bar on front delts, elbows high, squat to parallel." },
  { name: "Goblet Squat", category: "COMPOUND", muscleGroup: "Legs", equipment: "Dumbbell", metValue: 5.5, isCompound: true, instructions: "Hold dumbbell at chest, squat between legs." },
  { name: "Leg Press", category: "COMPOUND", muscleGroup: "Legs", equipment: "Machine", metValue: 5.5, isCompound: true, instructions: "Feet shoulder-width on platform, press until legs almost straight." },
  { name: "Hack Squat", category: "COMPOUND", muscleGroup: "Legs", equipment: "Machine", metValue: 5.5, isCompound: true, instructions: "Back against pad, feet forward, squat down and press up." },
  { name: "Bulgarian Split Squat", category: "COMPOUND", muscleGroup: "Legs", equipment: "Dumbbell", metValue: 5.5, isCompound: true, instructions: "Rear foot on bench, lunge down until front thigh is parallel." },
  { name: "Walking Lunges", category: "COMPOUND", muscleGroup: "Legs", equipment: "Dumbbell", metValue: 5.0, isCompound: true, instructions: "Step forward into lunge, alternate legs, keep torso upright." },
  { name: "Romanian Deadlift", category: "COMPOUND", muscleGroup: "Legs", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Slight knee bend, hinge at hips, lower bar along legs, feel hamstring stretch." },
  { name: "Stiff-Leg Deadlift", category: "COMPOUND", muscleGroup: "Legs", equipment: "Barbell", metValue: 6.0, isCompound: true, instructions: "Like RDL but legs straighter. Greater hamstring emphasis." },
  { name: "Leg Extension", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 4.0, isCompound: false, instructions: "Sit in machine, extend legs to full lockout, squeeze quads." },
  { name: "Leg Curl (Lying)", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 4.0, isCompound: false, instructions: "Lie face down, curl heels toward glutes." },
  { name: "Leg Curl (Seated)", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 4.0, isCompound: false, instructions: "Sit in machine, curl legs under the seat." },
  { name: "Calf Raise (Standing)", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 3.5, isCompound: false, instructions: "Rise onto toes, pause at top, lower slowly." },
  { name: "Calf Raise (Seated)", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 3.5, isCompound: false, instructions: "Knees under pad, rise onto toes. Targets soleus." },
  { name: "Hip Thrust (Barbell)", category: "COMPOUND", muscleGroup: "Legs", equipment: "Barbell", metValue: 5.5, isCompound: true, instructions: "Upper back on bench, bar on hips, drive hips up, squeeze glutes." },
  { name: "Glute Bridge", category: "COMPOUND", muscleGroup: "Legs", equipment: null, metValue: 3.5, isCompound: true, instructions: "Lie on floor, feet flat, drive hips up, squeeze glutes at top." },
  { name: "Step-Up", category: "COMPOUND", muscleGroup: "Legs", equipment: "Dumbbell", metValue: 5.0, isCompound: true, instructions: "Step onto box/bench, drive through front heel, stand fully." },
  { name: "Sissy Squat", category: "ISOLATION", muscleGroup: "Legs", equipment: null, metValue: 4.0, isCompound: false, instructions: "Lean back as you bend knees, lower until deep stretch in quads." },
  { name: "Good Morning", category: "COMPOUND", muscleGroup: "Legs", equipment: "Barbell", metValue: 5.0, isCompound: true, instructions: "Bar on back, slight knee bend, hinge forward, return upright." },
  { name: "Sumo Squat", category: "COMPOUND", muscleGroup: "Legs", equipment: "Dumbbell", metValue: 5.0, isCompound: true, instructions: "Wide stance, toes out, hold dumbbell between legs, squat deep." },
  { name: "Wall Sit", category: "ISOLATION", muscleGroup: "Legs", equipment: null, metValue: 2.5, isCompound: false, instructions: "Back against wall, thighs parallel to floor. Hold position." },
  { name: "Leg Press Calf Raise", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 3.5, isCompound: false, instructions: "Toes on bottom of leg press platform, push with calves only." },
  { name: "Adductor Machine", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 3.0, isCompound: false, instructions: "Sit in machine, squeeze legs together." },
  { name: "Abductor Machine", category: "ISOLATION", muscleGroup: "Legs", equipment: "Machine", metValue: 3.0, isCompound: false, instructions: "Sit in machine, push legs apart." },
  { name: "Box Jump", category: "COMPOUND", muscleGroup: "Legs", equipment: null, metValue: 8.0, isCompound: true, instructions: "Jump explosively onto box, land softly, step down." },

  // ═══════════════════════════════════════════
  // SHOULDERS (15 exercises)
  // ═══════════════════════════════════════════
  { name: "Overhead Press (Barbell)", category: "COMPOUND", muscleGroup: "Shoulders", equipment: "Barbell", metValue: 5.5, isCompound: true, instructions: "Standing, press bar from shoulders to overhead lockout." },
  { name: "Dumbbell Shoulder Press", category: "COMPOUND", muscleGroup: "Shoulders", equipment: "Dumbbell", metValue: 5.0, isCompound: true, instructions: "Seated or standing, press dumbbells from shoulders to overhead." },
  { name: "Arnold Press", category: "COMPOUND", muscleGroup: "Shoulders", equipment: "Dumbbell", metValue: 5.0, isCompound: true, instructions: "Start palms facing you, rotate and press overhead." },
  { name: "Lateral Raise", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Slight bend in elbows, raise dumbbells to sides at shoulder height." },
  { name: "Front Raise", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Raise dumbbells in front to shoulder height, one or both at a time." },
  { name: "Reverse Fly (Bent Over)", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Hinge forward, raise dumbbells to sides. Targets rear delts." },
  { name: "Cable Lateral Raise", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "Low pulley, raise arm out to side at shoulder height." },
  { name: "Machine Shoulder Press", category: "COMPOUND", muscleGroup: "Shoulders", equipment: "Machine", metValue: 4.5, isCompound: true, instructions: "Sit in machine, press handles overhead." },
  { name: "Upright Row", category: "COMPOUND", muscleGroup: "Shoulders", equipment: "Barbell", metValue: 5.0, isCompound: true, instructions: "Narrow grip, pull bar up to chin level, elbows leading." },
  { name: "Pike Push-Up", category: "COMPOUND", muscleGroup: "Shoulders", equipment: null, metValue: 4.5, isCompound: true, instructions: "Hips high in inverted V, lower head toward floor, push up." },
  { name: "Handstand Push-Up", category: "COMPOUND", muscleGroup: "Shoulders", equipment: null, metValue: 6.0, isCompound: true, instructions: "Against wall, lower head to floor, press back up." },
  { name: "Lu Raise", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Seated, raise dumbbells to sides with thumbs up, slight forward angle." },
  { name: "Reverse Pec Deck", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Machine", metValue: 3.0, isCompound: false, instructions: "Face the pec deck machine, push arms back. Targets rear delts." },
  { name: "Cable Face Pull", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "High cable with rope, pull to face with external rotation." },
  { name: "Plate Front Raise", category: "ISOLATION", muscleGroup: "Shoulders", equipment: "Plate", metValue: 3.5, isCompound: false, instructions: "Hold plate with both hands, raise to shoulder height." },

  // ═══════════════════════════════════════════
  // ARMS (20 exercises)
  // ═══════════════════════════════════════════
  { name: "Barbell Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Barbell", metValue: 4.0, isCompound: false, instructions: "Stand, curl barbell from thighs to shoulders, keep elbows at sides." },
  { name: "Dumbbell Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Alternate or simultaneous curls, supinate wrists at top." },
  { name: "Hammer Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Neutral grip (palms facing each other), curl up. Targets brachialis." },
  { name: "Preacher Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Barbell", metValue: 3.5, isCompound: false, instructions: "Arms over preacher bench, curl barbell. Isolates biceps." },
  { name: "Incline Dumbbell Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Bench at 45°, curl with full stretch at bottom." },
  { name: "Cable Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "Low pulley, curl handle to shoulders. Constant tension." },
  { name: "Concentration Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 3.0, isCompound: false, instructions: "Seated, elbow on inner thigh, curl dumbbell to shoulder." },
  { name: "Spider Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Chest on incline bench, arms hanging, curl from fully extended." },
  { name: "EZ Bar Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Barbell", metValue: 4.0, isCompound: false, instructions: "Use EZ bar for wrist comfort, curl to shoulders." },
  { name: "Reverse Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Barbell", metValue: 3.5, isCompound: false, instructions: "Overhand grip, curl. Targets forearms and brachioradialis." },
  { name: "Skull Crusher (Lying Tricep Extension)", category: "ISOLATION", muscleGroup: "Arms", equipment: "Barbell", metValue: 4.0, isCompound: false, instructions: "Lie flat, lower bar to forehead, extend arms. Targets long head." },
  { name: "Tricep Pushdown (Cable)", category: "ISOLATION", muscleGroup: "Arms", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "High cable, push bar down to full extension, squeeze triceps." },
  { name: "Overhead Tricep Extension (Dumbbell)", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 3.5, isCompound: false, instructions: "Hold dumbbell overhead, lower behind head, extend." },
  { name: "Overhead Tricep Extension (Cable)", category: "ISOLATION", muscleGroup: "Arms", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "Face away from cable, extend rope overhead." },
  { name: "Kickback (Dumbbell)", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 3.0, isCompound: false, instructions: "Hinge forward, extend arm back, squeeze at lockout." },
  { name: "Dips (Tricep)", category: "COMPOUND", muscleGroup: "Arms", equipment: null, metValue: 5.5, isCompound: true, instructions: "Upright torso (not leaning). Targets triceps more than chest." },
  { name: "Close Grip Push-Up", category: "COMPOUND", muscleGroup: "Arms", equipment: null, metValue: 4.0, isCompound: true, instructions: "Hands close together under chest. Emphasizes triceps." },
  { name: "Wrist Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 2.5, isCompound: false, instructions: "Forearms on thighs, curl wrists upward. Forearm builder." },
  { name: "Reverse Wrist Curl", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 2.5, isCompound: false, instructions: "Overhand grip, curl wrists upward. Forearm extensor." },
  { name: "Dumbbell Shrug", category: "ISOLATION", muscleGroup: "Arms", equipment: "Dumbbell", metValue: 4.0, isCompound: false, instructions: "Hold dumbbells at sides, elevate shoulders, hold, lower." },

  // ═══════════════════════════════════════════
  // CORE (15 exercises)
  // ═══════════════════════════════════════════
  { name: "Plank", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 3.0, isCompound: false, instructions: "Forearms and toes on floor, body straight, hold position." },
  { name: "Side Plank", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 3.0, isCompound: false, instructions: "One forearm on floor, stack feet, hold with hips elevated." },
  { name: "Crunch", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 3.0, isCompound: false, instructions: "Lie on back, curl shoulders off floor toward knees." },
  { name: "Bicycle Crunch", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 3.5, isCompound: false, instructions: "Alternate elbow to opposite knee in pedaling motion." },
  { name: "Hanging Leg Raise", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 4.5, isCompound: false, instructions: "Hang from bar, raise legs to parallel or higher." },
  { name: "Hanging Knee Raise", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 4.0, isCompound: false, instructions: "Hang from bar, bring knees to chest." },
  { name: "Cable Crunch", category: "ISOLATION", muscleGroup: "Core", equipment: "Cable", metValue: 3.5, isCompound: false, instructions: "Kneel at high cable, crunch rope toward knees." },
  { name: "Ab Wheel Rollout", category: "COMPOUND", muscleGroup: "Core", equipment: "Ab Wheel", metValue: 4.5, isCompound: true, instructions: "Kneel, roll wheel forward as far as possible, pull back." },
  { name: "Russian Twist", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 3.5, isCompound: false, instructions: "Sit with knees bent, lean back slightly, twist side to side." },
  { name: "Mountain Climber", category: "COMPOUND", muscleGroup: "Core", equipment: null, metValue: 8.0, isCompound: true, instructions: "Plank position, drive knees to chest alternately, fast pace." },
  { name: "Dead Bug", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 2.5, isCompound: false, instructions: "Lie on back, extend opposite arm and leg, keep lower back pressed down." },
  { name: "Pallof Press", category: "ISOLATION", muscleGroup: "Core", equipment: "Cable", metValue: 3.0, isCompound: false, instructions: "Stand sideways to cable, press handle forward resisting rotation." },
  { name: "Leg Raise (Lying)", category: "ISOLATION", muscleGroup: "Core", equipment: null, metValue: 3.5, isCompound: false, instructions: "Lie flat, raise straight legs to 90°, lower slowly." },
  { name: "Decline Sit-Up", category: "ISOLATION", muscleGroup: "Core", equipment: "Bench", metValue: 3.5, isCompound: false, instructions: "Decline bench, feet hooked, sit up fully." },
  { name: "Dragon Flag", category: "COMPOUND", muscleGroup: "Core", equipment: "Bench", metValue: 5.0, isCompound: true, instructions: "Lie on bench, hold edge behind head, raise entire body as one unit." },

  // ═══════════════════════════════════════════
  // CARDIO (20 exercises)
  // ═══════════════════════════════════════════
  { name: "Running (Outdoor)", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 9.8, isCompound: true, instructions: "Steady pace running on flat ground." },
  { name: "Running (Treadmill)", category: "CARDIO", muscleGroup: "Cardio", equipment: "Treadmill", metValue: 9.8, isCompound: true, instructions: "Set speed and incline. Hold on only if needed for balance." },
  { name: "Jogging", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 7.0, isCompound: true, instructions: "Light pace running, conversational speed." },
  { name: "Walking (Brisk)", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 4.3, isCompound: true, instructions: "Fast-paced walking, arms swinging." },
  { name: "Cycling (Outdoor)", category: "CARDIO", muscleGroup: "Cardio", equipment: "Bicycle", metValue: 8.0, isCompound: true, instructions: "Steady pace cycling on flat or mixed terrain." },
  { name: "Cycling (Stationary)", category: "CARDIO", muscleGroup: "Cardio", equipment: "Stationary Bike", metValue: 7.0, isCompound: true, instructions: "Set resistance, maintain steady cadence." },
  { name: "Rowing Machine", category: "CARDIO", muscleGroup: "Cardio", equipment: "Rowing Machine", metValue: 7.0, isCompound: true, instructions: "Drive with legs, lean back, pull handle to chest." },
  { name: "Elliptical", category: "CARDIO", muscleGroup: "Cardio", equipment: "Elliptical", metValue: 5.0, isCompound: true, instructions: "Smooth striding motion, adjust resistance." },
  { name: "Stair Climber", category: "CARDIO", muscleGroup: "Cardio", equipment: "Stair Machine", metValue: 9.0, isCompound: true, instructions: "Steady pace, don't lean on handrails." },
  { name: "Jump Rope / Skipping", category: "CARDIO", muscleGroup: "Cardio", equipment: "Jump Rope", metValue: 11.0, isCompound: true, instructions: "Light bouncing on balls of feet, wrists turning rope." },
  { name: "Swimming (Freestyle)", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 8.0, isCompound: true, instructions: "Steady freestyle laps." },
  { name: "HIIT (Generic)", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 12.0, isCompound: true, instructions: "Alternating 20-30s max effort with 10-15s rest." },
  { name: "Battle Ropes", category: "CARDIO", muscleGroup: "Cardio", equipment: "Battle Ropes", metValue: 10.0, isCompound: true, instructions: "Alternating waves with heavy ropes." },
  { name: "Sprints", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 14.0, isCompound: true, instructions: "Maximum effort running for short distances (50-200m)." },
  { name: "Incline Walking (Treadmill)", category: "CARDIO", muscleGroup: "Cardio", equipment: "Treadmill", metValue: 6.0, isCompound: true, instructions: "Set 10-15% incline, walk at 5-6 km/h." },
  { name: "Kickboxing", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 10.0, isCompound: true, instructions: "Punch and kick combinations with cardio intervals." },
  { name: "Dancing (General)", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 5.5, isCompound: true, instructions: "General dancing — Zumba, aerobics, freestyle." },
  { name: "Hiking", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 6.0, isCompound: true, instructions: "Outdoor walking on uneven/hilly terrain." },
  { name: "Sports (Badminton)", category: "CARDIO", muscleGroup: "Cardio", equipment: "Racquet", metValue: 5.5, isCompound: true, instructions: "General badminton play." },
  { name: "Sports (Cricket)", category: "CARDIO", muscleGroup: "Cardio", equipment: null, metValue: 5.0, isCompound: true, instructions: "General cricket play including batting, bowling, fielding." },

  // ═══════════════════════════════════════════
  // FULL BODY / FUNCTIONAL (10 exercises)
  // ═══════════════════════════════════════════
  { name: "Burpee", category: "COMPOUND", muscleGroup: "Full Body", equipment: null, metValue: 10.0, isCompound: true, instructions: "Squat, jump back to plank, push-up, jump forward, jump up." },
  { name: "Thruster (Barbell)", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Barbell", metValue: 8.0, isCompound: true, instructions: "Front squat into overhead press in one fluid motion." },
  { name: "Clean and Press", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Barbell", metValue: 8.0, isCompound: true, instructions: "Explosive pull from floor to shoulders, then press overhead." },
  { name: "Kettlebell Swing", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Kettlebell", metValue: 9.0, isCompound: true, instructions: "Hinge at hips, swing kettlebell to shoulder height with hip drive." },
  { name: "Turkish Get-Up", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Kettlebell", metValue: 6.0, isCompound: true, instructions: "Complex movement from lying to standing while holding weight overhead." },
  { name: "Farmer's Walk", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Dumbbell", metValue: 6.0, isCompound: true, instructions: "Hold heavy dumbbells at sides, walk for distance or time." },
  { name: "Sled Push", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Sled", metValue: 10.0, isCompound: true, instructions: "Low position, drive sled forward with legs." },
  { name: "Bear Crawl", category: "COMPOUND", muscleGroup: "Full Body", equipment: null, metValue: 8.0, isCompound: true, instructions: "Hands and feet on floor, knees hovering, crawl forward." },
  { name: "Man Maker", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Dumbbell", metValue: 9.0, isCompound: true, instructions: "Push-up, row each side, squat clean, press overhead." },
  { name: "Medicine Ball Slam", category: "COMPOUND", muscleGroup: "Full Body", equipment: "Medicine Ball", metValue: 8.0, isCompound: true, instructions: "Lift ball overhead, slam into ground with full body force." },

  // ═══════════════════════════════════════════
  // STRETCHING & MOBILITY (10 exercises)
  // ═══════════════════════════════════════════
  { name: "Foam Rolling (Full Body)", category: "CARDIO", muscleGroup: "Mobility", equipment: "Foam Roller", metValue: 2.0, isCompound: false, instructions: "Slowly roll each muscle group for 30-60 seconds." },
  { name: "Static Stretching (General)", category: "CARDIO", muscleGroup: "Mobility", equipment: null, metValue: 2.3, isCompound: false, instructions: "Hold each stretch for 20-30 seconds. Don't bounce." },
  { name: "Dynamic Stretching (Warmup)", category: "CARDIO", muscleGroup: "Mobility", equipment: null, metValue: 3.5, isCompound: false, instructions: "Leg swings, arm circles, lunges with twist. Before workout." },
  { name: "Hip Flexor Stretch", category: "CARDIO", muscleGroup: "Mobility", equipment: null, metValue: 2.0, isCompound: false, instructions: "Lunge position, push hips forward, hold 30 seconds each side." },
  { name: "Pigeon Stretch", category: "CARDIO", muscleGroup: "Mobility", equipment: null, metValue: 2.0, isCompound: false, instructions: "One leg forward bent, back leg extended, lean forward." },
  { name: "Cat-Cow Stretch", category: "CARDIO", muscleGroup: "Mobility", equipment: null, metValue: 2.0, isCompound: false, instructions: "On all fours, alternate arching and rounding spine." },
  { name: "Shoulder Dislocate (Band)", category: "CARDIO", muscleGroup: "Mobility", equipment: "Band", metValue: 2.0, isCompound: false, instructions: "Wide grip on band, rotate arms overhead and behind body." },
  { name: "World's Greatest Stretch", category: "CARDIO", muscleGroup: "Mobility", equipment: null, metValue: 3.0, isCompound: false, instructions: "Lunge, place hand inside foot, rotate and reach to sky." },
  { name: "Yoga (General)", category: "CARDIO", muscleGroup: "Mobility", equipment: null, metValue: 3.0, isCompound: false, instructions: "General yoga practice — mix of poses, breathing, and holds." },
  { name: "Lacrosse Ball Release", category: "CARDIO", muscleGroup: "Mobility", equipment: "Lacrosse Ball", metValue: 2.0, isCompound: false, instructions: "Pin ball against wall or floor on tight spots, apply pressure." },
];
