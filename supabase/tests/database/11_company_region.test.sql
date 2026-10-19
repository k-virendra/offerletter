-- A company's state or province: an ISO 3166-2 code inside the company's own country.
begin;
select plan(5);

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'alice@example.test');

select lives_ok($$
  insert into public.companies (id, owner_id, legal_name, registered_address, registration_number, country_code, region_code, signatory_name, signatory_title)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Sample Analytics Inc.', '1 Market St', 'EIN 1', 'US', 'US-CA', 'Jamie Lee', 'Head of People')
$$, 'a US company gives its state');
select lives_ok($$
  insert into public.companies (owner_id, legal_name, registered_address, registration_number, country_code, signatory_name, signatory_title)
  values ('11111111-1111-4111-8111-111111111111', 'Example GmbH', 'Musterstraße 1', 'HRB 1', 'DE', 'Anna Weber', 'Director')
$$, 'other companies give none');
select throws_ok($$ update public.companies set region_code = 'CA-ON' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'the state or province is in the company''s country');
select throws_ok($$ update public.companies set region_code = 'California' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'it is an ISO 3166-2 code');
select throws_ok($$ update public.companies set country_code = 'DE' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'moving country needs a matching state or none');

select * from finish();
rollback;
