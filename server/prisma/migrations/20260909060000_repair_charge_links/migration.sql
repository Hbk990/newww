-- Additive only. Legacy repairs are reconciled on deletion only when unambiguous.
ALTER TABLE `RepairJob` ADD COLUMN `ledgerEntryId` INTEGER NULL;
ALTER TABLE `RepairPart` ADD COLUMN `ledgerEntryId` INTEGER NULL;
CREATE UNIQUE INDEX `RepairJob_ledgerEntryId_key` ON `RepairJob`(`ledgerEntryId`);
CREATE UNIQUE INDEX `RepairPart_ledgerEntryId_key` ON `RepairPart`(`ledgerEntryId`);
