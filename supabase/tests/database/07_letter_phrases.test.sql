-- Letter phrases: readable by signed-in users, managed by admins only.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test');
update public.profiles set role = 'admin' where id = '33333333-3333-4333-8333-333333333333';
insert into public.jurisdictions (code, name, currency, locale, paper_size) values ('ZZ', 'Testland', 'EUR', 'en-GB', 'a4');
insert into public.letter_phrases (key, jurisdiction_code, text) values
  ('zz.greeting', null, 'Hello'),
  ('zz.greeting', 'ZZ', 'Hello, Testland');

select throws_ok($$ insert into public.letter_phrases (key, text) values ('zz.greeting', 'Again') $$,
  '23505', null, 'there is one default per phrase, even without a country');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.letter_phrases where key = 'zz.greeting'), 2, 'signed-in users read phrases');
select throws_ok($$ insert into public.letter_phrases (key, text) values ('zz.other', 'x') $$, '42501', null,
  'a regular user cannot add phrases');
update public.letter_phrases set text = 'Changed' where key = 'zz.greeting';
reset role;
select is((select count(*)::int from public.letter_phrases where text = 'Changed'), 0, 'a regular user cannot change phrases');

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select lives_ok($$ update public.letter_phrases set text = 'Hi' where key = 'zz.greeting' and jurisdiction_code is null $$,
  'an admin can change phrases');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select * from public.letter_phrases $$, '42501', null, 'visitors cannot read phrases');

select * from finish();
rollback;
