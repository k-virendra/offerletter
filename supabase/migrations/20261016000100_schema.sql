-- Offer Letter PDF: core schema.
-- Letter wording lives in clause_variants and field_definitions (seeded from content/), never in app code.
-- Row Level Security, grants and guard triggers are in the following migrations.

create type public.user_role as enum ('user', 'admin');
create type public.paper_size as enum ('a4', 'letter');
create type public.review_status as enum ('draft', 'in_review', 'approved');
create type public.letter_status as enum ('draft', 'paid');
create type public.payment_status as enum ('initiated', 'pending', 'success', 'failed', 'refunded');
create type public.field_type as enum ('text', 'long_text', 'date', 'money', 'number', 'select', 'email', 'phone', 'address', 'yes_no');
create type public.abuse_status as enum ('new', 'investigating', 'closed');
create type public.price_purpose as enum ('display', 'charge');

-- ---------------------------------------------------------------------------------------------------------------
-- People and companies
-- ---------------------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (char_length(full_name) <= 120),
  role public.user_role not null default 'user',
  company_limit integer not null default 5 check (company_limit between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.company_limit is 'How many companies the user may save (archived ones count). Only admins change it.';

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 200),
  trading_name text check (char_length(trading_name) <= 200),
  registered_address text not null check (char_length(btrim(registered_address)) between 1 and 500),
  registration_number text not null check (char_length(btrim(registration_number)) between 1 and 100),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  website text check (website is null or (website ~* '^https?://[^\s]+\.[^\s]+$' and char_length(website) <= 300)),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 3 and 40),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 254),
  logo_path text check (logo_path is null or char_length(logo_path) <= 300),
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  signatory_name text not null check (char_length(btrim(signatory_name)) between 1 and 120),
  signatory_title text not null check (char_length(btrim(signatory_title)) between 1 and 120),
  archived_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text check (char_length(suspended_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_suspension_reason check (suspended_at is null or suspended_reason is not null)
);
create index companies_owner_idx on public.companies (owner_id);
comment on column public.companies.country_code is 'ISO 3166-1 country of registration. Not necessarily where the job is.';

-- ---------------------------------------------------------------------------------------------------------------
-- Reference data: countries, letter styles, sections, clauses, fields
-- ---------------------------------------------------------------------------------------------------------------

create table public.jurisdictions (
  code text primary key check (code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  parent_code text references public.jurisdictions (code) on update cascade,
  name text not null check (char_length(name) between 1 and 100),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  locale text not null check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  paper_size public.paper_size not null,
  enabled boolean not null default false,
  selectable boolean not null default true,
  sort_order integer not null default 0,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jurisdictions_not_own_parent check (parent_code is distinct from code)
);
comment on column public.jurisdictions.selectable is 'False for grouping rows such as CA that users never pick on their own.';

create table public.templates (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 300),
  thumbnail_path text,
  default_accent text not null check (default_accent ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.templates is 'Letter styles (Classic, Modern, ...). The layouts themselves are React components keyed by templates.key.';

create table public.sections (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  default_title text not null check (char_length(default_title) between 1 and 120),
  default_order integer not null,
  help_text text check (char_length(help_text) <= 500),
  always_included boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.sections.always_included is 'Core sections (candidate, role, pay, signatures) that no country lets users remove.';

create table public.clause_variants (
  id uuid primary key default gen_random_uuid(),
  section_key text not null references public.sections (key) on update cascade,
  jurisdiction_code text not null references public.jurisdictions (code) on update cascade,
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  title text check (char_length(title) <= 120),
  body text not null check (char_length(body) between 1 and 20000),
  locked boolean not null default false,
  locked_reason text check (char_length(locked_reason) <= 120),
  version integer not null default 1 check (version >= 1),
  review_status public.review_status not null default 'draft',
  reviewer text check (char_length(reviewer) <= 200),
  reviewed_at timestamptz,
  legal_notes text,
  source_file text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clause_variants_version_unique unique (section_key, jurisdiction_code, language, version),
  constraint clause_variants_approval_needs_reviewer check (review_status <> 'approved' or (reviewer is not null and reviewed_at is not null)),
  constraint clause_variants_lock_needs_reason check (not locked or locked_reason is not null)
);
create index clause_variants_lookup_idx on public.clause_variants (jurisdiction_code, section_key, language, version desc);
comment on column public.clause_variants.legal_notes is 'For admins only: never selectable by signed-in users (see column grants).';

create table public.field_definitions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  section_key text not null references public.sections (key) on update cascade,
  label text not null check (char_length(label) between 1 and 120),
  type public.field_type not null,
  required boolean not null default false,
  options jsonb check (options is null or jsonb_typeof(options) = 'array'),
  validation jsonb not null default '{}' check (jsonb_typeof(validation) = 'object'),
  help_text text check (char_length(help_text) <= 300),
  placeholder text check (char_length(placeholder) <= 120),
  sort_order integer not null default 0,
  jurisdiction_overrides jsonb not null default '{}' check (jsonb_typeof(jurisdiction_overrides) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An offer letter never needs government ID numbers; refuse to define fields for them.
  constraint field_definitions_no_government_ids check (
    key !~* '(passport|social_?security|ssn|tax_?(id|number|file)|tfn|national_?(id|insurance)|sin_?number|ird_?number|steuer|bsn|pps)'
  ),
  constraint field_definitions_select_has_options check (type <> 'select' or options is not null)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Letters and issued versions
-- ---------------------------------------------------------------------------------------------------------------

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  jurisdiction_code text not null references public.jurisdictions (code) on update cascade,
  template_key text not null references public.templates (key) on update cascade,
  name text not null default 'Untitled letter' check (char_length(btrim(name)) between 1 and 200),
  field_values jsonb not null default '{}' check (jsonb_typeof(field_values) = 'object' and pg_column_size(field_values) < 100000),
  removed_sections text[] not null default '{}' check (cardinality(removed_sections) <= 50),
  pinned_clauses jsonb not null default '{}' check (jsonb_typeof(pinned_clauses) = 'object'),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  status public.letter_status not null default 'draft',
  paid_at timestamptz,
  current_version integer not null default 0 check (current_version >= 0),
  correction_until timestamptz,
  edited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint letters_paid_consistency check ((status = 'paid') = (paid_at is not null))
);
create index letters_author_idx on public.letters (author_id, updated_at desc);
create index letters_company_idx on public.letters (company_id);
create index letters_stale_drafts_idx on public.letters (edited_at) where status = 'draft';
comment on column public.letters.pinned_clauses is 'section_key -> clause_variants.id used when the letter was issued. Set by the server.';

create table public.letter_versions (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters (id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  company_snapshot jsonb not null check (jsonb_typeof(company_snapshot) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  pdf_path text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  constraint letter_versions_unique unique (letter_id, version)
);
comment on table public.letter_versions is 'Immutable snapshot of each issued version. Only pdf_path may be filled in once, by the server.';

-- ---------------------------------------------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------------------------------------------

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  product text not null default 'offer_letter' check (product ~ '^[a-z_]{3,40}$'),
  purpose public.price_purpose not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor integer not null check (amount_minor > 0),
  active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index prices_one_active_idx on public.prices (product, purpose) where active;
comment on column public.prices.purpose is 'display: the price shown to users. charge: the amount and currency sent to PayU.';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid references public.letters (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  txnid text not null unique check (txnid ~ '^[A-Za-z0-9_-]{8,40}$'),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  display_amount_minor integer check (display_amount_minor > 0),
  display_currency text check (display_currency ~ '^[A-Z]{3}$'),
  status public.payment_status not null default 'initiated',
  payu_payment_id text,
  billing jsonb not null default '{}' check (jsonb_typeof(billing) = 'object'),
  raw_responses jsonb not null default '[]' check (jsonb_typeof(raw_responses) = 'array'),
  verified_at timestamptz,
  refunded_at timestamptz,
  refund_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_letter_idx on public.payments (letter_id);
create index payments_pending_idx on public.payments (created_at) where status in ('initiated', 'pending');
comment on column public.payments.raw_responses is 'PayU responses as received (never card data). Appended by the server.';

-- ---------------------------------------------------------------------------------------------------------------
-- Records: downloads, audit log, misuse reports, rate limits
-- ---------------------------------------------------------------------------------------------------------------

create table public.downloads (
  id bigint generated always as identity primary key,
  letter_version_id uuid references public.letter_versions (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'final' check (kind in ('final', 'preview')),
  created_at timestamptz not null default now()
);
create index downloads_version_idx on public.downloads (letter_version_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  entity_type text not null check (char_length(entity_type) between 1 and 60),
  entity_id text,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_email text check (reporter_email is null or reporter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company_name text check (char_length(company_name) <= 200),
  letter_reference text check (char_length(letter_reference) <= 200),
  description text not null check (char_length(btrim(description)) between 10 and 5000),
  company_id uuid references public.companies (id) on delete set null,
  status public.abuse_status not null default 'new',
  admin_notes text,
  handled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index abuse_reports_status_idx on public.abuse_reports (status, created_at desc);

create table public.rate_limits (
  key text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
