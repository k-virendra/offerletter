-- Translated letters: a country's language setting, and the translation's PDF, set once like the English one.
begin;
select plan(6);

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'alice@example.test');
insert into public.jurisdictions (code, name, currency, locale, paper_size) values ('ZZ', 'Testland', 'EUR', 'en-GB', 'a4');
insert into public.templates (key, name, default_accent) values ('zz_style', 'Test style', '#0F6E5F');
insert into public.companies (id, owner_id, legal_name, registered_address, registration_number, country_code, signatory_name, signatory_title)
values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Example GmbH', 'Addr', 'HRB 0', 'DE', 'A', 'B');
insert into public.letters (id, company_id, author_id, jurisdiction_code, template_key)
values ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ZZ', 'zz_style');
update public.letters set status = 'paid', paid_at = now(), current_version = 1, correction_until = now() + interval '7 days'
where id = 'cccccccc-0000-4000-8000-000000000001';
insert into public.letter_versions (id, letter_id, version, snapshot, company_snapshot, content_hash)
values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 1, '{"translation":{"language":"de"}}', '{}', repeat('a', 64));

select lives_ok($$ update public.jurisdictions set translation_language = 'de', translation_locale = 'de-DE' where code = 'ZZ' $$,
  'a country can name its own language');
select throws_ok($$ update public.jurisdictions set translation_locale = null where code = 'ZZ' $$,
  '23514', null, 'the language comes with a locale');
select throws_ok($$ update public.jurisdictions set translation_language = 'en', translation_locale = 'en-GB' where code = 'ZZ' $$,
  '23514', null, 'English isn''t a translation');

select lives_ok($$
  update public.letter_versions set pdf_path = 'a/v1.pdf', translated_pdf_path = 'a/v1.de.pdf' where id = 'dddddddd-0000-4000-8000-000000000001'
$$, 'the server records both PDFs together');
select throws_ok($$
  update public.letter_versions set translated_pdf_path = 'a/other.de.pdf' where id = 'dddddddd-0000-4000-8000-000000000001'
$$, 'P0001', 'The PDF of an issued version cannot be replaced', 'the translation''s PDF cannot be replaced');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select translated_pdf_path from public.letter_versions where id = 'dddddddd-0000-4000-8000-000000000001'), 'a/v1.de.pdf',
  'the author reads where the translation is');

select * from finish();
rollback;
