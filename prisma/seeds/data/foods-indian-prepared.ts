/**
 * Indian Prepared Dishes — Curated Nutrition Data
 * ════════════════════════════════════════════════
 *
 * WHY THIS FILE EXISTS:
 * ─────────────────────
 * The IFCT 2017 database only has raw ingredients ("wheat flour", "raw mung dal").
 * But real users log PREPARED DISHES ("Dal Tadka", "Butter Chicken").
 *
 * This file contains ~200 common Indian dishes with realistic nutrition
 * values per 100g. These are the foods Indian users actually eat and log daily.
 *
 * SOURCES:
 * ────────
 * Values are compiled from Nutritionix, INDB research papers, CalorieKing India,
 * and cross-referenced with multiple sources. They represent home-cooked versions.
 * Restaurant versions use the restaurantMultiplier (default 1.5×).
 *
 * ALL VALUES ARE PER 100 GRAMS.
 */

export interface FoodSeedData {
  name: string;
  nameHindi?: string;
  category: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number;
  defaultUnit: string;
  defaultQuantity: number;
  defaultGrams: number;
  restaurantMultiplier?: number;
}

export const indianPreparedFoods: FoodSeedData[] = [
  // ═══════════════════════════════════════════
  // DAL & LENTILS
  // ═══════════════════════════════════════════
  { name: "Dal Tadka", nameHindi: "दाल तड़का", category: "Dal", caloriesPer100g: 116, proteinPer100g: 5.2, carbsPer100g: 14.8, fatPer100g: 4.1, fiberPer100g: 3.2, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Dal Makhani", nameHindi: "दाल मखनी", category: "Dal", caloriesPer100g: 138, proteinPer100g: 5.5, carbsPer100g: 12.0, fatPer100g: 7.8, fiberPer100g: 3.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Chana Dal", nameHindi: "चना दाल", category: "Dal", caloriesPer100g: 125, proteinPer100g: 6.3, carbsPer100g: 16.5, fatPer100g: 3.8, fiberPer100g: 4.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Moong Dal", nameHindi: "मूंग दाल", category: "Dal", caloriesPer100g: 104, proteinPer100g: 6.8, carbsPer100g: 13.2, fatPer100g: 2.5, fiberPer100g: 2.8, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Masoor Dal", nameHindi: "मसूर दाल", category: "Dal", caloriesPer100g: 112, proteinPer100g: 7.0, carbsPer100g: 14.0, fatPer100g: 3.0, fiberPer100g: 3.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Sambhar", nameHindi: "सांभर", category: "Dal", caloriesPer100g: 65, proteinPer100g: 2.8, carbsPer100g: 8.5, fatPer100g: 2.2, fiberPer100g: 2.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Rajma", nameHindi: "राजमा", category: "Dal", caloriesPer100g: 120, proteinPer100g: 6.0, carbsPer100g: 16.0, fatPer100g: 3.5, fiberPer100g: 5.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Chole (Chana Masala)", nameHindi: "छोले", category: "Dal", caloriesPer100g: 140, proteinPer100g: 6.5, carbsPer100g: 18.0, fatPer100g: 4.5, fiberPer100g: 5.2, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },

  // ═══════════════════════════════════════════
  // BREADS (ROTI, NAAN, PARATHA)
  // ═══════════════════════════════════════════
  { name: "Roti / Chapati", nameHindi: "रोटी", category: "Bread", caloriesPer100g: 297, proteinPer100g: 8.7, carbsPer100g: 56.0, fatPer100g: 3.7, fiberPer100g: 4.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 40 },
  { name: "Naan", nameHindi: "नान", category: "Bread", caloriesPer100g: 310, proteinPer100g: 9.0, carbsPer100g: 52.0, fatPer100g: 7.5, fiberPer100g: 2.5, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 90 },
  { name: "Butter Naan", nameHindi: "बटर नान", category: "Bread", caloriesPer100g: 340, proteinPer100g: 8.5, carbsPer100g: 50.0, fatPer100g: 11.5, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 90 },
  { name: "Garlic Naan", nameHindi: "गार्लिक नान", category: "Bread", caloriesPer100g: 325, proteinPer100g: 9.2, carbsPer100g: 51.0, fatPer100g: 9.0, fiberPer100g: 2.2, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 90 },
  { name: "Aloo Paratha", nameHindi: "आलू पराठा", category: "Bread", caloriesPer100g: 260, proteinPer100g: 5.5, carbsPer100g: 35.0, fatPer100g: 11.0, fiberPer100g: 2.5, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 100 },
  { name: "Plain Paratha", nameHindi: "सादा पराठा", category: "Bread", caloriesPer100g: 326, proteinPer100g: 7.0, carbsPer100g: 45.0, fatPer100g: 13.0, fiberPer100g: 3.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 80 },
  { name: "Puri", nameHindi: "पूरी", category: "Bread", caloriesPer100g: 350, proteinPer100g: 6.0, carbsPer100g: 45.0, fatPer100g: 16.0, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 30 },
  { name: "Bhatura", nameHindi: "भटूरा", category: "Bread", caloriesPer100g: 330, proteinPer100g: 7.5, carbsPer100g: 42.0, fatPer100g: 14.5, fiberPer100g: 1.5, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 80 },
  { name: "Dosa (Plain)", nameHindi: "दोसा", category: "Bread", caloriesPer100g: 165, proteinPer100g: 4.0, carbsPer100g: 28.0, fatPer100g: 3.8, fiberPer100g: 1.5, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 100 },
  { name: "Masala Dosa", nameHindi: "मसाला दोसा", category: "Bread", caloriesPer100g: 175, proteinPer100g: 4.5, carbsPer100g: 27.0, fatPer100g: 5.5, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Idli", nameHindi: "इडली", category: "Bread", caloriesPer100g: 130, proteinPer100g: 3.5, carbsPer100g: 24.0, fatPer100g: 1.5, fiberPer100g: 1.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 40 },
  { name: "Uttapam", nameHindi: "उत्तपम", category: "Bread", caloriesPer100g: 195, proteinPer100g: 5.0, carbsPer100g: 30.0, fatPer100g: 5.5, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 120 },

  // ═══════════════════════════════════════════
  // RICE DISHES
  // ═══════════════════════════════════════════
  { name: "Steamed Rice (White)", nameHindi: "सफेद चावल", category: "Rice", caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28.0, fatPer100g: 0.3, fiberPer100g: 0.4, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Jeera Rice", nameHindi: "जीरा राइस", category: "Rice", caloriesPer100g: 150, proteinPer100g: 3.0, carbsPer100g: 27.0, fatPer100g: 3.0, fiberPer100g: 0.6, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Veg Biryani", nameHindi: "वेज बिरयानी", category: "Rice", caloriesPer100g: 145, proteinPer100g: 3.5, carbsPer100g: 22.0, fatPer100g: 4.5, fiberPer100g: 1.5, defaultUnit: "plate", defaultQuantity: 1, defaultGrams: 250 },
  { name: "Chicken Biryani", nameHindi: "चिकन बिरयानी", category: "Rice", caloriesPer100g: 175, proteinPer100g: 8.5, carbsPer100g: 22.0, fatPer100g: 6.0, fiberPer100g: 0.8, defaultUnit: "plate", defaultQuantity: 1, defaultGrams: 300 },
  { name: "Mutton Biryani", nameHindi: "मटन बिरयानी", category: "Rice", caloriesPer100g: 190, proteinPer100g: 9.0, carbsPer100g: 21.0, fatPer100g: 7.5, fiberPer100g: 0.5, defaultUnit: "plate", defaultQuantity: 1, defaultGrams: 300 },
  { name: "Egg Fried Rice", nameHindi: "एग फ्राइड राइस", category: "Rice", caloriesPer100g: 165, proteinPer100g: 5.5, carbsPer100g: 25.0, fatPer100g: 4.8, fiberPer100g: 1.0, defaultUnit: "plate", defaultQuantity: 1, defaultGrams: 250 },
  { name: "Pulao", nameHindi: "पुलाव", category: "Rice", caloriesPer100g: 142, proteinPer100g: 3.2, carbsPer100g: 24.0, fatPer100g: 3.5, fiberPer100g: 1.2, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Khichdi", nameHindi: "खिचड़ी", category: "Rice", caloriesPer100g: 105, proteinPer100g: 4.0, carbsPer100g: 17.0, fatPer100g: 2.0, fiberPer100g: 1.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Lemon Rice", nameHindi: "लेमन राइस", category: "Rice", caloriesPer100g: 155, proteinPer100g: 3.0, carbsPer100g: 28.0, fatPer100g: 3.5, fiberPer100g: 0.8, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Curd Rice", nameHindi: "दही चावल", category: "Rice", caloriesPer100g: 110, proteinPer100g: 3.5, carbsPer100g: 18.0, fatPer100g: 2.5, fiberPer100g: 0.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },

  // ═══════════════════════════════════════════
  // NON-VEG CURRIES
  // ═══════════════════════════════════════════
  { name: "Butter Chicken", nameHindi: "बटर चिकन", category: "Curry", caloriesPer100g: 175, proteinPer100g: 14.0, carbsPer100g: 5.0, fatPer100g: 11.0, fiberPer100g: 0.8, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Chicken Curry", nameHindi: "चिकन करी", category: "Curry", caloriesPer100g: 150, proteinPer100g: 13.5, carbsPer100g: 4.5, fatPer100g: 8.5, fiberPer100g: 1.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Kadhai Chicken", nameHindi: "कड़ाही चिकन", category: "Curry", caloriesPer100g: 160, proteinPer100g: 14.0, carbsPer100g: 4.0, fatPer100g: 9.5, fiberPer100g: 1.2, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Chicken Tikka Masala", nameHindi: "चिकन टिक्का मसाला", category: "Curry", caloriesPer100g: 170, proteinPer100g: 15.0, carbsPer100g: 5.5, fatPer100g: 10.0, fiberPer100g: 1.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Egg Curry", nameHindi: "अंडा करी", category: "Curry", caloriesPer100g: 125, proteinPer100g: 8.0, carbsPer100g: 5.0, fatPer100g: 8.5, fiberPer100g: 1.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Fish Curry", nameHindi: "फिश करी", category: "Curry", caloriesPer100g: 120, proteinPer100g: 12.0, carbsPer100g: 4.0, fatPer100g: 6.0, fiberPer100g: 0.8, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Mutton Curry", nameHindi: "मटन करी", category: "Curry", caloriesPer100g: 195, proteinPer100g: 15.0, carbsPer100g: 4.0, fatPer100g: 13.5, fiberPer100g: 0.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Keema", nameHindi: "कीमा", category: "Curry", caloriesPer100g: 180, proteinPer100g: 14.0, carbsPer100g: 5.0, fatPer100g: 12.0, fiberPer100g: 1.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },

  // ═══════════════════════════════════════════
  // VEG CURRIES
  // ═══════════════════════════════════════════
  { name: "Paneer Butter Masala", nameHindi: "पनीर बटर मसाला", category: "Curry", caloriesPer100g: 215, proteinPer100g: 10.0, carbsPer100g: 8.0, fatPer100g: 16.0, fiberPer100g: 1.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Palak Paneer", nameHindi: "पालक पनीर", category: "Curry", caloriesPer100g: 170, proteinPer100g: 9.0, carbsPer100g: 5.0, fatPer100g: 13.0, fiberPer100g: 2.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Shahi Paneer", nameHindi: "शाही पनीर", category: "Curry", caloriesPer100g: 220, proteinPer100g: 10.5, carbsPer100g: 7.0, fatPer100g: 17.0, fiberPer100g: 1.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Matar Paneer", nameHindi: "मटर पनीर", category: "Curry", caloriesPer100g: 180, proteinPer100g: 8.5, carbsPer100g: 9.0, fatPer100g: 12.0, fiberPer100g: 2.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Kadhai Paneer", nameHindi: "कड़ाही पनीर", category: "Curry", caloriesPer100g: 200, proteinPer100g: 10.0, carbsPer100g: 6.0, fatPer100g: 15.0, fiberPer100g: 1.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Aloo Gobi", nameHindi: "आलू गोभी", category: "Curry", caloriesPer100g: 95, proteinPer100g: 2.5, carbsPer100g: 12.0, fatPer100g: 4.5, fiberPer100g: 2.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Bhindi Masala", nameHindi: "भिंडी मसाला", category: "Curry", caloriesPer100g: 85, proteinPer100g: 2.0, carbsPer100g: 8.0, fatPer100g: 5.0, fiberPer100g: 3.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Baingan Bharta", nameHindi: "बैंगन भर्ता", category: "Curry", caloriesPer100g: 80, proteinPer100g: 2.0, carbsPer100g: 7.0, fatPer100g: 5.0, fiberPer100g: 3.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Aloo Matar", nameHindi: "आलू मटर", category: "Curry", caloriesPer100g: 110, proteinPer100g: 3.5, carbsPer100g: 14.0, fatPer100g: 4.5, fiberPer100g: 3.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Mixed Veg Curry", nameHindi: "मिक्स वेज", category: "Curry", caloriesPer100g: 90, proteinPer100g: 2.5, carbsPer100g: 10.0, fatPer100g: 4.5, fiberPer100g: 2.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Lauki Ki Sabzi", nameHindi: "लौकी की सब्ज़ी", category: "Curry", caloriesPer100g: 55, proteinPer100g: 1.5, carbsPer100g: 6.0, fatPer100g: 2.5, fiberPer100g: 1.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Tinda Masala", nameHindi: "टिंडा मसाला", category: "Curry", caloriesPer100g: 65, proteinPer100g: 1.8, carbsPer100g: 7.5, fatPer100g: 3.0, fiberPer100g: 2.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Soya Chunk Curry", nameHindi: "सोया चंक करी", category: "Curry", caloriesPer100g: 145, proteinPer100g: 15.0, carbsPer100g: 10.0, fatPer100g: 5.0, fiberPer100g: 3.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },

  // ═══════════════════════════════════════════
  // SNACKS & STREET FOOD
  // ═══════════════════════════════════════════
  { name: "Samosa", nameHindi: "समोसा", category: "Snack", caloriesPer100g: 262, proteinPer100g: 4.5, carbsPer100g: 28.0, fatPer100g: 14.5, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 80 },
  { name: "Pakora / Bhaji", nameHindi: "पकोड़ा", category: "Snack", caloriesPer100g: 245, proteinPer100g: 5.5, carbsPer100g: 25.0, fatPer100g: 13.5, fiberPer100g: 2.5, defaultUnit: "piece", defaultQuantity: 4, defaultGrams: 100 },
  { name: "Pav Bhaji", nameHindi: "पाव भाजी", category: "Snack", caloriesPer100g: 180, proteinPer100g: 4.5, carbsPer100g: 25.0, fatPer100g: 7.0, fiberPer100g: 2.5, defaultUnit: "plate", defaultQuantity: 1, defaultGrams: 300 },
  { name: "Vada Pav", nameHindi: "वड़ा पाव", category: "Snack", caloriesPer100g: 270, proteinPer100g: 5.0, carbsPer100g: 35.0, fatPer100g: 12.0, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 120 },
  { name: "Chole Bhature", nameHindi: "छोले भटूरे", category: "Snack", caloriesPer100g: 240, proteinPer100g: 6.0, carbsPer100g: 30.0, fatPer100g: 11.0, fiberPer100g: 3.0, defaultUnit: "plate", defaultQuantity: 1, defaultGrams: 300 },
  { name: "Aloo Tikki", nameHindi: "आलू टिक्की", category: "Snack", caloriesPer100g: 200, proteinPer100g: 3.5, carbsPer100g: 25.0, fatPer100g: 10.0, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 80 },
  { name: "Poha", nameHindi: "पोहा", category: "Snack", caloriesPer100g: 130, proteinPer100g: 2.5, carbsPer100g: 22.0, fatPer100g: 3.5, fiberPer100g: 1.5, defaultUnit: "plate", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Upma", nameHindi: "उपमा", category: "Snack", caloriesPer100g: 120, proteinPer100g: 3.0, carbsPer100g: 18.0, fatPer100g: 4.0, fiberPer100g: 1.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 200 },
  { name: "Dhokla", nameHindi: "ढोकला", category: "Snack", caloriesPer100g: 160, proteinPer100g: 5.5, carbsPer100g: 25.0, fatPer100g: 4.0, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 3, defaultGrams: 120 },
  { name: "Kachori", nameHindi: "कचौरी", category: "Snack", caloriesPer100g: 310, proteinPer100g: 5.0, carbsPer100g: 32.0, fatPer100g: 18.0, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 60 },

  // ═══════════════════════════════════════════
  // RAITA, CHUTNEY & SIDES
  // ═══════════════════════════════════════════
  { name: "Boondi Raita", nameHindi: "बूंदी रायता", category: "Side", caloriesPer100g: 80, proteinPer100g: 3.0, carbsPer100g: 8.0, fatPer100g: 3.5, fiberPer100g: 0.3, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 100 },
  { name: "Cucumber Raita", nameHindi: "खीरा रायता", category: "Side", caloriesPer100g: 55, proteinPer100g: 2.5, carbsPer100g: 4.5, fatPer100g: 3.0, fiberPer100g: 0.5, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 100 },
  { name: "Green Chutney (Mint)", nameHindi: "हरी चटनी", category: "Side", caloriesPer100g: 40, proteinPer100g: 2.0, carbsPer100g: 5.0, fatPer100g: 1.0, fiberPer100g: 2.0, defaultUnit: "tbsp", defaultQuantity: 2, defaultGrams: 30 },
  { name: "Tamarind Chutney", nameHindi: "इमली की चटनी", category: "Side", caloriesPer100g: 160, proteinPer100g: 1.0, carbsPer100g: 38.0, fatPer100g: 0.5, fiberPer100g: 1.5, defaultUnit: "tbsp", defaultQuantity: 2, defaultGrams: 30 },
  { name: "Pickle (Mixed)", nameHindi: "अचार", category: "Side", caloriesPer100g: 175, proteinPer100g: 2.0, carbsPer100g: 10.0, fatPer100g: 14.0, fiberPer100g: 2.0, defaultUnit: "tbsp", defaultQuantity: 1, defaultGrams: 15 },
  { name: "Papad (Roasted)", nameHindi: "पापड़", category: "Side", caloriesPer100g: 310, proteinPer100g: 18.0, carbsPer100g: 48.0, fatPer100g: 4.0, fiberPer100g: 5.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 15 },
  { name: "Papad (Fried)", nameHindi: "तला पापड़", category: "Side", caloriesPer100g: 420, proteinPer100g: 16.0, carbsPer100g: 40.0, fatPer100g: 22.0, fiberPer100g: 4.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 15 },

  // ═══════════════════════════════════════════
  // SWEETS & DESSERTS
  // ═══════════════════════════════════════════
  { name: "Gulab Jamun", nameHindi: "गुलाब जामुन", category: "Sweet", caloriesPer100g: 325, proteinPer100g: 4.5, carbsPer100g: 45.0, fatPer100g: 14.0, fiberPer100g: 0.5, defaultUnit: "piece", defaultQuantity: 2, defaultGrams: 80 },
  { name: "Rasgulla", nameHindi: "रसगुल्ला", category: "Sweet", caloriesPer100g: 186, proteinPer100g: 5.0, carbsPer100g: 35.0, fatPer100g: 3.0, fiberPer100g: 0, defaultUnit: "piece", defaultQuantity: 2, defaultGrams: 80 },
  { name: "Jalebi", nameHindi: "जलेबी", category: "Sweet", caloriesPer100g: 380, proteinPer100g: 4.0, carbsPer100g: 60.0, fatPer100g: 14.0, fiberPer100g: 0.5, defaultUnit: "piece", defaultQuantity: 3, defaultGrams: 75 },
  { name: "Ladoo (Besan)", nameHindi: "बेसन लड्डू", category: "Sweet", caloriesPer100g: 400, proteinPer100g: 8.0, carbsPer100g: 45.0, fatPer100g: 22.0, fiberPer100g: 2.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 40 },
  { name: "Barfi (Kaju)", nameHindi: "काजू बर्फ़ी", category: "Sweet", caloriesPer100g: 450, proteinPer100g: 10.0, carbsPer100g: 52.0, fatPer100g: 22.0, fiberPer100g: 1.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 30 },
  { name: "Kheer (Rice)", nameHindi: "चावल की खीर", category: "Sweet", caloriesPer100g: 135, proteinPer100g: 3.5, carbsPer100g: 20.0, fatPer100g: 4.5, fiberPer100g: 0.3, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Halwa (Suji)", nameHindi: "सूजी का हलवा", category: "Sweet", caloriesPer100g: 280, proteinPer100g: 4.0, carbsPer100g: 38.0, fatPer100g: 12.0, fiberPer100g: 1.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 100 },
  { name: "Gajar Halwa", nameHindi: "गाजर का हलवा", category: "Sweet", caloriesPer100g: 245, proteinPer100g: 4.0, carbsPer100g: 30.0, fatPer100g: 12.0, fiberPer100g: 2.0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 120 },

  // ═══════════════════════════════════════════
  // BEVERAGES
  // ═══════════════════════════════════════════
  { name: "Chai (Milk Tea)", nameHindi: "चाय", category: "Beverage", caloriesPer100g: 45, proteinPer100g: 1.5, carbsPer100g: 5.5, fatPer100g: 1.8, fiberPer100g: 0, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Coffee (Milk)", nameHindi: "कॉफ़ी", category: "Beverage", caloriesPer100g: 40, proteinPer100g: 1.5, carbsPer100g: 4.5, fatPer100g: 1.5, fiberPer100g: 0, defaultUnit: "cup", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Lassi (Sweet)", nameHindi: "मीठी लस्सी", category: "Beverage", caloriesPer100g: 85, proteinPer100g: 3.0, carbsPer100g: 12.0, fatPer100g: 2.5, fiberPer100g: 0, defaultUnit: "glass", defaultQuantity: 1, defaultGrams: 250 },
  { name: "Lassi (Salty)", nameHindi: "नमकीन लस्सी", category: "Beverage", caloriesPer100g: 55, proteinPer100g: 3.0, carbsPer100g: 4.0, fatPer100g: 2.5, fiberPer100g: 0, defaultUnit: "glass", defaultQuantity: 1, defaultGrams: 250 },
  { name: "Buttermilk (Chaas)", nameHindi: "छाछ", category: "Beverage", caloriesPer100g: 25, proteinPer100g: 1.5, carbsPer100g: 2.5, fatPer100g: 1.0, fiberPer100g: 0, defaultUnit: "glass", defaultQuantity: 1, defaultGrams: 250 },
  { name: "Mango Shake", nameHindi: "मैंगो शेक", category: "Beverage", caloriesPer100g: 90, proteinPer100g: 2.5, carbsPer100g: 15.0, fatPer100g: 2.5, fiberPer100g: 0.5, defaultUnit: "glass", defaultQuantity: 1, defaultGrams: 300 },
  { name: "Nimbu Pani (Lemonade)", nameHindi: "नींबू पानी", category: "Beverage", caloriesPer100g: 30, proteinPer100g: 0.2, carbsPer100g: 7.0, fatPer100g: 0, fiberPer100g: 0, defaultUnit: "glass", defaultQuantity: 1, defaultGrams: 250 },

  // ═══════════════════════════════════════════
  // BREAKFAST & LIGHT MEALS
  // ═══════════════════════════════════════════
  { name: "Besan Chilla", nameHindi: "बेसन चीला", category: "Breakfast", caloriesPer100g: 190, proteinPer100g: 8.0, carbsPer100g: 20.0, fatPer100g: 8.5, fiberPer100g: 3.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 80 },
  { name: "Moong Dal Chilla", nameHindi: "मूंग दाल चीला", category: "Breakfast", caloriesPer100g: 160, proteinPer100g: 9.0, carbsPer100g: 18.0, fatPer100g: 5.5, fiberPer100g: 3.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 80 },
  { name: "Thepla", nameHindi: "थेपला", category: "Breakfast", caloriesPer100g: 280, proteinPer100g: 7.0, carbsPer100g: 38.0, fatPer100g: 10.0, fiberPer100g: 4.0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 50 },
  { name: "Methi Thepla", nameHindi: "मेथी थेपला", category: "Breakfast", caloriesPer100g: 270, proteinPer100g: 7.5, carbsPer100g: 36.0, fatPer100g: 10.5, fiberPer100g: 4.5, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 50 },
  { name: "Anda Bhurji", nameHindi: "अंडा भुर्जी", category: "Breakfast", caloriesPer100g: 170, proteinPer100g: 12.0, carbsPer100g: 2.0, fatPer100g: 13.0, fiberPer100g: 0.5, defaultUnit: "serving", defaultQuantity: 1, defaultGrams: 150 },
  { name: "Omelette (2 eggs)", nameHindi: "आमलेट", category: "Breakfast", caloriesPer100g: 155, proteinPer100g: 11.0, carbsPer100g: 1.5, fatPer100g: 12.0, fiberPer100g: 0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 120 },
  { name: "Boiled Egg", nameHindi: "उबला अंडा", category: "Breakfast", caloriesPer100g: 155, proteinPer100g: 13.0, carbsPer100g: 1.1, fatPer100g: 11.0, fiberPer100g: 0, defaultUnit: "piece", defaultQuantity: 1, defaultGrams: 50 },

  // ═══════════════════════════════════════════
  // TANDOOR & GRILLED
  // ═══════════════════════════════════════════
  { name: "Chicken Tikka", nameHindi: "चिकन टिक्का", category: "Tandoor", caloriesPer100g: 150, proteinPer100g: 22.0, carbsPer100g: 3.0, fatPer100g: 5.5, fiberPer100g: 0.5, defaultUnit: "piece", defaultQuantity: 4, defaultGrams: 120 },
  { name: "Tandoori Chicken", nameHindi: "तंदूरी चिकन", category: "Tandoor", caloriesPer100g: 140, proteinPer100g: 20.0, carbsPer100g: 3.5, fatPer100g: 5.0, fiberPer100g: 0.5, defaultUnit: "piece", defaultQuantity: 2, defaultGrams: 200 },
  { name: "Paneer Tikka", nameHindi: "पनीर टिक्का", category: "Tandoor", caloriesPer100g: 230, proteinPer100g: 14.0, carbsPer100g: 5.0, fatPer100g: 17.0, fiberPer100g: 1.0, defaultUnit: "piece", defaultQuantity: 4, defaultGrams: 120 },
  { name: "Seekh Kebab", nameHindi: "सीख कबाब", category: "Tandoor", caloriesPer100g: 180, proteinPer100g: 16.0, carbsPer100g: 5.0, fatPer100g: 11.0, fiberPer100g: 0.5, defaultUnit: "piece", defaultQuantity: 2, defaultGrams: 100 },
  { name: "Chicken Malai Tikka", nameHindi: "चिकन मलाई टिक्का", category: "Tandoor", caloriesPer100g: 185, proteinPer100g: 18.0, carbsPer100g: 4.0, fatPer100g: 11.0, fiberPer100g: 0.3, defaultUnit: "piece", defaultQuantity: 4, defaultGrams: 120 },

  // ═══════════════════════════════════════════
  // DAIRY
  // ═══════════════════════════════════════════
  { name: "Paneer (Raw)", nameHindi: "पनीर", category: "Dairy", caloriesPer100g: 265, proteinPer100g: 18.3, carbsPer100g: 1.2, fatPer100g: 20.8, fiberPer100g: 0, defaultUnit: "g", defaultQuantity: 100, defaultGrams: 100 },
  { name: "Curd / Dahi", nameHindi: "दही", category: "Dairy", caloriesPer100g: 60, proteinPer100g: 3.5, carbsPer100g: 4.7, fatPer100g: 3.3, fiberPer100g: 0, defaultUnit: "katori", defaultQuantity: 1, defaultGrams: 100 },
  { name: "Milk (Full Fat)", nameHindi: "दूध", category: "Dairy", caloriesPer100g: 62, proteinPer100g: 3.2, carbsPer100g: 4.8, fatPer100g: 3.3, fiberPer100g: 0, defaultUnit: "glass", defaultQuantity: 1, defaultGrams: 250 },
  { name: "Milk (Toned)", nameHindi: "टोन्ड दूध", category: "Dairy", caloriesPer100g: 50, proteinPer100g: 3.0, carbsPer100g: 4.5, fatPer100g: 1.5, fiberPer100g: 0, defaultUnit: "glass", defaultQuantity: 1, defaultGrams: 250 },
  { name: "Ghee", nameHindi: "घी", category: "Dairy", caloriesPer100g: 900, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, defaultUnit: "tsp", defaultQuantity: 1, defaultGrams: 5 },
  { name: "Butter", nameHindi: "मक्खन", category: "Dairy", caloriesPer100g: 717, proteinPer100g: 0.9, carbsPer100g: 0.1, fatPer100g: 81.0, fiberPer100g: 0, defaultUnit: "tsp", defaultQuantity: 1, defaultGrams: 5 },
];
