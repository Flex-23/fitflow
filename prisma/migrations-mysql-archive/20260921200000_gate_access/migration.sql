-- AlterTable
ALTER TABLE `member` ADD COLUMN `cardNumber` VARCHAR(191) NULL,
    ADD COLUMN `cardWiegand` INTEGER NULL;

-- CreateTable
CREATE TABLE `GateLog` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `card` VARCHAR(191) NOT NULL,
    `door` INTEGER NOT NULL,
    `allowed` BOOLEAN NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GateLog_createdAt_idx`(`createdAt`),
    INDEX `GateLog_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Member_cardNumber_key` ON `member`(`cardNumber`);

-- CreateIndex
CREATE INDEX `Member_cardWiegand_idx` ON `member`(`cardWiegand`);

-- AddForeignKey
ALTER TABLE `GateLog` ADD CONSTRAINT `GateLog_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
