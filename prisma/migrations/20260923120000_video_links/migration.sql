-- CreateEnum
CREATE TYPE "VideoSource" AS ENUM ('UPLOAD', 'LINK');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "source" "VideoSource" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "url" TEXT,
ALTER COLUMN "storedFilename" DROP NOT NULL,
ALTER COLUMN "mimeType" DROP NOT NULL;

