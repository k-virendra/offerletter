-- Translated letters. Where a country's own language isn't English (Germany, the Netherlands), a paid letter also
-- comes as a reviewed translation, built from clauses and phrases in that language. The English version prevails.

alter table public.jurisdictions
  add column translation_language text check (translation_language ~ '^[a-z]{2}$' and translation_language <> 'en'),
  add column translation_locale text check (translation_locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  add constraint jurisdictions_translation_complete check ((translation_language is null) = (translation_locale is null));

comment on column public.jurisdictions.translation_language is
  'The country''s own language, when it isn''t English: paid letters also come in it once its clauses are approved.';
comment on column public.jurisdictions.translation_locale is 'Date and money formats for the translation, e.g. de-DE.';

-- The translation's PDF is stored next to the English one and, like it, set once and never replaced.
alter table public.letter_versions add column translated_pdf_path text check (char_length(translated_pdf_path) <= 300);
comment on column public.letter_versions.translated_pdf_path is
  'The PDF of the translation frozen in the snapshot (snapshot.translation), if there is one. Set once, by the server.';
comment on table public.letter_versions is
  'Immutable snapshot of each issued version. Only pdf_path and translated_pdf_path may be filled in once, by the server.';

create or replace function public.guard_letter_versions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.letter_id <> old.letter_id or new.version <> old.version or new.snapshot <> old.snapshot
     or new.company_snapshot <> old.company_snapshot or new.content_hash <> old.content_hash
     or new.note is distinct from old.note or new.created_at <> old.created_at then
    raise exception 'Issued letter versions cannot be changed' using errcode = 'P0001';
  end if;
  if (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
     or (old.translated_pdf_path is not null and new.translated_pdf_path is distinct from old.translated_pdf_path) then
    raise exception 'The PDF of an issued version cannot be replaced' using errcode = 'P0001';
  end if;
  return new;
end
$$;
