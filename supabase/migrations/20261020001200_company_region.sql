-- Offer letters follow the company: a letter uses the wording for the company's country, and in the US and Canada
-- for its state or province, so New letter no longer asks where the job is. The state or province is an ISO 3166-2
-- code in the company's country.

alter table public.companies
  add column region_code text
    constraint companies_region_format check (region_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$')
    constraint companies_region_in_country check (left(region_code, 2) = country_code);

comment on column public.companies.country_code is 'ISO 3166-1 country of registration. Offer letters use its wording.';
comment on column public.companies.region_code is
  'ISO 3166-2 state or province (US and Canada). Letters use its wording, or the country''s where it has none.';
