CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'disabled');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"user_id" uuid,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "reauthenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "timezone" text DEFAULT 'Asia/Beirut' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "order_number_prefix" text DEFAULT 'DR' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "free_delivery_threshold_cents" integer;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "default_low_stock_threshold" integer;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "maintenance_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "maintenance_message" text;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotency_keys_scope_idx" ON "idempotency_keys" USING btree ("scope","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");