-- CreateTable
CREATE TABLE `PartNeeded` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `partsSupplierId` INTEGER NULL,
    `estimatedCostCfa` DECIMAL(18, 4) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` INTEGER NULL,
    `repairPartId` INTEGER NULL,

    UNIQUE INDEX `PartNeeded_repairPartId_key`(`repairPartId`),
    INDEX `PartNeeded_carId_idx`(`carId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PartNeeded` ADD CONSTRAINT `PartNeeded_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartNeeded` ADD CONSTRAINT `PartNeeded_partsSupplierId_fkey` FOREIGN KEY (`partsSupplierId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartNeeded` ADD CONSTRAINT `PartNeeded_repairPartId_fkey` FOREIGN KEY (`repairPartId`) REFERENCES `RepairPart`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

