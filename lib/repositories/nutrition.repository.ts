/**
 * Nutrition Repository — Raw Prisma Queries
 * ══════════════════════════════════════════
 *
 * Handles all database reads/writes for meal logging.
 *
 * TABLES USED:
 * ────────────
 * MealEntry — one per meal (breakfast/lunch/dinner/snack) per day
 * MealFood  — individual food items within a meal entry
 *
 * A MealEntry can have many MealFood items.
 * Example: Lunch MealEntry → [Roti ×2, Dal, Chicken Curry]
 */

import { prisma } from "@/lib/supabase/prisma";

/**
 * Get all meal entries for a user on a specific date.
 * Returns entries with their food items included.
 */
export async function getMealEntriesByDate(userId: string, date: string) {
  return prisma.mealEntry.findMany({
    where: {
      userId,
      date: new Date(date),
    },
    include: {
      mealFoods: {
        include: {
          food: {
            select: {
              id: true,
              name: true,
              nameHindi: true,
              defaultUnit: true,
              defaultGrams: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get daily nutrition totals for a user on a specific date.
 * Uses Prisma aggregation — single query, no fetching all rows.
 */
export async function getDailySummary(userId: string, date: string) {
  const result = await prisma.mealFood.aggregate({
    where: {
      mealEntry: {
        userId,
        date: new Date(date),
      },
    },
    _sum: {
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
    },
  });

  return {
    totalCalories: Math.round(result._sum.calories ?? 0),
    totalProtein: Math.round(result._sum.protein ?? 0),
    totalCarbs: Math.round(result._sum.carbs ?? 0),
    totalFat: Math.round(result._sum.fat ?? 0),
  };
}

/**
 * Log a food item under a meal entry.
 * Creates the MealEntry if it doesn't exist yet (upsert by userId+date+mealType).
 */
export async function logFood(
  userId: string,
  data: {
    date: string;
    mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
    foodId?: string;
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    isRestaurant?: boolean;
  }
) {
  return prisma.$transaction(async (tx) => {
    // Find or create the meal entry for this date + meal type
    let mealEntry = await tx.mealEntry.findFirst({
      where: {
        userId,
        date: new Date(data.date),
        mealType: data.mealType,
      },
    });

    if (!mealEntry) {
      mealEntry = await tx.mealEntry.create({
        data: {
          userId,
          date: new Date(data.date),
          mealType: data.mealType,
        },
      });
    }

    // Add the food item to this meal entry
    const mealFood = await tx.mealFood.create({
      data: {
        mealEntryId: mealEntry.id,
        foodId: data.foodId || null,
        name: data.name,
        quantity: data.quantity,
        unit: data.unit,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        isRestaurant: data.isRestaurant ?? false,
      },
    });

    return { mealEntry, mealFood };
  });
}

/**
 * Delete a single food item from a meal.
 * If the meal entry has no more foods after this, deletes the entry too.
 */
export async function deleteMealFood(mealFoodId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    // First verify this belongs to the user (security check)
    const mealFood = await tx.mealFood.findUnique({
      where: { id: mealFoodId },
      include: {
        mealEntry: { select: { id: true, userId: true } },
      },
    });

    if (!mealFood || mealFood.mealEntry.userId !== userId) {
      throw new Error("Food item not found or not authorized");
    }

    // Delete the food item
    await tx.mealFood.delete({ where: { id: mealFoodId } });

    // Check if the meal entry is now empty
    const remainingFoods = await tx.mealFood.count({
      where: { mealEntryId: mealFood.mealEntry.id },
    });

    // If no foods left, clean up the empty meal entry
    if (remainingFoods === 0) {
      await tx.mealEntry.delete({
        where: { id: mealFood.mealEntry.id },
      });
    }

    return { deleted: true };
  });
}
