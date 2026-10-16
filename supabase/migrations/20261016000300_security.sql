-- Row Level Security on every table, column grants and private storage buckets.
--
-- Rules:
--   * Users read and edit only their own companies and letters.
--   * Payment status, letter status, issued versions and PDF paths change only through server code with the
--     secret key (service_role bypasses RLS; guard triggers block everyone else).
--   * Only admins manage reference data (countries, styles, sections, clauses, fields, prices). The admin panel
--     checks the admin role on the server and writes with the secret key; the policies below are a second line.

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.jurisdictions enable row level security;
alter table public.templates enable row level security;
alter table public.sections enable row level security;
alter table public.clause_variants enable row level security;
alter table public.field_definitions enable row level security;
alter table public.letters enable row level security;
alter table public.letter_versions enable row level security;
alter table public.prices enable row level security;
alter table public.payments enable row level security;
alter table public.downloads enable row level security;
alter table public.audit_logs enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.rate_limits enable row level security;

-- Signed-out visitors only ever read public reference data.
revoke all on public.profiles, public.companies, public.letters, public.letter_versions, public.payments,
  public.downloads, public.audit_logs, public.abuse_reports, public.rate_limits, public.clause_variants,
  public.field_definitions from anon;
revoke insert, update, delete, truncate on public.jurisdictions, public.templates, public.sections, public.prices from anon;
revoke all on public.rate_limits from authenticated;
revoke truncate on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------------------------

create policy "own or admin can read profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "own or admin can update profiles" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
-- Profiles are created by the auth trigger and deleted with the account; no insert or delete policy.

-- ---------------------------------------------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------------------------------------------

create policy "owner or admin can read companies" on public.companies for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "users can add their own companies" on public.companies for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "owner or admin can update companies" on public.companies for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "owner can delete companies" on public.companies for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------
-- Letters and versions
-- ---------------------------------------------------------------------------------------------------------------

create policy "author or admin can read letters" on public.letters for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "users can start their own letters" on public.letters for insert to authenticated
  with check (author_id = (select auth.uid()));
-- Paid letters are corrected through server code, which checks the correction rules.
create policy "author can edit draft letters" on public.letters for update to authenticated
  using (author_id = (select auth.uid()) and status = 'draft')
  with check (author_id = (select auth.uid()) and status = 'draft');
create policy "author can delete letters" on public.letters for delete to authenticated
  using (author_id = (select auth.uid()));

create policy "author or admin can read versions" on public.letter_versions for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.letters l where l.id = letter_id and l.author_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------------------------------------------
-- Payments, downloads, audit log, misuse reports
-- ---------------------------------------------------------------------------------------------------------------

create policy "payer or admin can read payments" on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "downloader or admin can read downloads" on public.downloads for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins can read the audit log" on public.audit_logs for select to authenticated
  using ((select public.is_admin()));
create policy "admins can read misuse reports" on public.abuse_reports for select to authenticated
  using ((select public.is_admin()));
create policy "admins can update misuse reports" on public.abuse_reports for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------------------------

create policy "anyone can read enabled countries" on public.jurisdictions for select to anon, authenticated
  using (enabled or (select public.is_admin()));
create policy "admins manage countries" on public.jurisdictions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "anyone can read active styles" on public.templates for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy "admins manage styles" on public.templates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "anyone can read sections" on public.sections for select to anon, authenticated using (true);
create policy "admins manage sections" on public.sections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "signed-in users can read fields" on public.field_definitions for select to authenticated using (true);
create policy "admins manage fields" on public.field_definitions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "signed-in users can read approved clauses" on public.clause_variants for select to authenticated
  using (review_status = 'approved' or (select public.is_admin()));
create policy "admins manage clauses" on public.clause_variants for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Legal notes are for admins only. Signed-in users may select every column except legal_notes; the admin panel
-- reads them with the secret key.
revoke select on public.clause_variants from authenticated;
grant select (id, section_key, jurisdiction_code, language, title, body, locked, locked_reason, version,
              review_status, reviewer, reviewed_at, created_at, updated_at)
  on public.clause_variants to authenticated;

create policy "anyone can read the displayed price" on public.prices for select to anon, authenticated
  using ((active and purpose = 'display') or (select public.is_admin()));
create policy "admins manage prices" on public.prices for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------------------------------------------

revoke execute on function public.rate_limit_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_take(text, integer, integer) to service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.enforce_company_limit() from public, anon, authenticated;
revoke execute on function public.guard_company_delete() from public, anon, authenticated;
revoke execute on function public.guard_jurisdiction_enable() from public, anon, authenticated;
revoke execute on function public.audit_change() from public, anon, authenticated;
revoke execute on function public.section_locked(text, text) from public, anon;
revoke execute on function public.jurisdiction_chain(text) from public, anon;
grant execute on function public.section_locked(text, text) to authenticated, service_role;
grant execute on function public.jurisdiction_chain(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Storage: private buckets. No storage policies on purpose: only server code (secret key) reads and writes,
-- and the browser gets short-lived signed URLs.
-- ---------------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('logos', 'logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('letters', 'letters', false, 15728640, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
