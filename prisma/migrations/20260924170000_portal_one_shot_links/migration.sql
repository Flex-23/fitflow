-- The member's invitation link becomes single-use and short-lived, and a
-- member's sessions become revocable.
ALTER TABLE "Member" ADD COLUMN "portalTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "portalActivatedAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "portalSessionEpoch" INTEGER NOT NULL DEFAULT 0;

-- Tokens minted under the old rules never expire and can be replayed, so they
-- are cleared rather than carried over.
UPDATE "Member" SET "portalToken" = NULL WHERE "portalToken" IS NOT NULL;

-- Staff can now cut a member's devices off.
ALTER TYPE "ActivityAction" ADD VALUE 'REVOKE_PORTAL_ACCESS';
