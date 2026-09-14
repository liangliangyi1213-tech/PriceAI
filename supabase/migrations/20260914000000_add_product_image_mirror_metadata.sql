alter table public.product_images
  add column if not exists content_type text null,
  add column if not exists width integer null,
  add column if not exists height integer null,
  add column if not exists mirrored_at timestamptz null,
  add column if not exists last_checked_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_images'::regclass
      and conname = 'product_images_dimensions_check'
  ) then
    alter table public.product_images
      add constraint product_images_dimensions_check
      check (
        (width is null and height is null)
        or (
          width is not null
          and height is not null
          and width > 0
          and height > 0
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_images'::regclass
      and conname = 'product_images_content_type_check'
  ) then
    alter table public.product_images
      add constraint product_images_content_type_check
      check (
        content_type is null
        or content_type in ('image/jpeg', 'image/png', 'image/webp')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_images'::regclass
      and conname = 'product_images_mirror_check_time_check'
  ) then
    alter table public.product_images
      add constraint product_images_mirror_check_time_check
      check (
        mirrored_at is null
        or last_checked_at is null
        or last_checked_at >= mirrored_at
      );
  end if;
end
$$;
