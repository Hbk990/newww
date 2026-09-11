ALTER TABLE "inventory_ledger" DROP CONSTRAINT "inventory_ledger_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_variant_id_variants_id_fk";
