-- Layout details the letter styles need, and the short phrases that frame every letter (labels, signature blocks,
-- the fee line). Like clauses, phrases live in the database, seeded from content/letter-phrases.yaml.

alter table public.sections
  add column short_title text check (char_length(short_title) between 1 and 40),
  add column show_heading boolean not null default true,
  add column varies_by_country boolean not null default false;

comment on column public.sections.short_title is 'Label for compact styles such as Minimal ("Salary" instead of "Annual salary and pay").';
comment on column public.sections.show_heading is 'False for the opening and the signatures, which read as part of the letter rather than as sections.';
comment on column public.sections.varies_by_country is 'Shows a country badge in the editor, because the wording follows local law.';

alter table public.clause_variants
  add column editor_help text check (char_length(editor_help) <= 500);

comment on column public.clause_variants.editor_help is 'Shown to users above the section''s fields in the editor, e.g. legal limits for that country.';

alter table public.field_definitions
  add column default_value jsonb check (default_value is null or jsonb_typeof(default_value) in ('string', 'boolean'));

comment on column public.field_definitions.default_value is 'Filled in when a letter is created, e.g. "statutory" notice. Countries can override it.';

-- Signed-in users read every column except legal_notes (see 20261016000300_security.sql).
grant select (editor_help) on public.clause_variants to authenticated;

create table public.letter_phrases (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  jurisdiction_code text references public.jurisdictions (code) on update cascade,
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint letter_phrases_unique unique nulls not distinct (key, jurisdiction_code, language)
);
comment on table public.letter_phrases is 'Fixed wording around the clauses. A row without a jurisdiction is the default; a country row overrides it.';

create trigger set_updated_at before update on public.letter_phrases for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.letter_phrases for each row execute function public.audit_change();

alter table public.letter_phrases enable row level security;
revoke all on public.letter_phrases from anon;
revoke truncate on public.letter_phrases from authenticated;

create policy "signed-in users can read phrases" on public.letter_phrases for select to authenticated using (true);
create policy "admins manage phrases" on public.letter_phrases for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
