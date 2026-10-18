-- Website subscriptions: billing functions, status guard, invoice immutability and who can see what.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test');
update public.profiles set role = 'admin' where id = '33333333-3333-4333-8333-333333333333';

insert into public.plans (id, key, name, onboarding_minor, monthly_minor, domain_allowance_minor)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'test_website', 'Business website', 499900, 499900, 149900);
insert into public.subscriptions (id, user_id, plan_id, requested_domains, mailbox_name)
values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
        array['alice-bakery.in'], 'info');
insert into public.subscription_private (subscription_id, admin_notes) values ('bbbbbbbb-0000-4000-8000-000000000001', 'Prefers WhatsApp');
insert into public.invoices (id, subscription_id, user_id, kind, description, amount_minor, currency, period_start, period_end, due_on)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'onboarding', 'Website setup', 499900, 'INR', '2031-10-18', '2031-10-31', '2031-10-18');

-- Onboarding paid
select is(public.settle_invoice('cccccccc-0000-4000-8000-000000000001', null, '2031-10-18 10:00+00'), 'onboarding_paid', 'the onboarding invoice is settled');
select is((select status::text from public.subscriptions where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 'onboarding', 'the subscription moves to onboarding');
select is((select paid_through from public.subscriptions where id = 'bbbbbbbb-0000-4000-8000-000000000001'), '2031-10-31'::date, 'paid to the end of the month');
select is(public.settle_invoice('cccccccc-0000-4000-8000-000000000001', null, now()), 'already_paid', 'settling twice changes nothing');
select is((select count(*)::int from public.subscription_events where subscription_id = 'bbbbbbbb-0000-4000-8000-000000000001' and kind = 'payment'), 1,
  'one payment event');

-- Monthly invoices
-- The functions bill every subscription; only this test's one is checked.
select is((select count(*)::int from public.issue_monthly_invoices('2031-10-20') where subscription_id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0, 'nothing is issued more than 5 days before the 1st');
select is((select due_on from public.issue_monthly_invoices('2031-10-27') where subscription_id = 'bbbbbbbb-0000-4000-8000-000000000001'), '2031-11-01'::date, 'November is issued 5 days ahead, due on the 1st');
select is((select count(*)::int from public.issue_monthly_invoices('2031-10-28') where subscription_id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0, 'and only once');
select is((select count(*)::int from public.issue_monthly_invoices('2032-01-02') where subscription_id = 'bbbbbbbb-0000-4000-8000-000000000001'), 2, 'missed months are caught up (December, January)');
select is((select amount_minor from public.invoices where subscription_id = 'bbbbbbbb-0000-4000-8000-000000000001' and period_start = '2031-11-01'), 499900,
  'at the plan''s monthly price');

-- Overdue and back in good standing
select is((select count(*)::int from public.mark_overdue_subscriptions('2031-11-05') as id where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0, 'not overdue within the grace days');
select is((select count(*)::int from public.mark_overdue_subscriptions('2031-11-08') as id where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 1, 'overdue a week after the due date');
select is((select status::text from public.subscriptions where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 'past_due', 'the subscription is past due');

-- Guards
select throws_ok($$ update public.invoices set amount_minor = 1 where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'P0001', 'An issued invoice cannot change', 'an invoice amount cannot change');
select throws_ok($$ update public.invoices set status = 'open', paid_at = null where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'P0001', 'invalid_invoice_transition', 'a paid invoice stays paid');
select throws_ok($$ update public.subscriptions set status = 'active' where id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  '23514', null, 'a subscription can''t be active before it is set up');

-- Alice
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.invoices), 4, 'the customer reads their invoices');
select is((select count(*)::int from public.subscription_private), 0, 'but not the team''s private details');
select throws_ok($$ select public.settle_invoice('cccccccc-0000-4000-8000-000000000001', null, now()) $$, '42501', null, 'and cannot settle invoices');

-- Bob
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.subscriptions), 0, 'another user sees no subscription');

select * from finish();
rollback;
