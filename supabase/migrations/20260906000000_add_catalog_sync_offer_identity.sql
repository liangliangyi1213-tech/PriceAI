-- v0.9 catalog-sync metadata. Apply manually in Supabase SQL Editor; this file is not executed by the app.
alter table public.offers drop constraint if exists offers_platform_check;
alter table public.offers add column if not exists offer_identity text;
alter table public.offers add column if not exists external_product_id text;
alter table public.offers add column if not exists external_variant_id text;
alter table public.offers add column if not exists last_seen_at timestamptz;
alter table public.offers add column if not exists source text not null default 'catalog';

update public.offers set offer_identity = 'legacy:' || id where offer_identity is null;
alter table public.offers alter column offer_identity set not null;
alter table public.offers add constraint offers_offer_identity_key unique (offer_identity);
create index if not exists offers_external_variant_id_idx on public.offers (platform, external_variant_id);
create index if not exists offers_last_seen_at_idx on public.offers (last_seen_at desc);

-- RLS stays enabled and the existing anon/authenticated SELECT-only grants remain unchanged.
