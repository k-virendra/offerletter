-- Business websites: a website, its domain and one mailbox, set up for the customer and paid monthly. For the MVP
-- the team registers the domain, builds the site and sets up the mailbox by hand from the admin panel; this schema
-- holds the order, its progress and its billing. Every product is paid through public.payments (see `kind`).
--
-- Billing: an onboarding invoice is paid at sign-up and covers the rest of that month; from the 1st of the next
-- month a monthly invoice is due on the 1st of every month. Amounts are copied onto each invoice, so changing a
-- plan's price only affects invoices issued afterwards.

create type public.subscription_status as enum ('pending_payment', 'onboarding', 'active', 'past_due', 'suspended', 'cancelled');
create type public.invoice_kind as enum ('onboarding', 'monthly', 'one_off');
create type public.invoice_status as enum ('open', 'paid', 'void');
create type public.payment_kind as enum ('letter', 'invoice');

-- ---------------------------------------------------------------------------------------------------------------
-- Plans, subscriptions, invoices, timeline
-- ---------------------------------------------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 500),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  onboarding_minor integer not null check (onboarding_minor > 0),
  monthly_minor integer not null check (monthly_minor > 0),
  domain_allowance_minor integer not null default 0 check (domain_allowance_minor >= 0),
  features jsonb not null default '[]' check (jsonb_typeof(features) = 'array'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.plans.domain_allowance_minor is 'The most the onboarding fee covers for the first year of the domain; more is billed as a one-off invoice.';

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null default 'pending_payment',
  -- What the customer asked for.
  requested_domains text[] not null check (cardinality(requested_domains) between 1 and 3),
  mailbox_name text not null check (mailbox_name ~ '^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$'),
  brief jsonb not null default '{}' check (jsonb_typeof(brief) = 'object' and pg_column_size(brief) < 20000),
  billing jsonb not null default '{}' check (jsonb_typeof(billing) = 'object'),
  contact_phone text check (char_length(contact_phone) <= 40),
  -- Filled in by the team while setting up. Mailbox passwords are never stored: the provider invites the customer.
  domain text check (domain is null or domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  domain_expires_on date,
  website_url text check (website_url is null or (website_url ~* '^https?://[^\s]+$' and char_length(website_url) <= 300)),
  mailbox_address text check (mailbox_address is null or (mailbox_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(mailbox_address) <= 254)),
  mailbox_provider text check (char_length(mailbox_provider) <= 60),
  domain_ready_at timestamptz,
  website_ready_at timestamptz,
  mailbox_ready_at timestamptz,
  activated_at timestamptz,
  -- Billing: the last day paid for, and the last day an invoice has been issued for.
  paid_through date,
  invoiced_through date,
  status_reason text check (char_length(status_reason) <= 1000),
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_active_is_set_up check (
    status <> 'active' or (activated_at is not null and domain_ready_at is not null and website_ready_at is not null and mailbox_ready_at is not null))
);
create unique index subscriptions_one_open_per_company on public.subscriptions (company_id) where status <> 'cancelled' and company_id is not null;
create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create index subscriptions_status_idx on public.subscriptions (status, created_at);

-- What only the team sees: where the domain was bought, what it cost, notes.
create table public.subscription_private (
  subscription_id uuid primary key references public.subscriptions (id) on delete cascade,
  registrar text check (char_length(registrar) <= 100),
  domain_cost_minor integer check (domain_cost_minor >= 0),
  admin_notes text check (char_length(admin_notes) <= 5000),
  updated_at timestamptz not null default now()
);

create sequence public.invoice_number_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  number text not null unique default ('ACW-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  kind public.invoice_kind not null,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period_start date,
  period_end date,
  due_on date not null,
  status public.invoice_status not null default 'open',
  paid_at timestamptz,
  payment_id uuid references public.payments (id) on delete set null,
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_period check (period_end is null or (period_start is not null and period_end >= period_start)),
  constraint invoices_paid_at check ((status = 'paid') = (paid_at is not null)),
  constraint invoices_monthly_period check (kind <> 'monthly' or (period_start is not null and period_end is not null))
);
create unique index invoices_one_per_month on public.invoices (subscription_id, period_start) where kind = 'monthly' and status <> 'void';
create unique index invoices_one_onboarding on public.invoices (subscription_id) where kind = 'onboarding' and status <> 'void';
create index invoices_subscription_idx on public.invoices (subscription_id, created_at desc);
create index invoices_open_idx on public.invoices (due_on) where status = 'open';

create table public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  visible_to_customer boolean not null default true,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index subscription_events_idx on public.subscription_events (subscription_id, created_at desc);

-- Payments pay for a letter or an invoice.
alter table public.payments
  add column kind public.payment_kind not null default 'letter',
  add column invoice_id uuid references public.invoices (id) on delete set null,
  add constraint payments_invoice_has_no_letter check (kind = 'letter' or letter_id is null);
create index payments_invoice_idx on public.payments (invoice_id) where invoice_id is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------------------------------------------

-- A subscription's status moves only along these paths, and its owner and plan never change.
create function public.guard_subscriptions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.plan_id <> old.plan_id or new.created_at <> old.created_at then
    raise exception 'A subscription''s owner and plan cannot change' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'pending_payment' and new.status in ('onboarding', 'cancelled'))
    or (old.status = 'onboarding' and new.status in ('active', 'past_due', 'suspended', 'cancelled'))
    or (old.status = 'active' and new.status in ('past_due', 'suspended', 'cancelled'))
    or (old.status = 'past_due' and new.status in ('onboarding', 'active', 'suspended', 'cancelled'))
    or (old.status = 'suspended' and new.status in ('onboarding', 'active', 'past_due', 'cancelled'))
  ) then
    raise exception 'invalid_subscription_transition' using errcode = 'P0001', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end
