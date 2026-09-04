create table public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (length(trim(platform)) > 0),
  query text not null,
  status text not null check (status in ('running', 'success', 'partial_failure', 'failed')),
  dry_run boolean not null default false,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  unmatched_count integer not null default 0 check (unmatched_count >= 0),
  ambiguous_count integer not null default 0 check (ambiguous_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  offer_upsert_count integer not null default 0 check (offer_upsert_count >= 0),
  price_snapshot_count integer not null default 0 check (price_snapshot_count >= 0),
  write_failure_count integer not null default 0 check (write_failure_count >= 0),
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);

create index catalog_sync_runs_started_at_idx on public.catalog_sync_runs (started_at desc);
create index catalog_sync_runs_platform_started_at_idx on public.catalog_sync_runs (platform, started_at desc);
create index catalog_sync_runs_status_started_at_idx on public.catalog_sync_runs (status, started_at desc);

alter table public.catalog_sync_runs enable row level security;
revoke all on public.catalog_sync_runs from anon, authenticated;
-- Internal operational data: no public read or write policies are created.
