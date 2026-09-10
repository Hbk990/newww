CREATE TYPE "public"."attribute_type" AS ENUM('text', 'number', 'boolean', 'enum');--> statement-breakpoint
CREATE TYPE "public"."collection_kind" AS ENUM('manual', 'smart');--> statement-breakpoint
CREATE TYPE "public"."option_kind" AS ENUM('color', 'size', 'capacity', 'device_fit', 'connector', 'power', 'flavor', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"description" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "option_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "option_kind" DEFAULT 'other' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "option_types_product_name_key" UNIQUE("product_id","name")
);
--> statement-breakpoint
CREATE TABLE "option_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_type_id" uuid NOT NULL,
	"value" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "option_values_type_value_key" UNIQUE("option_type_id","value")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"short_description" text,
	"description_html" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"brand_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"min_price_cents" integer,
	"max_price_cents" integer,
	"variant_count" integer DEFAULT 0 NOT NULL,
	"primary_image_url" text,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "variant_options" (
	"variant_id" uuid NOT NULL,
	"option_value_id" uuid NOT NULL,
	CONSTRAINT "variant_options_variant_id_option_value_id_pk" PRIMARY KEY("variant_id","option_value_id")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text,
	"title" text NOT NULL,
	"price_cents" integer NOT NULL,
	"cost_cents" integer,
	"compare_at_cents" integer,
	"weight_grams" integer,
	"image_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "variants_price_cents_nonneg" CHECK ("variants"."price_cents" >= 0),
	CONSTRAINT "variants_cost_cents_nonneg" CHECK ("variants"."cost_cents" >= 0),
	CONSTRAINT "variants_compare_at_cents_nonneg" CHECK ("variants"."compare_at_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "device_brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "device_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_brand_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"family" text,
	"release_year" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "device_models_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_device_fit" (
	"product_id" uuid NOT NULL,
	"device_model_id" uuid NOT NULL,
	CONSTRAINT "product_device_fit_product_id_device_model_id_pk" PRIMARY KEY("product_id","device_model_id")
);
--> statement-breakpoint
CREATE TABLE "variant_device_fit" (
	"variant_id" uuid NOT NULL,
	"device_model_id" uuid NOT NULL,
	CONSTRAINT "variant_device_fit_variant_id_device_model_id_pk" PRIMARY KEY("variant_id","device_model_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"data_type" "attribute_type" NOT NULL,
	"unit" text,
	"is_filterable" boolean DEFAULT true NOT NULL,
	"is_comparable" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attribute_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "category_attributes" (
	"category_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "category_attributes_category_id_attribute_id_pk" PRIMARY KEY("category_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "product_attributes" (
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"value_text" text,
	"value_number" numeric,
	"value_bool" boolean,
	CONSTRAINT "product_attributes_product_id_attribute_id_pk" PRIMARY KEY("product_id","attribute_id"),
	CONSTRAINT "product_attributes_exactly_one_value" CHECK (num_nonnulls("product_attributes"."value_text", "product_attributes"."value_number", "product_attributes"."value_bool") = 1)
);
--> statement-breakpoint
CREATE TABLE "collection_products" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_products_collection_id_product_id_pk" PRIMARY KEY("collection_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "collection_kind" DEFAULT 'manual' NOT NULL,
	"rules" jsonb,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "source_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"raw" jsonb NOT NULL,
	"name" text NOT NULL,
	"brand_name" text,
	"category_name" text,
	"category_group" text,
	"cost_cents" integer,
	"image_url" text,
	"option_count" integer DEFAULT 0 NOT NULL,
	"color_count" integer DEFAULT 0 NOT NULL,
	"promoted_product_id" uuid,
	"promoted_at" timestamp with time zone,
	"excluded" boolean DEFAULT false NOT NULL,
	"excluded_reason" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"note" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_products_source_ref_key" UNIQUE("source","source_ref")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_types" ADD CONSTRAINT "option_types_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_values" ADD CONSTRAINT "option_values_option_type_id_option_types_id_fk" FOREIGN KEY ("option_type_id") REFERENCES "public"."option_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_options" ADD CONSTRAINT "variant_options_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_options" ADD CONSTRAINT "variant_options_option_value_id_option_values_id_fk" FOREIGN KEY ("option_value_id") REFERENCES "public"."option_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_image_id_product_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."product_images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_device_brand_id_device_brands_id_fk" FOREIGN KEY ("device_brand_id") REFERENCES "public"."device_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_device_fit" ADD CONSTRAINT "product_device_fit_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_device_fit" ADD CONSTRAINT "product_device_fit_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_device_fit" ADD CONSTRAINT "variant_device_fit_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_device_fit" ADD CONSTRAINT "variant_device_fit_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_attribute_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_attribute_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_products" ADD CONSTRAINT "source_products_promoted_product_id_products_id_fk" FOREIGN KEY ("promoted_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_position_idx" ON "categories" USING btree ("parent_id","position");--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_one_primary_idx" ON "product_categories" USING btree ("product_id") WHERE "product_categories"."is_primary";--> statement-breakpoint
CREATE INDEX "product_images_product_position_idx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "products_status_published_idx" ON "products" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_live_price_idx" ON "products" USING btree ("min_price_cents") WHERE "products"."status" = 'active';--> statement-breakpoint
CREATE INDEX "products_live_published_idx" ON "products" USING btree ("published_at" DESC NULLS LAST) WHERE "products"."status" = 'active';--> statement-breakpoint
CREATE INDEX "variants_product_position_idx" ON "variants" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "device_models_brand_year_idx" ON "device_models" USING btree ("device_brand_id","release_year" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "product_device_fit_model_idx" ON "product_device_fit" USING btree ("device_model_id");--> statement-breakpoint
CREATE INDEX "variant_device_fit_model_idx" ON "variant_device_fit" USING btree ("device_model_id");--> statement-breakpoint
CREATE INDEX "product_attributes_attribute_number_idx" ON "product_attributes" USING btree ("attribute_id","value_number");--> statement-breakpoint
CREATE INDEX "product_attributes_attribute_text_idx" ON "product_attributes" USING btree ("attribute_id","value_text");--> statement-breakpoint
CREATE INDEX "collection_products_ordered_idx" ON "collection_products" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX "source_products_group_category_idx" ON "source_products" USING btree ("category_group","category_name");--> statement-breakpoint
CREATE INDEX "source_products_brand_idx" ON "source_products" USING btree ("brand_name");--> statement-breakpoint
CREATE INDEX "source_products_promoted_idx" ON "source_products" USING btree ("promoted_product_id") WHERE "source_products"."promoted_product_id" is not null;--> statement-breakpoint
CREATE INDEX "source_products_needs_review_idx" ON "source_products" USING btree ("needs_review") WHERE "source_products"."needs_review";--> statement-breakpoint
CREATE INDEX "source_products_unused_idx" ON "source_products" USING btree ("imported_at" DESC NULLS LAST) WHERE "source_products"."promoted_product_id" is null and not "source_products"."excluded";