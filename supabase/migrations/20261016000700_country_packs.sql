-- Country packs: fields that apply only in some countries, and a short public note per country (shown when a
-- country or state is chosen, e.g. why Quebec isn't available yet).

alter table public.field_definitions
  add column jurisdictions text[] check (jurisdictions is null or cardinality(jurisdictions) between 1 and 50);

comment on column public.field_definitions.jurisdictions is
  'Countries the field applies to (a country includes its states and provinces). Null means every country.';

alter table public.jurisdictions
  add column public_note text check (char_length(public_note) <= 300);

comment on column public.jurisdictions.public_note is 'Shown to users choosing this country, e.g. "Quebec letters must be in French".';
