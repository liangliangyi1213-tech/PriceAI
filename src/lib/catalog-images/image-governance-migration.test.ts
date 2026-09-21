import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrationsDirectory)
  .find((name) => name.endsWith("_govern_catalog_image_table_privileges.sql"));

const sql = migrationName
  ? readFileSync(join(migrationsDirectory, migrationName), "utf8")
  : "";

describe("catalog image table privilege governance migration contract", () => {
  it("restricts append-only primary-event access to service-role reads and inserts", () => {
    expect(migrationName).toBeDefined();
    expect(sql).toContain("revoke all privileges on table public.product_image_primary_events from service_role");
    expect(sql).toContain("grant select, insert on table public.product_image_primary_events to service_role");
    expect(sql).not.toMatch(/grant\s+[^;]*\b(update|delete|truncate)\b[^;]*product_image_primary_events[^;]*service_role/i);
  });

  it("restricts mirror-job access to service-role reads, inserts, and updates", () => {
    expect(sql).toContain("revoke all privileges on table public.product_image_mirror_jobs from service_role");
    expect(sql).toContain("grant select, insert, update on table public.product_image_mirror_jobs to service_role");
    expect(sql).not.toMatch(/grant\s+[^;]*\b(delete|truncate)\b[^;]*product_image_mirror_jobs[^;]*service_role/i);
  });

  it("adds exact composite indexes for both product-variant foreign keys", () => {
    expect(sql).toContain("product_images_product_variant_fk_idx");
    expect(sql).toContain("on public.product_images (product_id, variant_id)");
    expect(sql).toContain("product_image_primary_events_product_variant_fk_idx");
    expect(sql).toContain("on public.product_image_primary_events (product_id, variant_id)");
  });

  it("does not alter RLS, functions, triggers, or consumer catalog tables", () => {
    expect(sql).not.toMatch(/alter table public\.(products|product_variants|offers)\b/i);
    expect(sql).not.toMatch(/create\s+(or replace\s+)?function/i);
    expect(sql).not.toMatch(/create trigger/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });
});
