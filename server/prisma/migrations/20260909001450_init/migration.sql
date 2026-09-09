-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` TEXT NOT NULL,
    `totpSecret` TEXT NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecoveryCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `codeHash` TEXT NOT NULL,
    `usedAt` DATETIME(3) NULL,

    INDEX `RecoveryCode_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,

    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `before` LONGTEXT NULL,
    `after` LONGTEXT NULL,
    `ip` VARCHAR(191) NULL,

    INDEX `AuditLog_at_idx`(`at`),
    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Party` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('CAR_SUPPLIER', 'SHIPPING_COMPANY', 'TRANSFER_COMPANY', 'WORKER', 'PARTS_SUPPLIER', 'CUSTOMER') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL,
    `country` ENUM('USA', 'CANADA') NULL,
    `wholesaler` ENUM('PRICE_ONLY', 'PRICE_PLUS_TAX') NULL,
    `workerRole` ENUM('GARAGE', 'SHOWROOM') NULL,
    `note` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Party_type_active_idx`(`type`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LedgerEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partyId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `kind` ENUM('OPENING_BALANCE', 'CAR_PURCHASE', 'ORIGIN_EXPENSE', 'TAX_CHARGE', 'TAX_REFUND_CREDIT', 'FREIGHT_INVOICE', 'LABOUR_CHARGE', 'PARTS_CHARGE', 'SALARY_CHARGE', 'SALE_CHARGE', 'SALE_PAYMENT', 'ORIGIN_SALE_PROCEEDS', 'DEPOSIT', 'WIRE_OUT', 'PAYMENT', 'FEE', 'REVERSAL', 'ADJUSTMENT') NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `description` TEXT NOT NULL,
    `carId` INTEGER NULL,
    `shipmentId` INTEGER NULL,
    `saleId` INTEGER NULL,
    `transactionId` INTEGER NULL,
    `reversesId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` INTEGER NULL,

    INDEX `LedgerEntry_partyId_date_idx`(`partyId`, `date`),
    INDEX `LedgerEntry_carId_idx`(`carId`),
    INDEX `LedgerEntry_transactionId_idx`(`transactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarMake` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vpicId` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `CarMake_vpicId_key`(`vpicId`),
    UNIQUE INDEX `CarMake_name_key`(`name`),
    INDEX `CarMake_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarModel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `makeId` INTEGER NOT NULL,
    `vpicId` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,

    INDEX `CarModel_name_idx`(`name`),
    UNIQUE INDEX `CarModel_makeId_name_key`(`makeId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Car` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplierId` INTEGER NOT NULL,
    `makeName` VARCHAR(191) NOT NULL,
    `modelName` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `vin` VARCHAR(191) NOT NULL,
    `purchasePriceUsd` DECIMAL(18, 4) NOT NULL,
    `purchaseDate` DATETIME(3) NOT NULL,
    `taxUsd` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxCapitalizedUsd` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxRefundableUsd` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxRefundMode` ENUM('NONE', 'SUPPLIER_CREDIT', 'SEPARATE_REFUND') NOT NULL DEFAULT 'NONE',
    `taxRefundSettled` BOOLEAN NOT NULL DEFAULT false,
    `taxRefundSettledAt` DATETIME(3) NULL,
    `problemNote` TEXT NULL,
    `arrivalNote` TEXT NULL,
    `status` ENUM('PURCHASED', 'SHIPPED', 'ARRIVED', 'IN_GARAGE', 'SHOWROOM', 'SOLD', 'SOLD_IN_ORIGIN') NOT NULL DEFAULT 'PURCHASED',
    `damaged` BOOLEAN NOT NULL DEFAULT false,
    `driveAndRun` BOOLEAN NOT NULL DEFAULT false,
    `shipmentId` INTEGER NULL,
    `freightShareUsd` DECIMAL(18, 4) NULL,
    `cfaRate` DECIMAL(18, 6) NULL,
    `purchaseCfa` DECIMAL(18, 4) NULL,
    `originExpensesCfa` DECIMAL(18, 4) NULL,
    `taxCapitalizedCfa` DECIMAL(18, 4) NULL,
    `freightCfa` DECIMAL(18, 4) NULL,
    `arrivalCostCfa` DECIMAL(18, 4) NULL,
    `arrivedAt` DATETIME(3) NULL,
    `askingPriceCfa` DECIMAL(18, 4) NULL,
    `showroomAt` DATETIME(3) NULL,
    `photoPath` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Car_vin_key`(`vin`),
    INDEX `Car_status_idx`(`status`),
    INDEX `Car_supplierId_idx`(`supplierId`),
    INDEX `Car_shipmentId_idx`(`shipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OriginExpense` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `amountUsd` DECIMAL(18, 4) NOT NULL,
    `note` TEXT NULL,
    `date` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OriginExpense_carId_idx`(`carId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference` VARCHAR(191) NOT NULL,
    `shippingCompanyId` INTEGER NOT NULL,
    `freightCostUsd` DECIMAL(18, 4) NOT NULL,
    `cfaRate` DECIMAL(18, 6) NULL,
    `departureDate` DATETIME(3) NULL,
    `arrivalDate` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'SHIPPED', 'ARRIVED') NOT NULL DEFAULT 'DRAFT',
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Shipment_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RepairJob` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `serviceType` ENUM('BLACKSMITH', 'PAINTER', 'MECHANIC') NOT NULL,
    `workerId` INTEGER NOT NULL,
    `labourCostCfa` DECIMAL(18, 4) NOT NULL,
    `description` TEXT NULL,
    `date` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RepairJob_carId_idx`(`carId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RepairPart` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `costCfa` DECIMAL(18, 4) NOT NULL,
    `partsSupplierId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RepairPart_carId_idx`(`carId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `channel` ENUM('LOCAL', 'ORIGIN') NOT NULL DEFAULT 'LOCAL',
    `currency` VARCHAR(191) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `saleDate` DATETIME(3) NOT NULL,
    `buyerName` VARCHAR(191) NOT NULL,
    `buyerMobile` VARCHAR(191) NULL,
    `customerId` INTEGER NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Sale_carId_key`(`carId`),
    INDEX `Sale_saleDate_idx`(`saleDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalePayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `saleId` INTEGER NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `method` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalePayment_saleId_idx`(`saleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('DEPOSIT', 'WITHDRAWAL', 'WIRE_TO_SUPPLIER', 'PAY_SHIPPING', 'PAY_WORKER', 'PAY_PARTS_SUPPLIER', 'PAY_OVERHEAD') NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `transferCompanyId` INTEGER NULL,
    `counterpartyId` INTEGER NULL,
    `amountCfa` DECIMAL(18, 4) NULL,
    `amountUsd` DECIMAL(18, 4) NULL,
    `rate` DECIMAL(18, 6) NULL,
    `feeCfa` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` INTEGER NULL,

    INDEX `Transaction_date_idx`(`date`),
    INDEX `Transaction_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OverheadExpense` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `category` ENUM('RENT', 'SALARY', 'UTILITIES', 'TRANSPORT', 'OTHER') NOT NULL,
    `amountCfa` DECIMAL(18, 4) NOT NULL,
    `note` TEXT NULL,
    `partyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OverheadExpense_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RecoveryCode` ADD CONSTRAINT `RecoveryCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `Party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `Transaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarModel` ADD CONSTRAINT `CarModel_makeId_fkey` FOREIGN KEY (`makeId`) REFERENCES `CarMake`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Car` ADD CONSTRAINT `Car_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Car` ADD CONSTRAINT `Car_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OriginExpense` ADD CONSTRAINT `OriginExpense_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_shippingCompanyId_fkey` FOREIGN KEY (`shippingCompanyId`) REFERENCES `Party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RepairJob` ADD CONSTRAINT `RepairJob_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RepairJob` ADD CONSTRAINT `RepairJob_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RepairPart` ADD CONSTRAINT `RepairPart_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RepairPart` ADD CONSTRAINT `RepairPart_partsSupplierId_fkey` FOREIGN KEY (`partsSupplierId`) REFERENCES `Party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalePayment` ADD CONSTRAINT `SalePayment_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_transferCompanyId_fkey` FOREIGN KEY (`transferCompanyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_counterpartyId_fkey` FOREIGN KEY (`counterpartyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OverheadExpense` ADD CONSTRAINT `OverheadExpense_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `Party`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
