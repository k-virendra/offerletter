-- Helper functions and guard triggers.
-- Guards that ask "who is calling?" are SECURITY INVOKER so current_user is the API role (authenticated, anon or
-- service_role). Lookups that must see rows hidden by RLS are separate SECURITY DEFINER helpers.

-- ---------------------------------------------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------------------------------------------

create function public.is_service() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin')
$$;
comment on function public.is_service() is 'True for server code using the secret key (and migrations). Only meaningful in SECURITY INVOKER code.';

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Countries and clause resolution helpers
-- ---------------------------------------------------------------------------------------------------------------

-- The jurisdiction and its parents, most specific first: US-CA -> {US-CA, US}.
create function public.jurisdiction_chain(p_code text) returns text[]
language sql stable security definer set search_path = '' as $$
  with recursive chain (code, parent_code, depth) as (
    select j.code, j.parent_code, 0 from public.jurisdictions j where j.code = p_code
    union all
    select j.code, j.parent_code, c.depth + 1
    from public.jurisdictions j
    join chain c on j.code = c.parent_code
    where c.depth < 5
  )
  select coalesce(array_agg(code order by depth), '{}') from chain
$$;

-- A section is locked for a jurisdiction when it is a core section, or when the most specific clause for it
-- (approved first, then highest version) is marked locked. Review status is ignored on purpose: a lock always wins.
create function public.section_locked(p_section text, p_jurisdiction text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.always_included from public.sections s where s.key = p_section), false)
      or coalesce((
           select cv.locked
           from public.clause_variants cv
           join unnest(public.jurisdiction_chain(p_jurisdiction)) with ordinality as c (code, depth)
             on c.code = cv.jurisdiction_code
           where cv.section_key = p_section and cv.language = 'en'
           order by c.depth, (cv.review_status = 'approved') desc, cv.version desc
           limit 1
         ), false)
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'companies', 'jurisdictions', 'templates', 'sections', 'clause_variants',
                           'field_definitions', 'letters', 'prices', 'payments', 'abuse_reports'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end
$$;

-- Records who changed what. Updates record only the names of changed columns, never their values.
create function public.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_details jsonb := '{}';
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at', 'edited_at');
    if v_changed is null then
      return new;
    end if;
    v_details := jsonb_build_object('changed', to_jsonb(v_changed));
  end if;
  if v_row ? 'status' then
    v_details := v_details || jsonb_build_object('status', v_row ->> 'status');
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values ((select p.id from public.profiles p where p.id = (select auth.uid())), lower(tg_op), tg_table_name, v_row ->> 'id', v_details);
  return coalesce(new, old);
end
$$;

create trigger audit after insert or update or delete on public.companies for each row execute function public.audit_change();
create trigger audit after insert or delete on public.letters for each row execute function public.audit_change();
create trigger audit_status after update of status, removed_sections, jurisdiction_code, company_id on public.letters for each row execute function public.audit_change();
create trigger audit after insert or update on public.payments for each row execute function public.audit_change();
create trigger audit after insert on public.letter_versions for each row execute function public.audit_change();
create trigger audit after insert on public.downloads for each row execute function public.audit_change();
create trigger audit after insert or update or delete on public.clause_variants for each row execute function public.audit_change();
create trigger audit after update on public.jurisdictions for each row execute function public.audit_change();
create trigger audit after insert or update on public.prices for each row execute function public.audit_change();
create trigger audit after update of role, company_limit on public.profiles for each row execute function public.audit_change();
create trigger audit after update on public.abuse_reports for each row execute function public.audit_change();

-- ---------------------------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email) execute function public.handle_user_email_change();

create function public.guard_profiles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_service() then
    return new;
  end if;
  if new.id <> old.id or new.email is distinct from old.email or new.role <> old.role or new.created_at <> old.created_at then
    raise exception 'Only the server can change this profile field' using errcode = '42501';
  end if;
  if new.company_limit <> old.company_limit and not public.is_admin() then
    raise exception 'Only admins can change company limits' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger guard before update on public.profiles for each row execute function public.guard_profiles();

-- ---------------------------------------------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------------------------------------------

-- The limit is enforced here, not only in the interface. The owner's profile row is locked so two parallel
-- inserts cannot both slip under the limit. Archived companies count.
create function public.enforce_company_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer;
  v_count integer;
