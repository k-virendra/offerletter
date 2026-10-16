-- Logo paths stay inside the company's own storage folder.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');
insert into public.companies (id, owner_id, legal_name, registered_address, registration_number, country_code,
                              contact_phone, contact_email, signatory_name, signatory_title) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Example Engineering GmbH',
   'Musterstraße 1, 80331 München', 'HRB 000000', 'DE', '+49 89 1234 5678', 'people@example.test', 'Anna Weber', 'CEO'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Sample Analytics Inc.',
   '100 Example Avenue, New York', 'DE 0000000', 'US', '+1 212 555 0100', 'people@sample.test', 'Morgan Lee', 'Head of People');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$
  update public.companies
  set logo_path = '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001/0123456789abcdef0123456789abcdef.png',
      logo_width = 640, logo_height = 180
  where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$$, 'a logo path in the company''s own folder is accepted');

select throws_ok($$
  update public.companies
  set logo_path = '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-000000000001/0123456789abcdef0123456789abcdef.png'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$$, '23514', null, 'a company cannot point at another user''s logo');

select throws_ok($$
  update public.companies
  set logo_path = '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001/../../x.png'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$$, '23514', null, 'a logo path cannot climb out of the folder');

select throws_ok($$
  update public.companies set logo_width = null, logo_height = null where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$$, '23514', null, 'a stored logo always has its size');

select lives_ok($$
  update public.companies set logo_path = null, logo_width = null, logo_height = null
  where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$$, 'a logo can be removed');

select * from finish();
rollback;
