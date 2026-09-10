-- AlterTable
ALTER TABLE `Car` ADD COLUMN `needsBlacksmith` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `needsMechanic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `needsPainter` BOOLEAN NOT NULL DEFAULT false;

