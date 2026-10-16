-- Companies: ownership, the company limit, suspension and deletion rules.
begin;
select plan(17);

-- Fixtures (as postgres)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test');
update public.profiles set role = 'admin' where id = '33333333-3333-4333-8333-333333333333';

insert into public.jurisdictions (code, name, currency, locale, paper_size) values ('ZZ', 'Testland', 'EUR', 'en-GB', 'a4')
on conflict (code) do nothing;
insert into public.templates (key, name, default_accent) values ('zz_style', 'Test style', '#0F6E5F')
on conflict (key) do nothing;

select is(
  (select count(*)::int from public.profiles where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')),
  2, 'a profile is created for every new user');

-- Alice
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.companies (id, owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Example Engineering GmbH', 'Beispielstraße 10, München', 'HRB 000000', 'DE', '+49 89 0000 0000', 'people@example-engineering.test', 'Anna Weber', 'Head of People')
$$, 'a user can save a company');

select throws_ok($$
  insert into public.companies (owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title)
  values ('22222222-2222-4222-8222-222222222222', 'Not Mine Ltd', 'Somewhere', '000', 'GB', '+44 20 0000 0000', 'x@example.test', 'X', 'Y')
$$, '42501', null, 'a user cannot save a company for someone else');

select throws_ok($$
  insert into public.companies (owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title, suspended_at, suspended_reason)
  values ('11111111-1111-4111-8111-111111111111', 'Sneaky Ltd', 'Somewhere', '000', 'GB', '+44 20 0000 0000', 'x@example.test', 'X', 'Y', now(), 'test')
$$, '42501', 'Only admins can suspend companies', 'a user cannot create a suspended company');

insert into public.companies (owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title)
select '11111111-1111-4111-8111-111111111111', 'Example Company ' || n, 'Address ' || n, 'REG-' || n, 'DE', '+49 89 0000 0000', 'people@example.test', 'Anna Weber', 'Head of People'
from generate_series(2, 5) as n;

select is((select count(*)::int from public.companies), 5, 'the user now has 5 companies');

select throws_ok($$
  insert into public.companies (owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title)
  values ('11111111-1111-4111-8111-111111111111', 'Sixth Ltd', 'Somewhere', '000', 'DE', '+49 89 0000 0000', 'x@example.test', 'X', 'Y')
$$, 'P0001', 'company_limit_reached', 'a 6th company is rejected by the database');

update public.companies set archived_at = now() where legal_name = 'Example Company 5';
select throws_ok($$
  insert into public.companies (owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title)
  values ('11111111-1111-4111-8111-111111111111', 'Sixth Ltd', 'Somewhere', '000', 'DE', '+49 89 0000 0000', 'x@example.test', 'X', 'Y')
$$, 'P0001', 'company_limit_reached', 'archived companies still count toward the limit');

select throws_ok($$
  update public.companies set suspended_at = now(), suspended_reason = 'x' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$$, '42501', 'Only admins can suspend companies', 'a user cannot suspend or unsuspend a company');

select throws_ok($$
  update public.profiles set company_limit = 50 where id = '11111111-1111-4111-8111-111111111111'
$$, '42501', 'Only admins can change company limits', 'a user cannot raise their own company limit');

select throws_ok($$
  update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111'
$$, '42501', 'Only the server can change this profile field', 'a user cannot make themselves an admin');

-- Bob
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.companies), 0, 'another user cannot see the companies');
update public.companies set legal_name = 'Hacked' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.companies where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Admin
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.companies where owner_id = '11111111-1111-4111-8111-111111111111'), 5, 'an admin can see every company');
select lives_ok($$
  update public.profiles set company_limit = 6 where id = '11111111-1111-4111-8111-111111111111'
$$, 'an admin can raise a user''s company limit');

-- Alice again
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select legal_name from public.companies where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'Example Engineering GmbH',
  'another user could neither change nor delete the company');
select lives_ok($$
  insert into public.companies (owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title)
  values ('11111111-1111-4111-8111-111111111111', 'Sixth Ltd', 'Somewhere', '000', 'DE', '+49 89 0000 0000', 'x@example.test', 'X', 'Y')
$$, 'a 6th company is allowed after the admin raised the limit');

-- A company with a paid letter can only be archived.
reset role;
insert into public.letters (company_id, author_id, jurisdiction_code, template_key, status, paid_at, current_version)
values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style', 'paid', now(), 1);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok($$
  delete from public.companies where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$$, 'P0001', 'company_has_paid_letters', 'a company with paid letters cannot be deleted');
select lives_ok($$
  delete from public.companies where legal_name = 'Example Company 2'
$$, 'a company without paid letters can be deleted');

select * from finish();
rollback;
