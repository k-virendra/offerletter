-- Payments carry the letter exactly as it was when the user pressed Pay: version 1 is issued from this snapshot,
-- so an edit made in another tab while PayU is open never changes what was paid for.

alter table public.payments
  add column letter_snapshot jsonb check (letter_snapshot is null or jsonb_typeof(letter_snapshot) = 'object'),
  add column company_snapshot jsonb check (company_snapshot is null or jsonb_typeof(company_snapshot) = 'object'),
  add column content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  add column failure_reason text check (char_length(failure_reason) <= 300),
  add column receipt_sent_at timestamptz;

comment on column public.payments.letter_snapshot is 'The letter frozen at checkout; version 1 is issued from it once PayU confirms.';
comment on column public.payments.failure_reason is 'PayU''s reason for a failed payment, in words shown to the user.';

-- The frozen letter can't be swapped after checkout starts.
create function public.guard_payment_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.letter_snapshot is not null and (new.letter_snapshot is distinct from old.letter_snapshot
      or new.company_snapshot is distinct from old.company_snapshot or new.content_hash is distinct from old.content_hash) then
    raise exception 'The letter frozen for a payment cannot change' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger guard_snapshot before update on public.payments for each row execute function public.guard_payment_snapshot();

-- PayU's browser return and its webhook can arrive at the same moment: append to the log atomically.
create function public.append_payment_response(p_txnid text, p_entry jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.payments
  set raw_responses = case when jsonb_array_length(raw_responses) >= 50 then raw_responses else raw_responses || jsonb_build_array(p_entry) end
  where txnid = p_txnid
$$;

revoke execute on function public.append_payment_response(text, jsonb) from public, anon, authenticated;
grant execute on function public.append_payment_response(text, jsonb) to service_role;
