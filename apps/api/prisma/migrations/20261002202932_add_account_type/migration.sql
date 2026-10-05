-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('STAFF', 'PILGRIM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'STAFF';
