-- Payments and rate limits: server-only writes, forward-only status, per-user visibility.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');

-- The server records a payment for Alice
insert into public.payments (id, user_id, txnid, amount_minor, currency, status)
values ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'OLPTEST000001', 900, 'USD', 'initiated');

select lives_ok($$ update public.payments set status = 'success', verified_at = now() where id = 'ffffffff-0000-4000-8000-000000000001' $$,
  'the server can confirm a payment');
select throws_ok($$ update public.payments set status = 'pending' where id = 'ffffffff-0000-4000-8000-000000000001' $$,
  'P0001', 'invalid_payment_transition', 'a confirmed payment cannot move back to pending');
select throws_ok($$ update public.payments set amount_minor = 1 where id = 'ffffffff-0000-4000-8000-000000000001' $$,
  'P0001', 'Payment amount and transaction id cannot change', 'the amount of a payment cannot change');

select is((select public.rate_limit_take('test:key', 60, 2)), true, 'rate limit: first hit is allowed');
select public.rate_limit_take('test:key', 60, 2);
select is((select public.rate_limit_take('test:key', 60, 2)), false, 'rate limit: third hit in the window is refused');

-- Alice
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.payments), 1, 'a user can read their own payments');
select throws_ok($$
  insert into public.payments (user_id, txnid, amount_minor, currency) values ('11111111-1111-4111-8111-111111111111', 'OLPTEST000002', 900, 'USD')
$$, '42501', null, 'a user cannot create a payment');
select throws_ok($$ select public.rate_limit_take('x', 60, 1) $$, '42501', null, 'a user cannot call the rate limiter');

-- Bob
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.payments), 0, 'another user cannot read the payment');

select * from finish();
rollback;
