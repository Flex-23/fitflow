-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_portalToken_key" ON "Member"("portalToken");

