/**
 * Custom Food Service — "my whey protein" and anything like it
 * ═════════════════════════════════════════════════════════════
 *
 * THE PROBLEM THIS SOLVES:
 * ────────────────────────
 * Protein powder is the one food where the label in the user's kitchen beats
 * anything we can ship. Concentrate, isolate, blend, flavour, brand — the
 * macros move a lot, and the seeded `foods` table carries a single honest
 * average. A user on isolate logging that average is wrong every single day.
 *
 * So: the generic entry stays for people who don't care, and anyone who does
 * saves their own numbers once. Because the row is keyed on (userId, name),
 * saving again after a brand switch UPDATES it — every future log picks up
 * the new macros, and no stale duplicate is left behind in search.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 * ─────────────────────────────────
 * Editing a custom food never rewrites meals already logged. MealFood stores
 * its own macro snapshot, so past days keep the numbers that were true when
 * the user ate — changing your tub in August must not silently restate July.
 */

import {
  listCustomFoods,
  searchCustomFoods,
  findCustomFoodById,
  upsertCustomFood,
  updateCustomFoodForUser,
  deleteCustomFoodForUser,
  type CustomFoodInput,
} from "@/lib/repositories/custom-food.repository";
import { NotFoundError } from "@/lib/utils/errors";

export async function getCustomFoods(userId: string) {
  return listCustomFoods(userId);
}

export async function findCustomFoods(
  userId: string,
  query: string,
  limit: number
) {
  return searchCustomFoods(userId, query, limit);
}

/**
 * Save a custom food. Create-or-replace by name, so the UI can offer a single
 * "Save my macros" button without first asking whether one already exists.
 */
export async function saveCustomFood(userId: string, data: CustomFoodInput) {
  return upsertCustomFood(userId, data);
}

export async function editCustomFood(
  id: string,
  userId: string,
  data: Partial<CustomFoodInput>
) {
  const updated = await updateCustomFoodForUser(id, userId, data);
  if (!updated) throw new NotFoundError("Custom food not found");
  return updated;
}

export async function removeCustomFood(id: string, userId: string) {
  const deleted = await deleteCustomFoodForUser(id, userId);
  if (!deleted) throw new NotFoundError("Custom food not found");
  return { deleted: true };
}

export async function getCustomFood(id: string, userId: string) {
  const food = await findCustomFoodById(id, userId);
  if (!food) throw new NotFoundError("Custom food not found");
  return food;
}
