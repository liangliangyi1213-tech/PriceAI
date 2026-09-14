import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260915000000_create_catalog_images_storage_foundation.sql",
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8");
}

describe("Catalog image Storage foundation migration", () => {
  it("creates one public Catalog bucket with bounded static image restrictions", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/insert\s+into\s+storage\.buckets/i);
    expect(sql).toContain("'catalog-images'");
    expect(sql).toMatch(/public[\s\S]*true/i);
    expect(sql).toContain("10485760");
    expect(sql).toContain("'image/jpeg'");
    expect(sql).toContain("'image/png'");
    expect(sql).toContain("'image/webp'");
    expect(sql).not.toContain("image/svg+xml");
    expect(sql).not.toContain("image/gif");
  });

  it("creates no client read or write policy", () => {
    const sql = migrationSql();

    expect(sql).not.toMatch(/create\s+policy|drop\s+policy/i);
    expect(sql).not.toMatch(/to\s+(anon|authenticated)/i);
    expect(sql).not.toMatch(/for\s+(select|insert|update|delete)/i);
  });

  it("does not add upload work, Catalog mutations, or mirror orchestration", () => {
    const sql = migrationSql();

    expect(sql).not.toMatch(/insert\s+into\s+storage\.objects/i);
    expect(sql).not.toMatch(/product_images|products\.image|mirror_jobs|outbox/i);
    expect(sql).not.toMatch(/promote_product_image_primary/i);
  });
});
