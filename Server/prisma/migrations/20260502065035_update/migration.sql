/*
  Warnings:

  - Added the required column `notification_subject` to the `channel_notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `notification_subject` to the `system_notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "channel_notification" ADD COLUMN     "is_read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notification_subject" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "system_notification" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notification_subject" TEXT NOT NULL;
