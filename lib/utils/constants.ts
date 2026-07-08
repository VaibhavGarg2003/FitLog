/**
 * App-wide Constants
 * ══════════════════
 *
 * WHY A CONSTANTS FILE?
 * Instead of scattering magic numbers across components, we put
 * them here. If the business rule changes (e.g., safety floor
 * from 1200 to 1100), we change ONE place.
 *
 * These are used by the calorie engine, dashboard, and feedback system.
 */

// ─── App Metadata ──────────────────────────────────────
export const APP_NAME = "FitLog";
export const APP_DESCRIPTION =
  "Production-ready fitness tracking for Indian gym-goers";

// ─── Route Paths ───────────────────────────────────────
// Centralized so route changes don't require find-and-replace
export const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  workout: "/workout",
  workoutHistory: "/workout/history",
  nutrition: "/nutrition",
  nutritionSearch: "/nutrition/search",
  nutritionRecipe: "/nutrition/recipe",
  progress: "/progress",
  settings: "/settings",
} as const;
// `as const` makes these READONLY — TypeScript won't let you
// accidentally write `ROUTES.home = "/other"` somewhere.

// ─── Auth Routes (no bottom nav, no auth required) ────
export const PUBLIC_ROUTES = [ROUTES.home, ROUTES.login, ROUTES.signup];
export const AUTH_ROUTES = [ROUTES.login, ROUTES.signup];

// ─── Safety Floors (calories/day) ──────────────────────
// Below this = danger flag. Based on medical recommendations.
export const SAFETY_FLOOR_FEMALE = 1200;
export const SAFETY_FLOOR_MALE = 1500;

// ─── Macro Ratios (default, user can customize) ────────
export const DEFAULT_MACRO_RATIOS = {
  protein: 0.3, // 30% of calories from protein
  carbs: 0.4, // 40% from carbs
  fat: 0.3, // 30% from fat
} as const;

// ─── Steps Target ──────────────────────────────────────
export const DEFAULT_STEPS_TARGET = 10_000;
// The underscore (10_000) is a numeric separator in JS/TS.
// It's the same as 10000 but easier to read. Works since ES2021.

// ─── WHO Intensity Minutes Target ──────────────────────
export const WEEKLY_INTENSITY_MINUTES_TARGET = 150;

// ─── Bottom Nav Items ──────────────────────────────────
export const NAV_ITEMS = [
  { label: "Dashboard", href: ROUTES.dashboard, icon: "LayoutDashboard" },
  { label: "Workout", href: ROUTES.workout, icon: "Dumbbell" },
  { label: "Nutrition", href: ROUTES.nutrition, icon: "UtensilsCrossed" },
  { label: "Progress", href: ROUTES.progress, icon: "TrendingUp" },
  { label: "Settings", href: ROUTES.settings, icon: "Settings" },
] as const;
