ALTER TABLE "cases" ADD COLUMN "parent_case_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "root_case_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_parent_case_id_cases_id_fk" FOREIGN KEY ("parent_case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_root_case_id_cases_id_fk" FOREIGN KEY ("root_case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_tenant_parent_idx" ON "cases" USING btree ("tenant_id","parent_case_id");--> statement-breakpoint
CREATE INDEX "cases_tenant_root_idx" ON "cases" USING btree ("tenant_id","root_case_id");