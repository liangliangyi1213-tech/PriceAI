import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260915010000_create_product_image_mirror_jobs.sql"), "utf8");

describe("product_image_mirror_jobs migration contract", () => {
  it("creates a server-only RLS table without source or credential payloads", () => {
    expect(sql).toContain("create table public.product_image_mirror_jobs");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.product_image_mirror_jobs from public, anon, authenticated");
    expect(sql).not.toMatch(/source_url|external_product_id|credential|token/i);
  });

  it("enforces one job per primary event and indexes due work", () => {
    expect(sql).toContain("unique (primary_event_id)");
    expect(sql).toContain("product_image_mirror_jobs_claim_idx");
    expect(sql).toContain("product_image_mirror_jobs_stale_processing_idx");
    expect(sql).toContain("product_image_mirror_jobs_identity_guard");
    expect(sql).toContain("events.new_image_id = new.image_id");
  });

  it("claims atomically with row locking and recovers stale processing leases", () => {
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("p_processing_timeout");
    expect(sql).toContain("attempt_count >= p_max_attempts");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("grant execute on function public.claim_product_image_mirror_job");
  });
});
