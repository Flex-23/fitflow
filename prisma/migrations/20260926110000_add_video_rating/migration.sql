-- CreateTable
CREATE TABLE "VideoRating" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "note" VARCHAR(150),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoRating_videoId_idx" ON "VideoRating"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoRating_videoId_memberId_key" ON "VideoRating"("videoId", "memberId");

-- AddForeignKey
ALTER TABLE "VideoRating" ADD CONSTRAINT "VideoRating_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRating" ADD CONSTRAINT "VideoRating_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