begin
  select p.company_limit into v_limit from public.profiles p where p.id = new.owner_id for update;
  if v_limit is null then
    raise exception 'Unknown company owner' using errcode = '23503';
  end if;
  select count(*) into v_count from public.companies c where c.owner_id = new.owner_id;
  if v_count >= v_limit then
    raise exception 'company_limit_reached'
      using errcode = 'P0001',
            detail = format('This account can save %s companies.', v_limit),
            hint = 'Delete a company that has no paid letters, or ask for a higher limit.';
  end if;
  return new;
end
$$;

create trigger enforce_company_limit before insert on public.companies
for each row execute function public.enforce_company_limit();

create function public.guard_companies() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_privileged boolean := public.is_service() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_privileged and (new.suspended_at is not null or new.suspended_reason is not null) then
      raise exception 'Only admins can suspend companies' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.owner_id <> old.owner_id and not public.is_service() then
    raise exception 'A company cannot change owner' using errcode = '42501';
  end if;
  if (new.suspended_at is distinct from old.suspended_at or new.suspended_reason is distinct from old.suspended_reason)
     and not v_privileged then
    raise exception 'Only admins can suspend companies' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger guard before insert or update on public.companies for each row execute function public.guard_companies();

-- A company with paid letters can only be archived. The check is skipped when the owner's whole account is being
-- deleted (the profile row is already gone by the time the cascade reaches companies).
create function public.guard_company_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = old.owner_id)
     and exists (select 1 from public.letters l where l.company_id = old.id and l.status = 'paid') then
    raise exception 'company_has_paid_letters'
      using errcode = 'P0001', hint = 'Archive the company instead. It keeps counting toward the company limit.';
  end if;
  return old;
end
$$;

create trigger guard_delete before delete on public.companies for each row execute function public.guard_company_delete();

-- ---------------------------------------------------------------------------------------------------------------
-- Letters
-- ---------------------------------------------------------------------------------------------------------------

create function public.guard_letters() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_service boolean := public.is_service();
  v_owner uuid;
  v_archived timestamptz;
  v_suspended timestamptz;
  v_key text;
begin
  -- Issuing is server-only: status, payment time, versions, pinned clauses and the correction window.
  if not v_service then
    if tg_op = 'INSERT' then
      if new.status <> 'draft' or new.paid_at is not null or new.current_version <> 0
         or new.correction_until is not null or new.pinned_clauses <> '{}'::jsonb then
        raise exception 'Only the server can issue letters' using errcode = '42501';
      end if;
    elsif new.status is distinct from old.status or new.paid_at is distinct from old.paid_at
          or new.current_version <> old.current_version or new.correction_until is distinct from old.correction_until
          or new.pinned_clauses is distinct from old.pinned_clauses or new.author_id <> old.author_id
          or new.created_at <> old.created_at then
      raise exception 'Only the server can change this letter field' using errcode = '42501';
    end if;
  end if;

  -- The company must belong to the author and be usable.
  if tg_op = 'INSERT' or new.company_id <> old.company_id then
    select c.owner_id, c.archived_at, c.suspended_at into v_owner, v_archived, v_suspended
    from public.companies c where c.id = new.company_id;
    if v_owner is null or v_owner <> new.author_id then
      raise exception 'company_not_found' using errcode = '42501';
    end if;
    if v_suspended is not null then
      raise exception 'company_suspended' using errcode = 'P0001';
    end if;
    if v_archived is not null then
      raise exception 'company_archived' using errcode = 'P0001';
    end if;
  end if;

  -- Only real sections can be removed, and never one the country requires.
  if tg_op = 'INSERT' or new.removed_sections is distinct from old.removed_sections
     or new.jurisdiction_code <> old.jurisdiction_code then
    foreach v_key in array new.removed_sections loop
      if not exists (select 1 from public.sections s where s.key = v_key) then
        raise exception 'unknown_section' using errcode = 'P0001', detail = v_key;
      end if;
      if public.section_locked(v_key, new.jurisdiction_code) then
        raise exception 'section_locked' using errcode = 'P0001', detail = v_key;
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' and (new.field_values is distinct from old.field_values
      or new.removed_sections is distinct from old.removed_sections or new.name <> old.name
      or new.template_key <> old.template_key or new.jurisdiction_code <> old.jurisdiction_code
      or new.accent_color is distinct from old.accent_color or new.company_id <> old.company_id) then
    new.edited_at = now();
  end if;
  return new;
