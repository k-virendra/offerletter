-- Company logos live in the private `logos` bucket at <owner id>/<company id>/<random>.png, written only by server
-- code after re-encoding. Owners can update their company rows directly (RLS), so the path is pinned to the row's
-- own folder: pointing logo_path at someone else's file would otherwise get a signed URL for it.

alter table public.companies
  add column logo_width integer check (logo_width between 1 and 10000),
  add column logo_height integer check (logo_height between 1 and 10000),
  add constraint companies_logo_path_own_folder check (
    logo_path is null
    or logo_path ~ ('^' || owner_id::text || '/' || id::text || '/[0-9a-f]{32}\.png$')
  ),
  add constraint companies_logo_size_with_path check ((logo_path is null) = (logo_width is null and logo_height is null));

comment on column public.companies.logo_width is 'Pixel size of the stored logo, used to lay out the letterhead.';
