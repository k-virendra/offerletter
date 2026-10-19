import { describe, expect, it } from "vitest";
import { translationMismatch } from "../template/clause-check";
import { buildLetterDocument, runsText } from "./build";
import { moveToJurisdiction } from "./fields";
import { EXAMPLE_ENGINEERING, sampleValues } from "./samples";
import { contextFor, translatedContextFor } from "./test-context";
import { languageName, untranslatedSections } from "./translation";
import type { Block, LetterDocument, LetterState } from "./types";

// Translated letters: the same answers as the English letter, in the country's language, from reviewed content.

const TODAY = "2026-10-16";

function state(code: string, changes: Partial<LetterState> = {}): LetterState {
  const base: LetterState = { name: "Sample", templateKey: "classic", accentColor: null, values: sampleValues(code), removedSections: [] };
  return { ...moveToJurisdiction(contextFor(code), base).state, ...changes };
}

const blockText = (block: Block): string =>
  block.kind === "list" ? block.items.map(runsText).join("\n") : block.kind === "table" ? block.rows.flat().map(runsText).join(" | ") : runsText(block.runs);

// Intl puts no-break spaces in amounts ("78.000 €").
const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");
const text = (doc: LetterDocument) =>
  plain([doc.title.label, runsText(doc.dateLine), ...doc.opening.map(blockText), ...doc.sections.flatMap((s) => [s.title, ...s.blocks.map(blockText)]), ...doc.closing.map(blockText), doc.feeLine].join("\n"));

describe("translated letters", () => {
  it("German: wording, dates, money and answers in German, typed text as typed", () => {
    const doc = buildLetterDocument(translatedContextFor("DE"), EXAMPLE_ENGINEERING, state("DE"), { date: TODAY });
    const letter = text(doc);
    expect(doc.language).toBe("de");
    expect(doc.title.label).toBe("Arbeitsangebot");
    expect(letter).toContain("Guten Tag Lena,");
    expect(letter).toContain("Ihr Arbeitsverhältnis beginnt am 1. Dezember 2026.");
    expect(letter).toContain("Ihr jährliches Bruttogehalt beträgt 78.000 €.");
    expect(letter).toContain("Die ersten 6 Monate Ihres Arbeitsverhältnisses sind eine Probezeit.");
    expect(letter).toContain("Kündigungsfristen");
    expect(runsText(doc.dateLine)).toBe("Munich, 16. Oktober 2026");
    // What people typed stays as they typed it.
    expect(letter).toContain("Ihr Arbeitsort: our Munich office, with up to two days of remote work a week.");
    expect(doc.feeLine).toBe("Example Engineering GmbH erhebt von Bewerberinnen und Bewerbern keine Gebühren. · Übersetzung zur Information – maßgeblich ist die englische Fassung.");
    expect(doc.keyFacts.find((fact) => fact.id === "annual_salary")).toMatchObject({ label: "Jahresgehalt" });
    expect(plain(runsText(doc.keyFacts.find((fact) => fact.id === "annual_salary")!.value))).toBe("78.000 € brutto");
    expect(doc.sections.map((s) => s.shortTitle)).toContain("Probezeit");
  });

  it("Dutch: the same answers in Dutch", () => {
    const doc = buildLetterDocument(translatedContextFor("NL"), EXAMPLE_ENGINEERING, state("NL"), { date: TODAY });
    const letter = text(doc);
    expect(doc.title.label).toBe("Arbeidsaanbod");
    expect(letter).toContain("Uw dienstverband begint op 1 december 2026.");
    expect(letter).toContain("Uw brutosalaris bedraagt € 78.000 per jaar");
    expect(letter).toContain("een proeftijd van 2 maanden");
    expect(letter).toContain("Op uw dienstverband is deze cao van toepassing: CAO voor de Metaal en Techniek.");
    expect(doc.feeLine).toContain("de Engelse versie is leidend");
  });

  it("builds from the same sections as the English letter, and English letters don't change", () => {
    const english = buildLetterDocument(contextFor("DE"), EXAMPLE_ENGINEERING, state("DE"), { date: TODAY });
    const german = buildLetterDocument(translatedContextFor("DE"), EXAMPLE_ENGINEERING, state("DE", { removedSections: ["bonus"] }), { date: TODAY });
    expect(english.language).toBe("en");
    expect(english.feeLine).toBe("Example Engineering GmbH never charges candidates fees.");
    expect(german.sections.map((s) => s.key)).toEqual(english.sections.map((s) => s.key).filter((key) => key !== "bonus"));
  });

  it("isn't issued when a section has no translated clause", () => {
    const english = contextFor("DE");
    const german = translatedContextFor("DE");
    expect(untranslatedSections(english, german, [])).toEqual([]);
    const clauses = { ...german.clauses };
    delete clauses.bonus;
    expect(untranslatedSections(english, { ...german, clauses }, []).map((s) => s.key)).toEqual(["bonus"]);
    expect(untranslatedSections(english, { ...german, clauses }, ["bonus"])).toEqual([]);
  });

  it("keeps the English locks", () => {
    expect(translatedContextFor("DE").clauses.notice).toMatchObject({ locked: true, lockedReason: "Required in Germany" });
  });

  it("names languages in themselves", () => {
    expect(languageName("de")).toBe("Deutsch");
    expect(languageName("nl")).toBe("Nederlands");
  });
});

describe("translationMismatch", () => {
  const english = "You report to {{position.reports_to}}{{#if position.department}} in {{position.department}}{{/if}}.";
  it("accepts a translation with the same values and conditions", () => {
    expect(translationMismatch(english, "Sie berichten an {{position.reports_to}}{{#if position.department}} im Team {{position.department}}{{/if}}.")).toBeNull();
  });
  it("catches a value left out, added or a different condition", () => {
    expect(translationMismatch(english, "Sie berichten an {{position.reports_to}}.")).toBe("the translation leaves out {{position.department}}");
    expect(translationMismatch(english, "{{position.reports_to}} {{position.department}} {{position.job_title}}")).toContain("prints {{position.job_title}}");
    expect(translationMismatch("{{#if a.b}}x{{/if}}", "{{#if a.c}}x{{/if}}")).toContain("conditions differ");
  });
});
