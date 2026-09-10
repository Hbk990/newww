-- AlterTable
ALTER TABLE `LedgerEntry` MODIFY `kind` ENUM('OPENING_BALANCE', 'CAR_PURCHASE', 'ORIGIN_EXPENSE', 'TAX_CHARGE', 'TAX_REFUND_CREDIT', 'FREIGHT_INVOICE', 'LABOUR_CHARGE', 'PARTS_CHARGE', 'SALARY_CHARGE', 'SALE_CHARGE', 'SALE_PAYMENT', 'ORIGIN_SALE_PROCEEDS', 'DEPOSIT', 'SALE_RECEIPT', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'WIRE_OUT', 'PAYMENT', 'FEE', 'REVERSAL', 'ADJUSTMENT') NOT NULL;

-- AlterTable
ALTER TABLE `Shipment` ADD COLUMN `estimatedFreightUsd` DECIMAL(18, 4) NULL;

-- AlterTable
ALTER TABLE `Transaction` MODIFY `type` ENUM('DEPOSIT', 'WITHDRAWAL', 'WIRE_TO_SUPPLIER', 'PAY_SHIPPING', 'PAY_WORKER', 'PAY_PARTS_SUPPLIER', 'PAY_OVERHEAD', 'SALE_RECEIPT', 'ACCOUNT_TRANSFER', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND') NOT NULL;

-- CreateTable
CREATE TABLE `CarPhoto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `kind` ENUM('PURCHASE', 'ARRIVAL', 'REPAIR', 'SHOWROOM') NOT NULL DEFAULT 'SHOWROOM',
    `caption` TEXT NULL,
    `bytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` INTEGER NULL,

    INDEX `CarPhoto_carId_idx`(`carId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reservation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerMobile` VARCHAR(191) NULL,
    `depositCfa` DECIMAL(18, 4) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `status` ENUM('ACTIVE', 'CONVERTED', 'REFUNDED', 'FORFEITED') NOT NULL DEFAULT 'ACTIVE',
    `destinationAccountId` INTEGER NULL,
    `ledgerEntryId` INTEGER NULL,
    `closedAt` DATETIME(3) NULL,
    `closedReason` TEXT NULL,
    `refundEntryId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` INTEGER NULL,

    UNIQUE INDEX `Reservation_ledgerEntryId_key`(`ledgerEntryId`),
    UNIQUE INDEX `Reservation_refundEntryId_key`(`refundEntryId`),
    INDEX `Reservation_carId_idx`(`carId`),
    INDEX `Reservation_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CarPhoto` ADD CONSTRAINT `CarPhoto_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_destinationAccountId_fkey` FOREIGN KEY (`destinationAccountId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

