/*
  Warnings:

  - Made the column `lastFeeCalculatedTime` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `closeTime` on table `UserClosed` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "lastFeeCalculatedTime" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserClosed" ALTER COLUMN "closeTime" SET NOT NULL;
