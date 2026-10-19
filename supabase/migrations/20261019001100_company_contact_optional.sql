-- A company's contact phone and email are optional. Letters leave out what's missing (the existing checks still
-- apply to any value given).
alter table public.companies
  alter column contact_phone drop not null,
  alter column contact_email drop not null;
