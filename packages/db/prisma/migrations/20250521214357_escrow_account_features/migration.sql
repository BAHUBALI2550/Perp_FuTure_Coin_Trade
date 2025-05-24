/*
  Warnings:

  - Added the required column `escrowAccount` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `onchainPositionId` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vaultTokenAccount` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `escrowAccount` to the `UserClosed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `onchainPositionId` to the `UserClosed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vaultTokenAccount` to the `UserClosed` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "escrowAccount" TEXT NOT NULL,
ADD COLUMN     "onchainPositionId" TEXT NOT NULL,
ADD COLUMN     "vaultTokenAccount" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserClosed" ADD COLUMN     "escrowAccount" TEXT NOT NULL,
ADD COLUMN     "onchainPositionId" TEXT NOT NULL,
ADD COLUMN     "vaultTokenAccount" TEXT NOT NULL;
