-- The letter frozen at checkout can't be swapped, and PayU responses are appended (capped) by the server only.
begin;
select plan(9);

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'alice@example.test');

insert into public.payments (id, user_id, txnid, amount_minor, currency, letter_snapshot, company_snapshot, content_hash)
values ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'OLPTEST000001', 79900, 'INR',
        '{"schema":1}', '{"legalName":"Example GmbH"}', repeat('a', 64));

select lives_ok($$ update public.payments set status = 'pending', receipt_sent_at = now() where txnid = 'OLPTEST000001' $$,
  'the server can move a payment on and record the receipt');
select throws_ok($$ update public.payments set letter_snapshot = '{"schema":1,"swapped":true}' where txnid = 'OLPTEST000001' $$,
  'P0001', 'The letter frozen for a payment cannot change', 'the frozen letter cannot be swapped');
select throws_ok($$ update public.payments set content_hash = repeat('b', 64) where txnid = 'OLPTEST000001' $$,
  'P0001', 'The letter frozen for a payment cannot change', 'the frozen fingerprint cannot change');
select throws_ok($$
  insert into public.payments (txnid, amount_minor, currency, content_hash) values ('OLPTEST000002', 79900, 'INR', 'not-a-hash')
$$, '23514', null, 'a fingerprint must be a sha-256 in hex');

select public.append_payment_response('OLPTEST000001', '{"status":"pending","received_from":"return"}');
select public.append_payment_response('OLPTEST000001', '{"status":"success","received_from":"webhook"}');
select is((select raw_responses from public.payments where txnid = 'OLPTEST000001'),
  '[{"status":"pending","received_from":"return"},{"status":"success","received_from":"webhook"}]'::jsonb,
  'responses are appended in order');

select public.append_payment_response('OLPTEST000001', jsonb_build_object('n', n)) from generate_series(1, 60) as n;
select is((select jsonb_array_length(raw_responses) from public.payments where txnid = 'OLPTEST000001'), 50,
  'the log stops at 50 entries');
select lives_ok($$ select public.append_payment_response('OLPTEST-UNKNOWN', '{}') $$, 'an unknown transaction changes nothing');

-- Alice
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select public.append_payment_response('OLPTEST000001', '{"status":"success"}') $$,
  '42501', null, 'a user cannot add to the PayU log');
reset role;
set local role anon;
select throws_ok($$ select public.append_payment_response('OLPTEST000001', '{"status":"success"}') $$,
  '42501', null, 'nor can a visitor');

select * from finish();
rollback;
