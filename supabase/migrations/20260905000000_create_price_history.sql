create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  variant_id text not null references public.product_variants(id) on delete cascade,
  platform text not null check (length(trim(platform)) > 0),
  external_offer_id text,
  price numeric(12, 2) not null check (price >= 0),
  original_price numeric(12, 2) check (original_price is null or original_price >= price),
  currency text not null default 'CNY' check (currency ~ '^[A-Z]{3}$'),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index price_history_variant_recorded_at_idx on public.price_history (variant_id, recorded_at desc);
create index price_history_platform_recorded_at_idx on public.price_history (platform, recorded_at desc);

alter table public.price_history enable row level security;

revoke all on public.price_history from anon, authenticated;
grant select on public.price_history to anon, authenticated;

create policy "price history public read" on public.price_history
  for select to anon, authenticated using (true);
