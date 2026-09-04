create table public.product_insights (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  variant_id text not null references public.product_variants(id) on delete cascade,
  facts_hash text not null check (facts_hash ~ '^[0-9a-f]{64}$'),
  insight jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_insights_product_variant_facts_hash_key unique (product_id, variant_id, facts_hash)
);

create index product_insights_variant_created_at_idx
  on public.product_insights (variant_id, created_at desc);

alter table public.product_insights enable row level security;

revoke all on public.product_insights from anon, authenticated;
grant select, insert on public.product_insights to anon, authenticated;

create policy "product insights public read"
  on public.product_insights for select to anon, authenticated using (true);

create policy "product insights cache insert"
  on public.product_insights for insert to anon, authenticated with check (true);
