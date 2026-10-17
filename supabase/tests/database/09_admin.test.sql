-- The admin panel's database functions: switching prices in one step, and the overview's numbers, both limited
-- by the caller's rights.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');
update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111';

insert into public.prices (id, purpose, currency, amount_minor, active)
values ('eeeeeeee-0000-4000-8000-000000000001', 'charge', 'EUR', 1234, false);
insert into public.payments (txnid, user_id, amount_minor, currency, status, verified_at)
values ('OLPTESTMETRICS1', '11111111-1111-4111-8111-111111111111', 55500, 'GBP', 'success', '2031-05-10');

-- Bob, an ordinary user
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select public.activate_price('eeeeeeee-0000-4000-8000-000000000001') $$,
  'P0002', 'price_not_found', 'a user cannot switch prices');
select is((select public.admin_metrics('2031-05-01', '2031-06-01', '2031-04-01') -> 'revenue'), '{}'::jsonb,
  'a user’s numbers leave out other people’s payments');

-- The admin
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.activate_price('eeeeeeee-0000-4000-8000-000000000001') $$, 'an admin can switch the charge price');
reset role;
select is((select count(*)::int from public.prices where product = 'offer_letter' and purpose = 'charge' and active), 1,
  'exactly one charge price is active afterwards');
select is((select currency from public.prices where product = 'offer_letter' and purpose = 'charge' and active), 'EUR',
  'and it is the new one');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select public.admin_metrics('2031-05-01', '2031-06-01', '2031-04-01') -> 'revenue' ->> 'GBP'), '55500',
  'revenue counts successful payments in the period, per currency');
select throws_ok($$ select public.activate_price('eeeeeeee-0000-4000-8000-0000000000ff') $$,
  'P0002', 'price_not_found', 'an unknown price is refused');

select * from finish();
rollback;
