ALTER TYPE "public"."product_status" ADD VALUE 'discontinued' BEFORE 'archived';--> statement-breakpoint
ALTER TYPE "public"."relation_kind" ADD VALUE 'alternative';--> statement-breakpoint
CREATE TABLE "device_group_models" (
	"device_group_id" uuid NOT NULL,
	"device_model_id" uuid NOT NULL,
	CONSTRAINT "device_group_models_device_group_id_device_model_id_pk" PRIMARY KEY("device_group_id","device_model_id")
);
--> statement-breakpoint
CREATE TABLE "device_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "device_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "attribute_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribute_id" uuid NOT NULL,
	"value" text NOT NULL,
	"color_hex" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attribute_options_value_key" UNIQUE("attribute_id","value")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_cents" integer,
	"new_cents" integer,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory" ALTER COLUMN "track" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "store_settings" ALTER COLUMN "tax_rate_bps" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "store_settings" ALTER COLUMN "prices_include_tax" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "internal_note" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_allowed_price_cents" integer;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "sale_price_cents" integer;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "sale_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "device_group_models" ADD CONSTRAINT "device_group_models_device_group_id_device_groups_id_fk" FOREIGN KEY ("device_group_id") REFERENCES "public"."device_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_group_models" ADD CONSTRAINT "device_group_models_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_attribute_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_group_models_model_idx" ON "device_group_models" USING btree ("device_model_id");--> statement-breakpoint
CREATE INDEX "attribute_options_ordered_idx" ON "attribute_options" USING btree ("attribute_id","position");--> statement-breakpoint
CREATE INDEX "price_history_variant_idx" ON "price_history" USING btree ("variant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "price_history_recent_idx" ON "price_history" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "products" USING btree ("published_at" DESC NULLS LAST) WHERE "products"."status" = 'active' and "products"."is_featured";--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_sale_price_nonneg" CHECK ("variants"."sale_price_cents" >= 0);--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_sale_window_complete" CHECK (("variants"."sale_price_cents" is null) = ("variants"."sale_starts_at" is null) and ("variants"."sale_starts_at" is null) = ("variants"."sale_ends_at" is null));