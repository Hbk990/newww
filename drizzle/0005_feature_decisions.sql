CREATE TYPE "public"."alert_kind" AS ENUM('back_in_stock', 'price_drop');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('web', 'whatsapp', 'admin');--> statement-breakpoint
CREATE TYPE "public"."relation_kind" AS ENUM('cross_sell', 'accessory', 'similar');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."stock_count_status" AS ENUM('open', 'closed');--> statement-breakpoint
ALTER TYPE "public"."discount_kind" ADD VALUE 'buy_x_get_y';--> statement-breakpoint
ALTER TYPE "public"."discount_kind" ADD VALUE 'quantity_break';--> statement-breakpoint
CREATE TABLE "customer_devices" (
	"user_id" uuid NOT NULL,
	"device_model_id" uuid NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_devices_user_id_device_model_id_pk" PRIMARY KEY("user_id","device_model_id")
);
--> statement-breakpoint
CREATE TABLE "recently_viewed" (
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recently_viewed_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "review_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid,
	"order_item_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_order_item_key" UNIQUE("order_item_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "bundle_items" (
	"bundle_product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bundle_items_bundle_product_id_variant_id_pk" PRIMARY KEY("bundle_product_id","variant_id"),
	CONSTRAINT "bundle_items_quantity_positive" CHECK ("bundle_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_relations" (
	"product_id" uuid NOT NULL,
	"related_product_id" uuid NOT NULL,
	"kind" "relation_kind" DEFAULT 'cross_sell' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_relations_product_id_related_product_id_kind_pk" PRIMARY KEY("product_id","related_product_id","kind"),
	CONSTRAINT "product_relations_not_self" CHECK ("product_relations"."product_id" <> "product_relations"."related_product_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notification_channel" DEFAULT 'email' NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"order_id" uuid,
	"user_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"target_price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"stock_count_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"expected_qty" integer NOT NULL,
	"counted_qty" integer NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"counted_by" uuid,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_count_items_stock_count_id_variant_id_pk" PRIMARY KEY("stock_count_id","variant_id"),
	CONSTRAINT "stock_count_items_counted_nonneg" CHECK ("stock_count_items"."counted_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "stock_count_status" DEFAULT 'open' NOT NULL,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"field" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"note" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_number_counters" (
	"day" date PRIMARY KEY NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- HAND-EDITED. drizzle-kit generated a drop-and-recreate of order_status:
-- cast the column to text, DROP TYPE, CREATE TYPE with the new values, cast
-- back. That destroys data. 'pending' is not a value in the new enum, so the
-- cast back fails on any row still holding it — and every existing order holds
-- it, because it was the default. The generated version passes on an empty
-- database and aborts the first time it meets a real order.
--
-- 'pending' -> 'new' is a rename, not a replacement, so say so. Renaming
-- preserves every row, and the four new values are added in lifecycle order so
-- sorting by status follows the physical journey. The index predicate below
-- referencing 'new' is safe in the same transaction because 'new' arrives by
-- rename; Postgres only forbids using values added by ADD VALUE here.
ALTER TYPE "public"."order_status" RENAME VALUE 'pending' TO 'new';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'preparing' AFTER 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'ready' AFTER 'preparing';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'out_for_delivery' AFTER 'ready';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'delivered' AFTER 'out_for_delivery';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'returned' AFTER 'cancelled';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'new';--> statement-breakpoint
DROP INDEX "orders_awaiting_confirmation_idx";--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "building" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "floor" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sales_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "review_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rating_avg" numeric(2, 1);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_bundle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "low_stock_threshold" integer;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" "order_source" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "is_private" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_devices" ADD CONSTRAINT "customer_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_devices" ADD CONSTRAINT "customer_devices_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_images" ADD CONSTRAINT "review_images_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_product_id_products_id_fk" FOREIGN KEY ("bundle_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_related_product_id_products_id_fk" FOREIGN KEY ("related_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recently_viewed_user_idx" ON "recently_viewed" USING btree ("user_id","viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wishlist_items_product_idx" ON "wishlist_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_user_recent_idx" ON "wishlist_items" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "review_images_review_idx" ON "review_images" USING btree ("review_id","position");--> statement-breakpoint
CREATE INDEX "reviews_product_approved_idx" ON "reviews" USING btree ("product_id","created_at" DESC NULLS LAST) WHERE "reviews"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "reviews_pending_idx" ON "reviews" USING btree ("created_at") WHERE "reviews"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "bundle_items_variant_idx" ON "bundle_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "product_relations_ordered_idx" ON "product_relations" USING btree ("product_id","kind","position");--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("scheduled_for") WHERE "notifications"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "notifications_failed_idx" ON "notifications" USING btree ("created_at" DESC NULLS LAST) WHERE "notifications"."status" = 'failed';--> statement-breakpoint
CREATE INDEX "notifications_order_idx" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_alerts_pending_key" ON "stock_alerts" USING btree ("variant_id","email","kind") WHERE "stock_alerts"."notified_at" is null;--> statement-breakpoint
CREATE INDEX "stock_alerts_outstanding_idx" ON "stock_alerts" USING btree ("variant_id") WHERE "stock_alerts"."notified_at" is null;--> statement-breakpoint
CREATE INDEX "stock_count_items_unapplied_idx" ON "stock_count_items" USING btree ("stock_count_id") WHERE not "stock_count_items"."applied";--> statement-breakpoint
CREATE INDEX "stock_counts_open_idx" ON "stock_counts" USING btree ("started_at" DESC NULLS LAST) WHERE "stock_counts"."status" = 'open';--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_recent_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_bestselling_idx" ON "products" USING btree ("sales_count" DESC NULLS LAST) WHERE "products"."status" = 'active';--> statement-breakpoint
CREATE INDEX "inventory_low_stock_idx" ON "inventory" USING btree ("variant_id") WHERE "inventory"."track" and "inventory"."low_stock_threshold" is not null and ("inventory"."on_hand" - "inventory"."reserved") <= "inventory"."low_stock_threshold";--> statement-breakpoint
CREATE INDEX "carts_abandoned_idx" ON "carts" USING btree ("updated_at") WHERE "carts"."status" = 'active' and "carts"."reminder_sent_at" is null;--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_awaiting_confirmation_idx" ON "orders" USING btree ("created_at") WHERE "orders"."status" = 'new';