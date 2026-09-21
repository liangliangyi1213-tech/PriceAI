-- Tighten server-only table privileges without changing RLS, triggers, RPCs,
-- or the approved-primary lifecycle. SECURITY INVOKER RPCs continue to run
-- with service_role, which retains only the operations their code paths use.
revoke all privileges on table public.product_image_primary_events from service_role;
grant select, insert on table public.product_image_primary_events to service_role;

revoke all privileges on table public.product_image_mirror_jobs from service_role;
grant select, insert, update on table public.product_image_mirror_jobs to service_role;

-- Cover the composite foreign keys directly. Existing history/lookup indexes
-- do not provide this product_id + variant_id access path.
create index if not exists product_images_product_variant_fk_idx
  on public.product_images (product_id, variant_id);

create index if not exists product_image_primary_events_product_variant_fk_idx
  on public.product_image_primary_events (product_id, variant_id);
