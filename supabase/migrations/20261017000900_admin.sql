-- The admin panel: switching the active price in one step, and the numbers on the overview. Both run with the
-- caller's rights (security invoker), so the RLS policies decide: admins see and change everything, other users
-- change nothing and count only their own rows.

-- One active price per product and purpose. Switching deactivates the old one and activates the new one in the
-- same transaction, so checkout never finds no price or two.
create function public.activate_price(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_product text;
  v_purpose public.price_purpose;
begin
  select p.product, p.purpose into v_product, v_purpose from public.prices p where p.id = p_id;
  if not found then
    raise exception 'price_not_found' using errcode = 'P0002';
  end if;
  update public.prices set active = false where product = v_product and purpose = v_purpose and active and id <> p_id;
  update public.prices set active = true where id = p_id;
  if not found then
    raise exception 'price_not_found' using errcode = 'P0002';
  end if;
end
$$;

revoke execute on function public.activate_price(uuid) from public, anon;
grant execute on function public.activate_price(uuid) to authenticated, service_role;

-- The overview for a period [p_from, p_to), compared with [p_prev_from, p_from). Amounts are per currency.
create function public.admin_metrics(p_from timestamptz, p_to timestamptz, p_prev_from timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'letters_paid', (select count(*) from public.letters l where l.paid_at >= p_from and l.paid_at < p_to),
    'letters_paid_before', (select count(*) from public.letters l where l.paid_at >= p_prev_from and l.paid_at < p_from),
    'revenue', (
      select coalesce(jsonb_object_agg(r.currency, r.total), '{}')
      from (select p.currency, sum(p.amount_minor) as total
            from public.payments p
            where p.status = 'success' and p.verified_at >= p_from and p.verified_at < p_to
            group by p.currency) r),
    'refunds', (
      select coalesce(jsonb_object_agg(r.currency, jsonb_build_object('count', r.n, 'total', r.total)), '{}')
      from (select p.currency, count(*) as n, sum(p.amount_minor) as total
            from public.payments p
            where p.status = 'refunded' and p.refunded_at >= p_from and p.refunded_at < p_to
            group by p.currency) r),
    'letters_started', (select count(*) from public.letters l where l.created_at >= p_from and l.created_at < p_to),
    'letters_started_paid', (select count(*) from public.letters l where l.created_at >= p_from and l.created_at < p_to and l.status = 'paid'),
    'checkouts', (select count(distinct p.letter_id) from public.payments p where p.created_at >= p_from and p.created_at < p_to),
    'checkouts_paid', (
      select count(distinct p.letter_id) from public.payments p
      where p.created_at >= p_from and p.created_at < p_to and p.status in ('success', 'refunded')),
    'pending', (
      select count(*) from public.payments p
      where p.status in ('initiated', 'pending') and p.created_at > now() - interval '3 days')
  )
$$;

revoke execute on function public.admin_metrics(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_metrics(timestamptz, timestamptz, timestamptz) to authenticated, service_role;

comment on column public.clause_variants.source_file is
  'The content/ file a clause was seeded from. Null once an admin has edited it, so seeding never overwrites that.';
