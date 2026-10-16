-- Reference data: who can read and manage countries, clauses, styles and fields, and the country enable guard.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test');
update public.profiles set role = 'admin' where id = '33333333-3333-4333-8333-333333333333';

insert into public.jurisdictions (code, name, currency, locale, paper_size) values ('ZZ', 'Testland', 'EUR', 'en-GB', 'a4');
insert into public.sections (key, default_title, default_order, always_included) values
  ('zz_core', 'Core', 1, true),
  ('zz_notice', 'Notice', 2, false);
insert into public.clause_variants (id, section_key, jurisdiction_code, body, locked, locked_reason, legal_notes) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'zz_core', 'ZZ', 'Core text.', false, null, 'internal'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'zz_notice', 'ZZ', 'Notice text.', true, 'Required in Testland', 'internal');
-- Seeded sections that every letter includes need a Testland clause too, so the tests pass before and after `pnpm seed`.
insert into public.clause_variants (section_key, jurisdiction_code, body)
select key, 'ZZ', 'Seeded section text.' from public.sections where always_included and key not like 'zz\_%';

-- Review workflow and the enable guard (as postgres, like the admin panel's server code)
select throws_ok($$ update public.jurisdictions set enabled = true where code = 'ZZ' $$,
  'P0001', 'jurisdiction_not_ready', 'a country cannot go live while required sections have no approved clause');

select throws_ok($$
  update public.clause_variants set review_status = 'approved', reviewer = 'R', reviewed_at = now()
  where id = 'eeeeeeee-0000-4000-8000-000000000001'
$$, 'P0001', 'A clause must be in review before it is approved', 'a draft cannot jump straight to approved');

select throws_ok($$
  insert into public.clause_variants (section_key, jurisdiction_code, body, review_status, reviewer, reviewed_at)
  values ('zz_core', 'ZZ', 'x', 'approved', 'R', now())
$$, 'P0001', 'New clauses start as drafts and go through review', 'a clause cannot be created already approved');

update public.clause_variants set review_status = 'in_review' where jurisdiction_code = 'ZZ';

select throws_ok($$
  update public.clause_variants set review_status = 'approved' where id = 'eeeeeeee-0000-4000-8000-000000000001'
$$, '23514', null, 'approval needs a reviewer and a review date');

select lives_ok($$
  update public.clause_variants set review_status = 'approved', reviewer = 'Example Law LLP', reviewed_at = now()
  where jurisdiction_code = 'ZZ'
$$, 'clauses in review can be approved with a reviewer and date');

select throws_ok($$
  update public.clause_variants set body = 'Changed.' where id = 'eeeeeeee-0000-4000-8000-000000000001'
$$, 'P0001', 'Approved clauses cannot be changed. Add a new version instead.', 'an approved clause cannot be edited');

select throws_ok($$ delete from public.clause_variants where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'P0001', 'Approved clauses cannot be deleted. Add a new version instead.', 'an approved clause cannot be deleted');

select lives_ok($$ update public.jurisdictions set enabled = true where code = 'ZZ' $$,
  'a country can go live once every required section has an approved clause');

insert into public.clause_variants (section_key, jurisdiction_code, body, version) values ('zz_notice', 'ZZ', 'New draft.', 2);

select throws_ok($$
  insert into public.field_definitions (key, section_key, label, type) values ('candidate.passport_number', 'zz_core', 'Passport', 'text')
$$, '23514', null, 'fields for government ID numbers are refused');

-- A signed-in user
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.clause_variants where jurisdiction_code = 'ZZ' and section_key like 'zz\_%'), 2,
  'signed-in users see approved clauses but not drafts');
select throws_ok($$ select legal_notes from public.clause_variants $$, '42501', null,
  'signed-in users cannot read legal notes');
select throws_ok($$ insert into public.templates (key, name, default_accent) values ('zz_new', 'New', '#000000') $$,
  '42501', null, 'a regular user cannot add a letter style');
select is((select count(*)::int from public.audit_logs), 0, 'a regular user cannot read the audit log');

-- An admin
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select lives_ok($$ insert into public.templates (key, name, default_accent) values ('zz_new', 'New', '#000000') $$,
  'an admin can add a letter style');

-- Signed out
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from public.jurisdictions where code = 'ZZ'), 1, 'visitors can read enabled countries');
reset role;
update public.jurisdictions set enabled = false where code = 'ZZ';
set local role anon;
select is((select count(*)::int from public.jurisdictions where code = 'ZZ'), 0, 'visitors cannot read disabled countries');

select * from finish();
rollback;
