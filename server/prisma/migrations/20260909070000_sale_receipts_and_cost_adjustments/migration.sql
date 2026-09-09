-- AlterTable
ALTER TABLE `LedgerEntry` MODIFY `kind` ENUM('OPENING_BALANCE', 'CAR_PURCHASE', 'ORIGIN_EXPENSE', 'TAX_CHARGE', 'TAX_REFUND_CREDIT', 'FREIGHT_INVOICE', 'LABOUR_CHARGE', 'PARTS_CHARGE', 'SALARY_CHARGE', 'SALE_CHARGE', 'SALE_PAYMENT', 'ORIGIN_SALE_PROCEEDS', 'DEPOSIT', 'SALE_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT', 'WIRE_OUT', 'PAYMENT', 'FEE', 'REVERSAL', 'ADJUSTMENT') NOT NULL;

-- AlterTable
ALTER TABLE `SalePayment` ADD COLUMN `destinationAccountId` INTEGER NULL,
    ADD COLUMN `ledgerEntryId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Transaction` MODIFY `type` ENUM('DEPOSIT', 'WITHDRAWAL', 'WIRE_TO_SUPPLIER', 'PAY_SHIPPING', 'PAY_WORKER', 'PAY_PARTS_SUPPLIER', 'PAY_OVERHEAD', 'SALE_RECEIPT', 'ACCOUNT_TRANSFER') NOT NULL;

-- CreateTable
CREATE TABLE `CostAdjustment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `amountCfa` DECIMAL(18, 4) NOT NULL,
    `reason` TEXT NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `partyId` INTEGER NULL,
    `ledgerEntryId` INTEGER NULL,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CostAdjustment_ledgerEntryId_key`(`ledgerEntryId`),
    INDEX `CostAdjustment_carId_idx`(`carId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `SalePayment_ledgerEntryId_key` ON `SalePayment`(`ledgerEntryId`);

-- CreateIndex
CREATE INDEX `SalePayment_destinationAccountId_idx` ON `SalePayment`(`destinationAccountId`);

-- AddForeignKey
ALTER TABLE `SalePayment` ADD CONSTRAINT `SalePayment_destinationAccountId_fkey` FOREIGN KEY (`destinationAccountId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostAdjustment` ADD CONSTRAINT `CostAdjustment_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostAdjustment` ADD CONSTRAINT `CostAdjustment_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

