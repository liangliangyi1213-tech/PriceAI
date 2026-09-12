alter table public.product_variants
  add constraint product_variants_product_id_id_key unique (product_id, id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  variant_id text null,
  target_type text not null default 'product',
  role text not null default 'gallery',
  status text not null default 'candidate',
  is_primary boolean not null default false,
  platform text not null,
  external_product_id text not null,
  external_variant_id text null,
  source_kind text not null,
  source_url text not null,
  source_host text not null,
  source_url_hash text not null,
  match_confidence numeric(5,4) null,
  match_evidence jsonb null,
  verification_method text null,
  verified_at timestamptz null,
  verified_by text null,
  rejection_reason text null,
  unavailable_reason text null,
  content_hash text null,
  storage_bucket text null,
  storage_object_path text null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_images_product_fk
    foreign key (product_id) references public.products(id) on delete cascade,
  constraint product_images_variant_product_fk
    foreign key (product_id, variant_id)
    references public.product_variants(product_id, id) on delete cascade,
  constraint product_images_target_type_check
    check (target_type in ('product', 'variant')),
  constraint product_images_role_check
    check (role in ('primary', 'gallery')),
  constraint product_images_status_check
    check (status in ('candidate', 'approved', 'rejected', 'unavailable')),
  constraint product_images_source_identity_check
    check (
      nullif(trim(platform), '') is not null
      and nullif(trim(external_product_id), '') is not null
      and (external_variant_id is null or nullif(trim(external_variant_id), '') is not null)
      and nullif(trim(source_kind), '') is not null
      and nullif(trim(source_host), '') is not null
    ),
  constraint product_images_target_consistency_check
    check (
      (target_type = 'product' and variant_id is null)
      or (target_type = 'variant' and variant_id is not null)
    ),
  constraint product_images_role_primary_consistency_check
    check ((role = 'primary') = is_primary),
  constraint product_images_primary_requires_approval_check
    check (not is_primary or status = 'approved'),
  constraint product_images_approved_evidence_check
    check (
      status <> 'approved'
      or (
        verified_at is not null
        and nullif(trim(verified_by), '') is not null
        and nullif(trim(verification_method), '') is not null
        and match_confidence between 0 and 1
        and match_evidence is not null
        and jsonb_typeof(match_evidence) = 'object'
        and match_evidence <> '{}'::jsonb
      )
    ),
  constraint product_images_rejected_reason_check
    check (status <> 'rejected' or nullif(trim(rejection_reason), '') is not null),
  constraint product_images_unavailable_reason_check
    check (status <> 'unavailable' or nullif(trim(unavailable_reason), '') is not null),
  constraint product_images_source_https_check
    check (source_url ~* '^https://'),
  constraint product_images_source_url_hash_check
    check (source_url_hash ~ '^[0-9a-f]{64}$'),
  constraint product_images_content_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  constraint product_images_match_confidence_check
    check (match_confidence is null or match_confidence between 0 and 1),
  constraint product_images_storage_pair_check
    check (
      (storage_bucket is null and storage_object_path is null)
      or (
        nullif(trim(storage_bucket), '') is not null
        and nullif(trim(storage_object_path), '') is not null
      )
    ),
  constraint product_images_seen_time_check
    check (last_seen_at >= first_seen_at)
);

create unique index product_images_one_product_primary_idx
  on public.product_images (product_id)
  where status = 'approved' and target_type = 'product' and role = 'primary' and is_primary;
create unique index product_images_one_variant_primary_idx
  on public.product_images (variant_id)
  where status = 'approved' and target_type = 'variant' and role = 'primary' and is_primary;

create unique index product_images_active_product_source_uidx
  on public.product_images (platform, external_product_id, source_url_hash)
  where external_variant_id is null and status in ('candidate', 'approved');
create unique index product_images_active_variant_source_uidx
  on public.product_images (platform, external_product_id, external_variant_id, source_url_hash)
  where external_variant_id is not null and status in ('candidate', 'approved');

create index product_images_product_lookup_idx
  on public.product_images (product_id, status, updated_at desc);
create index product_images_variant_lookup_idx
  on public.product_images (variant_id, status, updated_at desc) where variant_id is not null;
create index product_images_review_queue_idx
  on public.product_images (created_at asc) where status = 'candidate';
create index product_images_external_identity_idx
  on public.product_images (platform, external_product_id, external_variant_id);
create index product_images_last_seen_idx on public.product_images (last_seen_at desc);
create index product_images_content_hash_idx
  on public.product_images (content_hash) where content_hash is not null;
create unique index product_images_storage_object_uidx
  on public.product_images (storage_bucket, storage_object_path)
  where storage_bucket is not null and storage_object_path is not null;

create function public.enforce_product_image_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'candidate' then
      raise exception 'product images must begin as candidate' using errcode = '23514';
    end if;
    return new;
  end if;

  if row(
    old.product_id, old.variant_id, old.target_type, old.platform,
    old.external_product_id, old.external_variant_id, old.source_url_hash
  ) is distinct from row(
    new.product_id, new.variant_id, new.target_type, new.platform,
    new.external_product_id, new.external_variant_id, new.source_url_hash
  ) then
    raise exception 'product image identity is immutable' using errcode = '23514';
  end if;

  if old.status <> new.status and not (
    (old.status = 'candidate' and new.status in ('approved', 'rejected', 'unavailable'))
    or (old.status = 'approved' and new.status in ('rejected', 'unavailable'))
  ) then
    raise exception 'invalid product image status transition' using errcode = '23514';
  end if;

  if old.status <> new.status then
    new.status_changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_product_image_lifecycle() from public;
create trigger product_images_lifecycle_trigger
before insert or update on public.product_images
for each row execute function public.enforce_product_image_lifecycle();

alter table public.product_images enable row level security;
revoke all on table public.product_images from public, anon, authenticated;
grant select, insert, update, delete on table public.product_images to service_role;
