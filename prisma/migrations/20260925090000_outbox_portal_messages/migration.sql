-- The outbox carries plain messages as well as course PDFs, so the course
-- columns become optional and the body travels with the row.
ALTER TABLE "WhatsAppOutbox" ALTER COLUMN "courseId" DROP NOT NULL;
ALTER TABLE "WhatsAppOutbox" ALTER COLUMN "shareToken" DROP NOT NULL;
ALTER TABLE "WhatsAppOutbox" ADD COLUMN "text" TEXT;
