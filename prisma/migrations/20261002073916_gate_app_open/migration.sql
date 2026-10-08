-- CreateTable
CREATE TABLE "GateCommand" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "GateCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateCommand_status_idx" ON "GateCommand"("status");

-- CreateIndex
CREATE INDEX "GateCommand_memberId_createdAt_idx" ON "GateCommand"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "GateCommand" ADD CONSTRAINT "GateCommand_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
