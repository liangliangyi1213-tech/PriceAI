create table public.product_image_mirror_jobs (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.product_images(id) on delete restrict,
  primary_event_id uuid not null references public.product_image_primary_events(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'retry_wait', 'permanently_failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz null,
  last_error_code text null check (last_error_code is null or length(last_error_code) between 1 and 80),
  policy_version integer not null check (policy_version > 0),
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint product_image_mirror_jobs_event_unique unique (primary_event_id),
  constraint product_image_mirror_jobs_schedule_check check (
    (status = 'retry_wait' and next_attempt_at is not null and completed_at is null)
    or (status in ('pending', 'processing') and next_attempt_at is null and completed_at is null)
    or (status in ('succeeded', 'permanently_failed', 'cancelled') and next_attempt_at is null and completed_at is not null)
  ),
  constraint product_image_mirror_jobs_started_check check (
    (status = 'processing' and started_at is not null)
    or (status in ('pending', 'retry_wait') and started_at is null)
    or status in ('succeeded', 'permanently_failed', 'cancelled')
  ),
  constraint product_image_mirror_jobs_error_check check (
    (status in ('retry_wait', 'permanently_failed', 'cancelled') and last_error_code is not null)
    or (status in ('pending', 'processing', 'succeeded') and last_error_code is null)
  ),
  constraint product_image_mirror_jobs_started_time_check check (
    started_at is null or started_at >= created_at
  ),
  constraint product_image_mirror_jobs_completed_check check (
    completed_at is null or completed_at >= created_at
  )
);

create index product_image_mirror_jobs_claim_idx
  on public.product_image_mirror_jobs (next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');

create index product_image_mirror_jobs_stale_processing_idx
  on public.product_image_mirror_jobs (started_at)
  where status = 'processing';

create index product_image_mirror_jobs_image_idx
  on public.product_image_mirror_jobs (image_id, created_at desc);

alter table public.product_image_mirror_jobs enable row level security;

revoke all on table public.product_image_mirror_jobs from public, anon, authenticated;
grant select, insert, update on table public.product_image_mirror_jobs to service_role;

create or replace function public.validate_product_image_mirror_job_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.product_image_primary_events events
    where events.id = new.primary_event_id
      and events.new_image_id = new.image_id
  ) then
    raise exception 'mirror job does not match its primary event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_image_mirror_jobs_identity_guard
before insert or update of image_id, primary_event_id
on public.product_image_mirror_jobs
for each row execute function public.validate_product_image_mirror_job_identity();

revoke all on function public.validate_product_image_mirror_job_identity()
  from public, anon, authenticated;

create or replace function public.claim_product_image_mirror_job(
  p_now timestamptz,
  p_processing_timeout interval,
  p_max_attempts integer
)
returns setof public.product_image_mirror_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  if p_now is null or p_processing_timeout is null or p_processing_timeout <= interval '0 seconds'
    or p_max_attempts is null or p_max_attempts <= 0 then
    raise exception 'invalid mirror job claim options' using errcode = '22023';
  end if;

  update public.product_image_mirror_jobs
  set status = 'permanently_failed',
      completed_at = p_now,
      updated_at = p_now,
      last_error_code = 'processing_lease_expired'
  where status = 'processing'
    and started_at <= p_now - p_processing_timeout
    and attempt_count >= p_max_attempts;

  select jobs.id into claimed_id
  from public.product_image_mirror_jobs jobs
  where jobs.attempt_count < p_max_attempts
    and (
      (jobs.status = 'pending' and (jobs.next_attempt_at is null or jobs.next_attempt_at <= p_now))
      or (jobs.status = 'retry_wait' and jobs.next_attempt_at <= p_now)
      or (jobs.status = 'processing' and jobs.started_at <= p_now - p_processing_timeout)
    )
  order by coalesce(jobs.next_attempt_at, jobs.created_at), jobs.created_at, jobs.id
  for update skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  return query
  update public.product_image_mirror_jobs
  set status = 'processing',
      attempt_count = attempt_count + 1,
      started_at = p_now,
      next_attempt_at = null,
      completed_at = null,
      last_error_code = null,
      updated_at = p_now
  where id = claimed_id
  returning *;
end;
$$;

revoke all on function public.claim_product_image_mirror_job(timestamptz, interval, integer)
  from public, anon, authenticated;
grant execute on function public.claim_product_image_mirror_job(timestamptz, interval, integer)
  to service_role;

comment on table public.product_image_mirror_jobs is
  'Server-only outbox for asynchronous Catalog primary image mirroring.';
comment on function public.claim_product_image_mirror_job(timestamptz, interval, integer) is
  'Atomically claims one due mirror job and recovers expired processing leases.';
