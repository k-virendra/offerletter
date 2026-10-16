-- Letter counts per company follow the letters access rules.
begin;
select plan(3);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');
insert into public.jurisdictions (code, name, currency, locale, paper_size) values ('ZZ', 'Testland', 'EUR', 'en-GB', 'a4');
insert into public.templates (key, name, default_accent) values ('zz_style', 'Test style', '#0F6E5F');
insert into public.companies (id, owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Example Engineering GmbH', 'Addr', 'HRB 0', 'DE', '+49 0', 'a@example.test', 'A', 'B'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Sample Analytics Inc.', 'Addr', '0', 'US', '+1 0', 'b@example.test', 'A', 'B');
insert into public.letters (company_id, author_id, jurisdiction_code, template_key) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'ZZ', 'zz_style');
-- Issuing is server work (as postgres here).
update public.letters set status = 'paid', paid_at = now(), current_version = 1
where id = (select id from public.letters where company_id = 'aaaaaaaa-0000-4000-8000-000000000001' limit 1);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select results_eq($$ select company_id, paid, drafts from public.company_letter_counts $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 1, 2) $$,
  'a user sees paid and draft counts for their own companies only');

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select results_eq($$ select company_id, paid, drafts from public.company_letter_counts $$,
  $$ values ('bbbbbbbb-0000-4000-8000-000000000001'::uuid, 0, 1) $$,
  'another user sees only theirs');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select * from public.company_letter_counts $$, '42501', null, 'visitors cannot read letter counts');

select * from finish();
rollback;
