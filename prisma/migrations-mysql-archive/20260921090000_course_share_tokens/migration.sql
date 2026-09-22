-- AlterTable
ALTER TABLE `NutritionCourse` ADD COLUMN `shareToken` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TrainingCourse` ADD COLUMN `shareToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `NutritionCourse_shareToken_key` ON `NutritionCourse`(`shareToken`);

-- CreateIndex
CREATE UNIQUE INDEX `TrainingCourse_shareToken_key` ON `TrainingCourse`(`shareToken`);