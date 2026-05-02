/*
  Warnings:

  - The `paused_at` column on the `watch_history` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "watch_history" ADD COLUMN     "watched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "paused_at",
ADD COLUMN     "paused_at" INTEGER NOT NULL DEFAULT 0;
