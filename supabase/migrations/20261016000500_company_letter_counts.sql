-- Paid and draft letter counts per company, for the My companies screen. security_invoker makes the view run
-- with the caller's rights, so the letters RLS policies apply: users count only their own letters.

create view public.company_letter_counts with (security_invoker = true) as
select l.company_id,
       count(*) filter (where l.status = 'paid')::integer as paid,
       count(*) filter (where l.status = 'draft')::integer as drafts
from public.letters l
group by l.company_id;

revoke all on public.company_letter_counts from anon;
grant select on public.company_letter_counts to authenticated;
