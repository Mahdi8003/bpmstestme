CREATE TABLE "master_data_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"title" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_data_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'database' NOT NULL,
	"fields" jsonb NOT NULL,
	"title_field" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_data_records" ADD CONSTRAINT "master_data_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_data_records" ADD CONSTRAINT "master_data_records_type_id_master_data_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."master_data_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_data_records" ADD CONSTRAINT "master_data_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_data_types" ADD CONSTRAINT "master_data_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_data_types" ADD CONSTRAINT "master_data_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_data_records_tenant_type_idx" ON "master_data_records" USING btree ("tenant_id","type_id");--> statement-breakpoint
CREATE INDEX "master_data_records_tenant_title_idx" ON "master_data_records" USING btree ("tenant_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "master_data_types_tenant_key_unique" ON "master_data_types" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "master_data_types_tenant_idx" ON "master_data_types" USING btree ("tenant_id");