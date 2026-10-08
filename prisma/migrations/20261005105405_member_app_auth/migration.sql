-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "appBoundAt" TIMESTAMP(3),
ADD COLUMN     "appDeviceId" TEXT,
ADD COLUMN     "appOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "appOtpHash" TEXT,
ADD COLUMN     "appSessionEpoch" INTEGER NOT NULL DEFAULT 0;
