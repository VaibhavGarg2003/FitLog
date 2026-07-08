-- CreateEnum
CREATE TYPE "DietaryType" AS ENUM ('VEG', 'NON_VEG', 'VEGAN', 'EGGETARIAN');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "dietary_type" "DietaryType";
