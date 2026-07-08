/**
 * Manual / Gym Foods — Supplements & Fitness-Specific Items
 * ═════════════════════════════════════════════════════════
 *
 * These foods don't exist in any public nutrition database.
 * They are gym-specific: supplements, protein bars, mass gainers, etc.
 * Values are from product labels (per 100g unless otherwise noted).
 */

import { type FoodSeedData } from "./foods-indian-prepared";

export const manualFoods: FoodSeedData[] = [
  // ═══════════════════════════════════════════
  // PROTEIN SUPPLEMENTS
  // ═══════════════════════════════════════════
  { name: "Whey Protein (ON Gold Standard)", category: "Supplement", caloriesPer100g: 375, proteinPer100g: 78.0, carbsPer100g: 9.4, fatPer100g: 3.1, fiberPer100g: 0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 32 },
  { name: "Whey Protein (MuscleBlaze)", category: "Supplement", caloriesPer100g: 380, proteinPer100g: 75.0, carbsPer100g: 12.0, fatPer100g: 3.5, fiberPer100g: 0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 33 },
  { name: "Whey Protein (MyProtein Impact)", category: "Supplement", caloriesPer100g: 390, proteinPer100g: 82.0, carbsPer100g: 4.0, fatPer100g: 3.0, fiberPer100g: 0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 25 },
  { name: "Casein Protein", category: "Supplement", caloriesPer100g: 370, proteinPer100g: 80.0, carbsPer100g: 4.5, fatPer100g: 2.0, fiberPer100g: 0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 33 },
  { name: "Mass Gainer", category: "Supplement", caloriesPer100g: 400, proteinPer100g: 20.0, carbsPer100g: 70.0, fatPer100g: 5.0, fiberPer100g: 2.0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 75 },
  { name: "Plant Protein (Pea + Rice)", category: "Supplement", caloriesPer100g: 370, proteinPer100g: 75.0, carbsPer100g: 8.0, fatPer100g: 5.0, fiberPer100g: 3.0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 30 },
  { name: "BCAA Powder", category: "Supplement", caloriesPer100g: 10, proteinPer100g: 0, carbsPer100g: 2.0, fatPer100g: 0, fiberPer100g: 0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 7 },
  { name: "Creatine Monohydrate", category: "Supplement", caloriesPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, fiberPer100g: 0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 5 },
  { name: "Pre-Workout (Generic)", category: "Supplement", caloriesPer100g: 15, proteinPer100g: 0, carbsPer100g: 3.0, fatPer100g: 0, fiberPer100g: 0, defaultUnit: "scoop", defaultQuantity: 1, defaultGrams: 10 },

  // ═══════════════════════════════════════════
  // PROTEIN BARS & SNACKS
  // ═══════════════════════════════════════════
  { name: "Protein Bar (Generic)", category: "Protein Snack", caloriesPer100g: 350, proteinPer100g: 30.0, carbsPer100g: 35.0, fatPer100g: 12.0, fiberPer100g: 5.0, defaultUnit: "bar", defaultQuantity: 1, defaultGrams: 60 },
  { name: "Yogabar Protein Bar", category: "Protein Snack", caloriesPer100g: 380, proteinPer100g: 28.0, carbsPer100g: 40.0, fatPer100g: 13.0, fiberPer100g: 4.0, defaultUnit: "bar", defaultQuantity: 1, defaultGrams: 60 },
  { name: "RiteBite Max Protein Bar", category: "Protein Snack", caloriesPer100g: 340, proteinPer100g: 35.0, carbsPer100g: 30.0, fatPer100g: 10.0, fiberPer100g: 6.0, defaultUnit: "bar", defaultQuantity: 1, defaultGrams: 70 },

  // ═══════════════════════════════════════════
  // COMMON INTERNATIONAL FOODS
  // ═══════════════════════════════════════════
  { name: "Chicken Breast (Grilled)", category: "Protein", caloriesPer100g: 165, proteinPer100g: 31.0, carbsPer100g: 0, fatPer100g: 3.6, fiberPer100g: 0, defaultUnit: "g", defaultQuantity: 150, defaultGrams: 150 },
  { name: "Chicken Thigh (Skin-On)", category: "Protein", caloriesPer100g: 209, proteinPer100g: 26.0, carbsPer100g: 0, fatPer100g: 11.0, fiberPer100g: 0, defaultUnit: "g", defaultQuantity: 150, defaultGrams: 150 },
  { name: "Egg White", category: "Protein", caloriesPer100g: 52, proteinPer100g: 11.0, carbsPer100g: 0.7, fatPer100g: 0.2, fiberPer100g: 0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 33 },
  { name: "Whole Egg", category: "Protein", caloriesPer100g: 155, proteinPer100g: 13.0, carbsPer100g: 1.1, fatPer100g: 11.0, fiberPer100g: 0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 50 },
  { name: "Salmon (Baked)", category: "Protein", caloriesPer100g: 208, proteinPer100g: 20.0, carbsPer100g: 0, fatPer100g: 13.0, fiberPer100g: 0, defaultUnit: "fillet", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Tuna (Canned in Water)", category: "Protein", caloriesPer100g: 116, proteinPer100g: 26.0, carbsPer100g: 0, fatPer100g: 1.0, fiberPer100g: 0, defaultUnit: "can", defaultQuantity: 1, defaultGrams: 120 },
  { name: "Tofu (Firm)", category: "Protein", caloriesPer100g: 144, proteinPer100g: 17.0, carbsPer100g: 3.0, fatPer100g: 8.0, fiberPer100g: 2.0, defaultUnit: "g", defaultQuantity: 100, defaultGrams: 100 },
  { name: "Greek Yogurt (Plain)", category: "Dairy", caloriesPer100g: 97, proteinPer100g: 9.0, carbsPer100g: 3.6, fatPer100g: 5.0, fiberPer100g: 0, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 170 },

  // ═══════════════════════════════════════════
  // GRAINS, CEREALS & STAPLES
  // ═══════════════════════════════════════════
  { name: "Oats (Dry)", category: "Grain", caloriesPer100g: 389, proteinPer100g: 17.0, carbsPer100g: 66.0, fatPer100g: 7.0, fiberPer100g: 11.0, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 40 },
  { name: "Oatmeal (Cooked)", category: "Grain", caloriesPer100g: 71, proteinPer100g: 2.5, carbsPer100g: 12.0, fatPer100g: 1.5, fiberPer100g: 1.7, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Brown Rice (Cooked)", category: "Grain", caloriesPer100g: 123, proteinPer100g: 2.7, carbsPer100g: 26.0, fatPer100g: 1.0, fiberPer100g: 1.8, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Muesli (No Added Sugar)", category: "Grain", caloriesPer100g: 370, proteinPer100g: 10.0, carbsPer100g: 60.0, fatPer100g: 8.0, fiberPer100g: 7.0, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 50 },
  { name: "Granola", category: "Grain", caloriesPer100g: 470, proteinPer100g: 10.0, carbsPer100g: 58.0, fatPer100g: 22.0, fiberPer100g: 5.0, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 45 },
  { name: "Whole Wheat Bread", category: "Grain", caloriesPer100g: 247, proteinPer100g: 9.0, carbsPer100g: 41.0, fatPer100g: 3.4, fiberPer100g: 6.0, defaultUnit: "slice", defaultQuantity: 2, defaultGrams: 56 },
  { name: "White Bread", category: "Grain", caloriesPer100g: 265, proteinPer100g: 9.0, carbsPer100g: 49.0, fatPer100g: 3.2, fiberPer100g: 2.7, defaultUnit: "slice", defaultQuantity: 2, defaultGrams: 56 },

  // ═══════════════════════════════════════════
  // FRUITS
  // ═══════════════════════════════════════════
  { name: "Banana", category: "Fruit", caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 23.0, fatPer100g: 0.3, fiberPer100g: 2.6, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 120 },
  { name: "Apple", category: "Fruit", caloriesPer100g: 52, proteinPer100g: 0.3, carbsPer100g: 14.0, fatPer100g: 0.2, fiberPer100g: 2.4, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 180 },
  { name: "Mango", nameHindi: "आम", category: "Fruit", caloriesPer100g: 60, proteinPer100g: 0.8, carbsPer100g: 15.0, fatPer100g: 0.4, fiberPer100g: 1.6, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Papaya", nameHindi: "पपीता", category: "Fruit", caloriesPer100g: 43, proteinPer100g: 0.5, carbsPer100g: 11.0, fatPer100g: 0.3, fiberPer100g: 1.7, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 140 },
  { name: "Watermelon", nameHindi: "तरबूज", category: "Fruit", caloriesPer100g: 30, proteinPer100g: 0.6, carbsPer100g: 8.0, fatPer100g: 0.2, fiberPer100g: 0.4, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Orange", nameHindi: "संतरा", category: "Fruit", caloriesPer100g: 47, proteinPer100g: 0.9, carbsPer100g: 12.0, fatPer100g: 0.1, fiberPer100g: 2.4, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 130 },
  { name: "Pomegranate", nameHindi: "अनार", category: "Fruit", caloriesPer100g: 83, proteinPer100g: 1.7, carbsPer100g: 19.0, fatPer100g: 1.2, fiberPer100g: 4.0, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Guava", nameHindi: "अमरूद", category: "Fruit", caloriesPer100g: 68, proteinPer100g: 2.6, carbsPer100g: 14.0, fatPer100g: 1.0, fiberPer100g: 5.4, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 100 },

  // ═══════════════════════════════════════════
  // NUTS & SEEDS
  // ═══════════════════════════════════════════
  { name: "Almonds", nameHindi: "बादाम", category: "Nuts", caloriesPer100g: 579, proteinPer100g: 21.0, carbsPer100g: 22.0, fatPer100g: 50.0, fiberPer100g: 12.0, defaultUnit: "piece", defaultQuantity: 10, defaultGrams: 14 },
  { name: "Peanuts (Roasted)", nameHindi: "मूंगफली", category: "Nuts", caloriesPer100g: 567, proteinPer100g: 26.0, carbsPer100g: 16.0, fatPer100g: 49.0, fiberPer100g: 8.5, defaultUnit: "handful", defaultQuantity: 1, defaultGrams: 30 },
  { name: "Peanut Butter", category: "Nuts", caloriesPer100g: 588, proteinPer100g: 25.0, carbsPer100g: 20.0, fatPer100g: 50.0, fiberPer100g: 6.0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 32 },
  { name: "Walnuts", nameHindi: "अखरोट", category: "Nuts", caloriesPer100g: 654, proteinPer100g: 15.0, carbsPer100g: 14.0, fatPer100g: 65.0, fiberPer100g: 7.0, defaultUnit: "piece", defaultQuantity: 5, defaultGrams: 15 },
  { name: "Cashews", nameHindi: "काजू", category: "Nuts", caloriesPer100g: 553, proteinPer100g: 18.0, carbsPer100g: 30.0, fatPer100g: 44.0, fiberPer100g: 3.0, defaultUnit: "piece", defaultQuantity: 10, defaultGrams: 15 },
  { name: "Chia Seeds", category: "Nuts", caloriesPer100g: 486, proteinPer100g: 17.0, carbsPer100g: 42.0, fatPer100g: 31.0, fiberPer100g: 34.0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 12 },
  { name: "Flax Seeds", nameHindi: "अलसी", category: "Nuts", caloriesPer100g: 534, proteinPer100g: 18.0, carbsPer100g: 29.0, fatPer100g: 42.0, fiberPer100g: 27.0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 10 },

  // ═══════════════════════════════════════════
  // COOKING OILS
  // ═══════════════════════════════════════════
  { name: "Olive Oil", category: "Oil", caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 14 },
  { name: "Coconut Oil", category: "Oil", caloriesPer100g: 862, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 14 },
  { name: "Mustard Oil", nameHindi: "सरसों का तेल", category: "Oil", caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 14 },
  { name: "Sunflower Oil", category: "Oil", caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 14 },

  // ═══════════════════════════════════════════
  // SUGAR & SWEETENERS
  // ═══════════════════════════════════════════
  { name: "Sugar (White)", nameHindi: "चीनी", category: "Sweetener", caloriesPer100g: 387, proteinPer100g: 0, carbsPer100g: 100, fatPer100g: 0, fiberPer100g: 0, defaultUnit: "tsp", defaultQuantity: 1, defaultGrams: 4 },
  { name: "Honey", nameHindi: "शहद", category: "Sweetener", caloriesPer100g: 304, proteinPer100g: 0.3, carbsPer100g: 82.0, fatPer100g: 0, fiberPer100g: 0.2, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 21 },
  { name: "Jaggery", nameHindi: "गुड़", category: "Sweetener", caloriesPer100g: 383, proteinPer100g: 0.4, carbsPer100g: 98.0, fatPer100g: 0.1, fiberPer100g: 0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 15 },
];