$$;
create trigger guard before update on public.subscriptions for each row execute function public.guard_subscriptions();

-- What an invoice charges never changes; a paid or void invoice stays that way.
create function public.guard_invoices() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.subscription_id <> old.subscription_id or new.user_id <> old.user_id or new.kind <> old.kind or new.number <> old.number
     or new.amount_minor <> old.amount_minor or new.currency <> old.currency or new.due_on <> old.due_on
     or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end then
    raise exception 'An issued invoice cannot change' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (old.status = 'open' and new.status in ('paid', 'void')) then
    raise exception 'invalid_invoice_transition' using errcode = 'P0001', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end
$$;
create trigger guard before update on public.invoices for each row execute function public.guard_invoices();

create trigger set_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscription_private for each row execute function public.set_updated_at();
create trigger audit after insert or update on public.plans for each row execute function public.audit_change();
create trigger audit after insert or update or delete on public.subscriptions for each row execute function public.audit_change();
create trigger audit after insert or update on public.invoices for each row execute function public.audit_change();

-- ---------------------------------------------------------------------------------------------------------------
-- Billing functions (server only)
-- ---------------------------------------------------------------------------------------------------------------

-- Settles an open invoice (paid through PayU, or recorded by an admin) and updates its subscription, in one
-- transaction. Safe to repeat: a second call finds the invoice already paid and changes nothing.
create function public.settle_invoice(p_invoice uuid, p_payment uuid, p_paid_at timestamptz, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
  v_sub public.subscriptions;
begin
  select * into v_invoice from public.invoices where id = p_invoice for update;
  if v_invoice.id is null then
    return 'not_found';
  end if;
  if v_invoice.status = 'paid' then
    return case when p_payment is not null and v_invoice.payment_id is distinct from p_payment then 'paid_twice' else 'already_paid' end;
  end if;
  if v_invoice.status = 'void' then
    return 'void';
  end if;

  update public.invoices set status = 'paid', paid_at = p_paid_at, payment_id = p_payment, note = coalesce(p_note, note) where id = p_invoice;
  select * into v_sub from public.subscriptions where id = v_invoice.subscription_id for update;

  if v_invoice.kind in ('onboarding', 'monthly') then
    update public.subscriptions
    set paid_through = greatest(coalesce(paid_through, v_invoice.period_end), v_invoice.period_end),
        invoiced_through = greatest(coalesce(invoiced_through, v_invoice.period_end), v_invoice.period_end),
        status = case
          when status = 'pending_payment' then 'onboarding'::public.subscription_status
          -- Back in good standing once nothing is overdue any more.
          when status = 'past_due' and not exists (
            select 1 from public.invoices i
            where i.subscription_id = v_sub.id and i.status = 'open' and i.due_on <= current_date - 7)
            then case when activated_at is not null then 'active'::public.subscription_status else 'onboarding'::public.subscription_status end
          else status
        end
    where id = v_sub.id;
  end if;

  insert into public.subscription_events (subscription_id, kind, message)
  values (v_sub.id, 'payment', format('Payment received: %s.', v_invoice.description));
  return case when v_invoice.kind = 'onboarding' then 'onboarding_paid' else 'paid' end;
end
$$;

-- Issues the monthly invoices due within p_days_ahead days for every billable subscription, catching up on any
-- months missed. Returns the new invoices. The unique index makes a repeated run harmless.
create function public.issue_monthly_invoices(p_today date, p_days_ahead integer default 5)
returns setof public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  v_sub record;
  v_start date;
  v_end date;
  v_invoice public.invoices;
begin
  for v_sub in
    select s.id, s.user_id, s.invoiced_through, p.monthly_minor, p.currency, p.name
    from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.status in ('onboarding', 'active', 'past_due') and s.invoiced_through is not null
      and s.invoiced_through < p_today + p_days_ahead
    for update of s
  loop
    v_start := v_sub.invoiced_through + 1;
    while v_start <= p_today + p_days_ahead loop
      v_end := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;
      insert into public.invoices (subscription_id, user_id, kind, description, amount_minor, currency, period_start, period_end, due_on)
      values (v_sub.id, v_sub.user_id, 'monthly', format('%s – %s', v_sub.name, to_char(v_start, 'FMMonth YYYY')), v_sub.monthly_minor,
              v_sub.currency, v_start, v_end, v_start)
      on conflict do nothing
      returning * into v_invoice;
      if v_invoice.id is not null then
        return next v_invoice;
      end if;
      update public.subscriptions set invoiced_through = v_end where id = v_sub.id and invoiced_through < v_end;
      v_start := v_end + 1;
      v_invoice := null;
    end loop;
  end loop;
end
$$;

-- Subscriptions with an invoice unpaid p_grace_days after its due date become past due. Returns their ids.
create function public.mark_overdue_subscriptions(p_today date, p_grace_days integer default 7)
returns setof uuid
language sql security definer set search_path = '' as $$
  update public.subscriptions s set status = 'past_due'
  where s.status in ('onboarding', 'active')
    and exists (select 1 from public.invoices i where i.subscription_id = s.id and i.status = 'open' and i.kind = 'monthly'
                and i.due_on <= p_today - p_grace_days)
  returning s.id
$$;

revoke execute on function public.settle_invoice(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.issue_monthly_invoices(date, integer) from public, anon, authenticated;
revoke execute on function public.mark_overdue_subscriptions(date, integer) from public, anon, authenticated;
grant execute on function public.settle_invoice(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.issue_monthly_invoices(date, integer) to service_role;
grant execute on function public.mark_overdue_subscriptions(date, integer) to service_role;
revoke execute on function public.guard_subscriptions() from public, anon, authenticated;
revoke execute on function public.guard_invoices() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security: customers read their own; admins read and manage everything (through their own session,
-- so the audit log names them). Customers never write: the server does, after its checks.
-- ---------------------------------------------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.subscription_events enable row level security;
alter table public.subscription_private enable row level security;

revoke all on public.subscriptions, public.invoices, public.subscription_events, public.subscription_private from anon;
revoke insert, update, delete, truncate on public.plans from anon;
revoke truncate on public.plans, public.subscriptions, public.invoices, public.subscription_events, public.subscription_private from authenticated;
revoke all on sequence public.invoice_number_seq from anon, authenticated;

create policy "anyone can read active plans" on public.plans for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy "admins manage plans" on public.plans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "owner or admin can read subscriptions" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins update subscriptions" on public.subscriptions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "owner or admin can read invoices" on public.invoices for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins add invoices" on public.invoices for insert to authenticated
  with check ((select public.is_admin()));
create policy "admins update invoices" on public.invoices for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant usage on sequence public.invoice_number_seq to authenticated;

create policy "owner reads updates, admins read all" on public.subscription_events for select to authenticated
  using ((select public.is_admin()) or (visible_to_customer and exists (
    select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = (select auth.uid()))));
create policy "admins post updates" on public.subscription_events for insert to authenticated
  with check ((select public.is_admin()));

create policy "admins manage private details" on public.subscription_private for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
