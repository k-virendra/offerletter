import type { FieldValues, LetterContext, LetterState } from "./types";

// Free corrections: for seven days after payment a paid letter can be fixed and issued again, with the wording it
// was paid with. It must stay the same offer: the candidate and the job can't change.

export const LOCKED_IN_CORRECTIONS = ["candidate.full_name", "position.job_title"] as const;

// Answers are text or yes/no; an empty answer is the same as none.
const plain = (value: unknown) => (value === undefined || value === "" ? null : value);
const same = (a: unknown, b: unknown) => plain(a) === plain(b);

/** The first locked field whose value differs, or null. */
export function changedLockedField(before: FieldValues, after: FieldValues): string | null {
  return LOCKED_IN_CORRECTIONS.find((key) => !same(before[key], after[key])) ?? null;
}

/** Copies the locked fields from the issued letter over whatever the correction has. */
export function keepLockedFields(issued: FieldValues, values: FieldValues): FieldValues {
  const kept = { ...values };
  for (const key of LOCKED_IN_CORRECTIONS) {
    if (issued[key] === undefined) delete kept[key];
    else kept[key] = issued[key];
  }
  return kept;
}

/** What a correction changes, in words for the version history ("Start date", "Probation removed"). */
export function correctionChanges(context: LetterContext, before: LetterState, after: LetterState, companyChanged = false): string[] {
  const changes: string[] = [];
  for (const field of context.fields) {
    if (!same(before.values[field.key], after.values[field.key])) changes.push(field.label);
  }
  const sectionTitle = (key: string) => context.clauses[key]?.title || context.sections.find((s) => s.key === key)?.title || key;
  for (const key of after.removedSections) if (!before.removedSections.includes(key)) changes.push(`${sectionTitle(key)} removed`);
  for (const key of before.removedSections) if (!after.removedSections.includes(key)) changes.push(`${sectionTitle(key)} restored`);
  if (before.templateKey !== after.templateKey) changes.push("Letter style");
  if ((before.accentColor ?? null) !== (after.accentColor ?? null)) changes.push("Brand colour");
  if (companyChanged) changes.push("Company details");
  return changes;
}

/** "Corrected: Start date, Salary", at most 300 characters (the column's limit). */
export function correctionNote(changes: string[]): string {
  const note = `Corrected: ${changes.join(", ")}`;
  return note.length <= 300 ? note : `${note.slice(0, 298).trimEnd()}…`;
}
