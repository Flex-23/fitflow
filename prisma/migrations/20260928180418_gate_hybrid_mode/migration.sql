-- AlterTable
ALTER TABLE "GateLog" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'bridge';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "gateSyncedAt" TIMESTAMP(3);
