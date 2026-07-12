/**
 * Nutrition Service — Business Logic Layer
 * ═════════════════════════════════════════
 *
 * FLOW FOR LOGGING A FOOD:
 * ────────────────────────
 * 1. User selects food from search results
 * 2. User enters quantity (grams or default serving)
 * 3. This service calculates actual calories/macros from quantity
 * 4. Repository saves the calculated values
 *
 * WHY CALCULATE HERE AND NOT IN THE UI?
 * ──────────────────────────────────────
 * The UI sends: { foodId, quantity, unit }
 * This service fetches the Food record, multiplies nutrition by quantity,
 * and sends the calculated numbers to the repository.
 * This ensures the math is done server-side (tamper-proof).
 */

import {
  getDailySummary,
  getMealEntriesByDate,
  logFood,
  logFoodsBatch,
  deleteMealFood,
} from "@/lib/repositories/nutrition.repository";
import { findFoodById } from "@/lib/repositories/food.repository";

/**
 * Log a food item with automatic calorie/macro calculation.
 */
export async function logFoodItem(
  userId: string,
  data: {
    date: string;
    mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
    foodId: string;
    quantityGrams: number;
    isRestaurant: boolean;
  }
) {
  // Fetch the food record to get nutrition per 100g
  const food = await findFoodById(data.foodId);

  if (!food) throw new Error("Food not found");

  // Calculate nutrition for the specified quantity
  const multiplier = data.quantityGrams / 100;
  const restaurantFactor = data.isRestaurant ? food.restaurantMultiplier : 1;

  const calories = Math.round(food.caloriesPer100g * multiplier * restaurantFactor);
  const protein = Math.round(food.proteinPer100g * multiplier * 10) / 10;
  const carbs = Math.round(food.carbsPer100g * multiplier * 10) / 10;
  const fat = Math.round(food.fatPer100g * multiplier * 10) / 10;

  return logFood(userId, {
    date: data.date,
    mealType: data.mealType,
    foodId: data.foodId,
    name: food.name,
    quantity: data.quantityGrams,
    unit: "g",
    calories,
    protein,
    carbs,
    fat,
    isRestaurant: data.isRestaurant,
  });
}

/**
 * Log a custom food (not from the database — user typed it manually).
 */
export async function logCustomFood(
  userId: string,
  data: {
    date: string;
    mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }
) {
  return logFood(userId, {
    ...data,
    isRestaurant: false,
  });
}

/**
 * Log many pre-calculated food rows under one meal in a single transaction.
 * Used by the AI meal parser — the whole meal succeeds or fails atomically.
 */
export async function logMealFoods(
  userId: string,
  data: {
    date: string;
    mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
    foods: Array<{
      foodId?: string | null;
      name: string;
      quantity: number;
      unit: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }
) {
  return logFoodsBatch(userId, data);
}

/**
 * Get the full meal list for a date (for the nutrition page).
 */
export async function getMealsForDate(userId: string, date: string) {
  return getMealEntriesByDate(userId, date);
}

/**
 * Get daily totals (for the dashboard calorie ring).
 */
export async function getDailyTotals(userId: string, date: string) {
  return getDailySummary(userId, date);
}

/**
 * Remove a food item from a meal.
 */
export async function removeFood(mealFoodId: string, userId: string) {
  return deleteMealFood(mealFoodId, userId);
}
