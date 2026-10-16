-- Letters: ownership, locked sections, server-only issuing and immutable versions.
begin;
select plan(17);

-- Fixtures (as postgres)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');

insert into public.jurisdictions (code, parent_code, name, currency, locale, paper_size) values
  ('ZZ', null, 'Testland', 'EUR', 'en-GB', 'a4'),
  ('ZZ-AA', 'ZZ', 'Testland, North', 'EUR', 'en-GB', 'a4');
insert into public.templates (key, name, default_accent) values ('zz_style', 'Test style', '#0F6E5F');
insert into public.sections (key, default_title, default_order, always_included) values
  ('zz_core', 'Core', 1, true),
  ('zz_notice', 'Notice', 2, false),
  ('zz_bonus', 'Bonus', 3, false);
-- The parent country requires the notice section; the child inherits the lock.
insert into public.clause_variants (section_key, jurisdiction_code, body, locked, locked_reason) values
  ('zz_notice', 'ZZ', 'Notice text.', true, 'Required in Testland'),
  ('zz_bonus', 'ZZ', 'Bonus of {{bonus.terms}}.', false, null);

insert into public.companies (id, owner_id, legal_name, registered_address, registration_number, country_code, contact_phone, contact_email, signatory_name, signatory_title) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Example Engineering GmbH', 'Addr', 'HRB 0', 'DE', '+49 0', 'a@example.test', 'A', 'B'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Example Suspended Ltd', 'Addr', '0', 'GB', '+44 0', 'a@example.test', 'A', 'B'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Sample Analytics Inc.', 'Addr', '0', 'US', '+1 0', 'b@example.test', 'A', 'B');
update public.companies set suspended_at = now(), suspended_reason = 'Under review' where id = 'aaaaaaaa-0000-4000-8000-000000000002';

-- Alice
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.letters (id, company_id, author_id, jurisdiction_code, template_key, field_values)
  values ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ-AA', 'zz_style', '{"candidate.full_name":"Lena Hoffmann"}')
$$, 'a user can start a letter for their own company');

select throws_ok($$
  insert into public.letters (company_id, author_id, jurisdiction_code, template_key)
  values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style')
$$, '42501', 'company_not_found', 'a user cannot start a letter for someone else''s company');

select throws_ok($$
  insert into public.letters (company_id, author_id, jurisdiction_code, template_key)
  values ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style')
$$, 'P0001', 'company_suspended', 'a suspended company cannot get new letters');

select throws_ok($$
  insert into public.letters (company_id, author_id, jurisdiction_code, template_key, status, paid_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style', 'paid', now())
$$, '42501', 'Only the server can issue letters', 'a user cannot create a paid letter');

select lives_ok($$
  update public.letters set removed_sections = array['zz_bonus'] where id = 'cccccccc-0000-4000-8000-000000000001'
$$, 'an optional section can be removed');

select throws_ok($$
  update public.letters set removed_sections = array['zz_bonus', 'zz_notice'] where id = 'cccccccc-0000-4000-8000-000000000001'
$$, 'P0001', 'section_locked', 'a section the parent country requires cannot be removed');

select throws_ok($$
  update public.letters set removed_sections = array['zz_core'] where id = 'cccccccc-0000-4000-8000-000000000001'
$$, 'P0001', 'section_locked', 'a core section cannot be removed in any country');

select throws_ok($$
  update public.letters set status = 'paid', paid_at = now() where id = 'cccccccc-0000-4000-8000-000000000001'
$$, '42501', 'Only the server can change this letter field', 'a user cannot mark a letter as paid');

select throws_ok($$
  insert into public.letter_versions (letter_id, version, snapshot, company_snapshot, content_hash)
  values ('cccccccc-0000-4000-8000-000000000001', 1, '{}', '{}', repeat('a', 64))
$$, '42501', null, 'a user cannot create an issued version');

-- Bob
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.letters), 0, 'another user cannot see the letter');
update public.letters set name = 'Hacked' where id = 'cccccccc-0000-4000-8000-000000000001';

-- Server issues version 1
reset role;
update public.letters set status = 'paid', paid_at = now(), current_version = 1, correction_until = now() + interval '7 days'
where id = 'cccccccc-0000-4000-8000-000000000001';
insert into public.letter_versions (id, letter_id, version, snapshot, company_snapshot, content_hash)
values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 1, '{"v":1}', '{"legal_name":"Example Engineering GmbH"}', repeat('a', 64));

select lives_ok($$
  update public.letter_versions set pdf_path = 'letters/v1.pdf' where id = 'dddddddd-0000-4000-8000-000000000001'
$$, 'the server can attach the PDF to a version once');
select throws_ok($$
  update public.letter_versions set pdf_path = 'letters/other.pdf' where id = 'dddddddd-0000-4000-8000-000000000001'
$$, 'P0001', 'The PDF of an issued version cannot be replaced', 'a version''s PDF cannot be replaced');
select throws_ok($$
  update public.letter_versions set snapshot = '{"v":2}' where id = 'dddddddd-0000-4000-8000-000000000001'
$$, 'P0001', 'Issued letter versions cannot be changed', 'an issued version cannot be changed, even by the server');

-- Alice again
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select name from public.letters where id = 'cccccccc-0000-4000-8000-000000000001'), 'Untitled letter',
  'another user could not rename the letter');
update public.letters set field_values = '{"candidate.full_name":"Changed"}' where id = 'cccccccc-0000-4000-8000-000000000001';
select is((select field_values ->> 'candidate.full_name' from public.letters where id = 'cccccccc-0000-4000-8000-000000000001'),
  'Lena Hoffmann', 'a paid letter cannot be edited directly by the user');
select is((select count(*)::int from public.letter_versions), 1, 'the author can read issued versions');

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.letter_versions), 0, 'another user cannot read issued versions');

select * from finish();
rollback;
