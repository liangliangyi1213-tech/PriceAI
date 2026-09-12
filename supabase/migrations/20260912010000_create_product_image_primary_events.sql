create table public.product_image_primary_events (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  variant_id text null,
  target_type text not null,
  previous_image_id uuid null references public.product_images(id) on delete restrict,
  new_image_id uuid null references public.product_images(id) on delete restrict,
  action text not null,
  reason text not null,
  changed_by text not null,
  created_at timestamptz not null default now(),

  constraint product_image_primary_events_product_fk
    foreign key (product_id) references public.products(id) on delete restrict,
  constraint product_image_primary_events_variant_product_fk
    foreign key (product_id, variant_id)
    references public.product_variants(product_id, id) on delete restrict,
  constraint product_image_primary_events_target_type_check
    check (target_type in ('product', 'variant')),
  constraint product_image_primary_events_target_consistency_check
    check (
      (target_type = 'product' and variant_id is null)
      or (target_type = 'variant' and variant_id is not null)
    ),
  constraint product_image_primary_events_action_check
    check (action in ('initial', 'replace', 'rollback', 'clear')),
  constraint product_image_primary_events_reason_check
    check (nullif(trim(reason), '') is not null),
  constraint product_image_primary_events_actor_check
    check (nullif(trim(changed_by), '') is not null),
  constraint product_image_primary_events_image_check
    check (previous_image_id is not null or new_image_id is not null),
  constraint product_image_primary_events_distinct_images_check
    check (
      previous_image_id is null or new_image_id is null or previous_image_id <> new_image_id
    )
);

create index product_image_primary_events_product_history_idx
  on public.product_image_primary_events (product_id, created_at desc);
create index product_image_primary_events_variant_history_idx
  on public.product_image_primary_events (variant_id, created_at desc) where variant_id is not null;
create index product_image_primary_events_previous_image_idx
  on public.product_image_primary_events (previous_image_id) where previous_image_id is not null;
create index product_image_primary_events_new_image_idx
  on public.product_image_primary_events (new_image_id) where new_image_id is not null;

create function public.enforce_product_image_primary_event_target()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  referenced_image public.product_images%rowtype;
  referenced_id uuid;
begin
  foreach referenced_id in array array[new.previous_image_id, new.new_image_id]
  loop
    if referenced_id is null then continue; end if;
    select * into referenced_image from public.product_images where id = referenced_id;
    if referenced_image.product_id <> new.product_id
      or referenced_image.target_type <> new.target_type
      or referenced_image.variant_id is distinct from new.variant_id then
      raise exception 'primary event image target mismatch' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.enforce_product_image_primary_event_target() from public;
create trigger product_image_primary_events_target_trigger
before insert on public.product_image_primary_events
for each row execute function public.enforce_product_image_primary_event_target();

create function public.reject_product_image_primary_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'product image primary events are append-only' using errcode = '55000';
end;
$$;

revoke all on function public.reject_product_image_primary_event_mutation() from public;
create trigger product_image_primary_events_append_only_trigger
before update or delete on public.product_image_primary_events
for each row execute function public.reject_product_image_primary_event_mutation();

alter table public.product_image_primary_events enable row level security;
revoke all on table public.product_image_primary_events from public, anon, authenticated;
grant select, insert on table public.product_image_primary_events to service_role;