end
$$;

create trigger guard before insert or update on public.letters for each row execute function public.guard_letters();

-- Issued versions are immutable. Only pdf_path may be filled in, once.
create function public.guard_letter_versions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.letter_id <> old.letter_id or new.version <> old.version or new.snapshot <> old.snapshot
     or new.company_snapshot <> old.company_snapshot or new.content_hash <> old.content_hash
     or new.note is distinct from old.note or new.created_at <> old.created_at then
    raise exception 'Issued letter versions cannot be changed' using errcode = 'P0001';
  end if;
  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'The PDF of an issued version cannot be replaced' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger guard before update on public.letter_versions for each row execute function public.guard_letter_versions();

-- ---------------------------------------------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------------------------------------------

-- Payment status only moves forward. A late success after a failure is allowed (PayU can confirm late).
create function public.guard_payments() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.txnid <> old.txnid or new.amount_minor <> old.amount_minor or new.currency <> old.currency then
    raise exception 'Payment amount and transaction id cannot change' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'initiated' and new.status in ('pending', 'success', 'failed'))
    or (old.status = 'pending' and new.status in ('success', 'failed'))
    or (old.status = 'failed' and new.status = 'success')
    or (old.status = 'success' and new.status = 'refunded')
  ) then
    raise exception 'invalid_payment_transition' using errcode = 'P0001', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end
$$;

create trigger guard before update on public.payments for each row execute function public.guard_payments();

-- ---------------------------------------------------------------------------------------------------------------
-- Clauses and countries
-- ---------------------------------------------------------------------------------------------------------------

-- Approved clauses never change (a change is a new version) and approval goes through review.
create function public.guard_clause_variants() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.review_status = 'approved' then
      raise exception 'Approved clauses cannot be deleted. Add a new version instead.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.review_status = 'approved' then
      raise exception 'New clauses start as drafts and go through review' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.review_status = 'approved' and (
       new.body <> old.body or new.title is distinct from old.title or new.locked <> old.locked
    or new.locked_reason is distinct from old.locked_reason or new.section_key <> old.section_key
    or new.jurisdiction_code <> old.jurisdiction_code or new.language <> old.language or new.version <> old.version
    or new.review_status <> old.review_status or new.reviewer is distinct from old.reviewer
    or new.reviewed_at is distinct from old.reviewed_at) then
    raise exception 'Approved clauses cannot be changed. Add a new version instead.' using errcode = 'P0001';
  end if;
  if new.review_status = 'approved' and old.review_status <> 'approved' and old.review_status <> 'in_review' then
    raise exception 'A clause must be in review before it is approved' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger guard before insert or update or delete on public.clause_variants
for each row execute function public.guard_clause_variants();

-- A country can be switched on only when every section it requires has an approved English clause.
create function public.guard_jurisdiction_enable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_chain text[];
  v_missing text;
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled) then
    v_chain := array[new.code] || coalesce(public.jurisdiction_chain(new.parent_code), '{}');
    select string_agg(s.key, ', ' order by s.default_order) into v_missing
    from public.sections s
    where (s.always_included or exists (
             select 1 from public.clause_variants cv
             where cv.section_key = s.key and cv.jurisdiction_code = any (v_chain) and cv.locked))
      and not exists (
             select 1 from public.clause_variants cv
             where cv.section_key = s.key and cv.jurisdiction_code = any (v_chain)
               and cv.language = 'en' and cv.review_status = 'approved');
    if v_missing is not null then
      raise exception 'jurisdiction_not_ready'
        using errcode = 'P0001', detail = format('These required sections need an approved clause: %s', v_missing);
    end if;
  end if;
  return new;
end
$$;

create trigger guard_enable before insert or update of enabled on public.jurisdictions
for each row execute function public.guard_jurisdiction_enable();

-- ---------------------------------------------------------------------------------------------------------------
-- Rate limiting (fixed windows), called only by server code
-- ---------------------------------------------------------------------------------------------------------------

create function public.rate_limit_take(p_key text, p_window_seconds integer, p_max integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_window_seconds < 1 or p_max < 1 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end
$$;
