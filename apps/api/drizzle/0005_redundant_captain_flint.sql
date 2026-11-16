ALTER TABLE "items" ADD COLUMN "extra" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data_types" ADD COLUMN "entity" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data_types" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data_types" ADD COLUMN "is_hierarchical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data_types" ADD COLUMN "sort_order" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "extra" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "extra" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "extra" jsonb DEFAULT '{}'::jsonb NOT NULL;