import { letterSections } from "./fields";
import type { LetterContext, ResolvedClause, SectionDefinition } from "./types";

// Translated letters. A country whose own language isn't English (Germany, the Netherlands) also gets its letters
// in that language: the same answers, built from reviewed clauses and phrases in that language. The English
// version prevails, which the translation says on every page. Text people type appears as they typed it.

export type TranslationContent = {
  language: string;
  locale: string;
  /** Clauses in the language, resolved for the jurisdiction like the English ones. */
  clauses: Record<string, ResolvedClause>;
  /** Phrases in the language: the letter's fixed wording, section.<key> titles and option.<field>.<value> answers. */
  phrases: Record<string, string>;
};

/** A language's name: "Deutsch" in itself, or "German" with displayIn "en". */
export function languageName(language: string, displayIn = language): string {
  const name = new Intl.DisplayNames([displayIn], { type: "language" }).of(language) ?? language;
  return name.charAt(0).toLocaleUpperCase(displayIn) + name.slice(1);
}

/**
 * The English wording turned into a translation's: its clauses, phrases, section titles, printed answers and
 * date and money formats. Fields, sections and locks stay the English ones, so the same answers fill both.
 */
export function translateContext(english: LetterContext, translation: TranslationContent): LetterContext {
  const { language, locale, phrases } = translation;
  const regionName = (code: string, fallback: string) =>
    /^[A-Z]{2}$/.test(code) ? (new Intl.DisplayNames([language], { type: "region" }).of(code) ?? fallback) : fallback;
  // The translation's own jurisdiction doesn't point at a further translation.
  const jurisdiction = { ...english.jurisdiction };
  delete jurisdiction.translation;
  const countryCode = english.jurisdiction.code.slice(0, 2);

  const clauses: Record<string, ResolvedClause> = {};
  for (const [key, clause] of Object.entries(translation.clauses)) {
    const original = english.clauses[key];
    if (original) clauses[key] = { ...clause, locked: original.locked, lockedReason: original.lockedReason };
  }

  return {
    ...english,
    language,
    jurisdiction: {
      ...jurisdiction,
      locale,
      name: regionName(jurisdiction.code, jurisdiction.name),
      countryName: regionName(countryCode, jurisdiction.countryName),
    },
    sections: english.sections.map((section) => {
      const title = phrases[`section.${section.key}`];
      return { ...section, title: title ?? section.title, shortTitle: phrases[`section.${section.key}.short`] ?? title ?? section.shortTitle };
    }),
    clauses,
    fields: english.fields.map((field) =>
      field.options.length ? { ...field, options: field.options.map((option) => ({ ...option, label: phrases[`option.${field.key}.${option.value}`] ?? option.label })) } : field,
    ),
    phrases: { ...english.phrases, ...phrases },
  };
}

/**
 * Sections of the English letter that the translation has no clause for. A translation is issued only when there
 * are none: a letter never leaves a section out in one language.
 */
export function untranslatedSections(english: LetterContext, translated: LetterContext, removedSections: string[]): SectionDefinition[] {
  return letterSections(english, removedSections).filter((section) => !translated.clauses[section.key]);
}

/** The translation to issue with a letter: only one that covers every section the English letter has. */
export function coveredTranslation(english: LetterContext, translated: LetterContext | null | undefined, removedSections: string[]): LetterContext | null {
  return translated && !untranslatedSections(english, translated, removedSections).length ? translated : null;
}
