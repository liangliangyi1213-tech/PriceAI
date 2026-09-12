create or replace function public.promote_product_image_primary(
  p_image_id uuid,
  p_action text,
  p_reason text,
  p_changed_by text
)
returns table (
  promoted_image_id uuid,
  replaced_image_id uuid,
  promotion_action text,
  primary_event_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  promoted public.product_images%rowtype;
  current_primary public.product_images%rowtype;
  has_current_primary boolean := false;
  inserted_event_id uuid;
begin
  if p_action is null or p_action not in ('initial', 'replace', 'rollback') then
    raise exception 'invalid primary promotion action' using errcode = '23514';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'invalid primary promotion reason' using errcode = '23514';
  end if;
  if nullif(trim(p_changed_by), '') is null or length(trim(p_changed_by)) > 120 then
    raise exception 'invalid primary promotion actor' using errcode = '23514';
  end if;

  -- Read immutable target identity, then serialize every promotion for that target.
  select * into promoted
  from public.product_images
  where id = p_image_id;
  if not found then
    raise exception 'catalog image not found' using errcode = 'P0002';
  end if;

  if promoted.target_type = 'product' then
    perform 1
    from public.products
    where id = promoted.product_id
    for update;
  else
    perform 1
    from public.product_variants
    where id = promoted.variant_id
      and product_id = promoted.product_id
    for update;
  end if;
  if not found then
    raise exception 'catalog image target not found' using errcode = '23503';
  end if;

  -- Re-read under lock after waiting for any concurrent promotion.
  select * into promoted
  from public.product_images
  where id = p_image_id
  for update;
  if promoted.status <> 'approved' then
    raise exception 'only approved images can become primary' using errcode = '23514';
  end if;

  select * into current_primary
  from public.product_images
  where product_id = promoted.product_id
    and target_type = promoted.target_type
    and variant_id is not distinct from promoted.variant_id
    and status = 'approved'
    and role = 'primary'
    and is_primary
  limit 1
  for update;
  has_current_primary := found;

  if has_current_primary and current_primary.id = promoted.id then
    raise exception 'catalog image is already primary' using errcode = '23514';
  end if;
  if p_action = 'initial' and has_current_primary then
    raise exception 'initial promotion requires an empty primary slot' using errcode = '23505';
  end if;
  if p_action in ('replace', 'rollback') and not has_current_primary then
    raise exception 'replacement requires an existing primary' using errcode = '23514';
  end if;
  if p_action = 'rollback' and not exists (
    select 1
    from public.product_image_primary_events history
    where history.product_id = promoted.product_id
      and history.target_type = promoted.target_type
      and history.variant_id is not distinct from promoted.variant_id
      and history.new_image_id = promoted.id
  ) then
    raise exception 'rollback image has no primary history' using errcode = '23514';
  end if;

  if has_current_primary then
    update public.product_images
    set role = 'gallery', is_primary = false
    where id = current_primary.id;
  end if;

  update public.product_images
  set role = 'primary', is_primary = true
  where id = promoted.id
    and status = 'approved';
  if not found then
    raise exception 'approved image changed during promotion' using errcode = '40001';
  end if;

  insert into public.product_image_primary_events (
    product_id,
    variant_id,
    target_type,
    previous_image_id,
    new_image_id,
    action,
    reason,
    changed_by
  ) values (
    promoted.product_id,
    promoted.variant_id,
    promoted.target_type,
    case when has_current_primary then current_primary.id else null end,
    promoted.id,
    p_action,
    trim(p_reason),
    trim(p_changed_by)
  )
  returning id into inserted_event_id;

  return query select
    promoted.id,
    case when has_current_primary then current_primary.id else null end,
    p_action,
    inserted_event_id;
end;
$$;

revoke all on function public.promote_product_image_primary(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.promote_product_image_primary(uuid, text, text, text)
  to service_role;

comment on function public.promote_product_image_primary(uuid, text, text, text) is
  'Atomically promotes an approved catalog image and appends its immutable primary event.';
