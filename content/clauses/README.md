# Clauses

One YAML file per jurisdiction. Every clause is seeded as a **draft** and must be reviewed by a qualified lawyer
before the jurisdiction can be switched on. Never edit a reviewed clause in place: add the same section again with
a higher `version`, and the seed script adds it as a new draft.

```yaml
jurisdiction: DE
clauses:
  - section: notice
    version: 1
    locked: true
    locked_reason: Required in Germany
    editor_help: Germany requires notice periods in the written terms of employment.
    legal_notes: For reviewers only, never shown to users.
    body: |
      After probation, the notice periods in section 622 of the German Civil Code (BGB) apply.
```

## Which clause a letter uses

The most specific approved clause wins: a New York letter uses `us-ny.yaml` where it has a section and falls back
to `us.yaml` for the rest. Canada works the same way (`ca.yaml` plus a province file). A section with no clause for
the country is left out of the letter. A section is locked when its most specific clause is `locked`.

## Writing a clause

Bodies use a small Markdown subset: paragraphs, `### ` sub-headings, `- ` lists, pipe tables with a `|---|---:|`
separator, `**bold**` and `*italic*`. Anything else, HTML included, is printed as plain text.

Placeholders and conditions:

```
{{position.job_title}}
{{#if position.department}} in our {{position.department}} team{{/if}}
{{#if notice.option == "custom"}}…{{else}}…{{/if}}
{{#if a.b or c.d}}  {{#if a.b and not c.d}}  {{#unless a.b}}…{{/unless}}
```

Rules the content tests enforce (`pnpm test`):

- Placeholders must be defined in `content/fields.yaml` or be built-in values such as `{{company.legal_name}}`.
- A clause may **print** fields from its own section or from the sections every letter has (candidate, position,
  compensation, acceptance). Conditions may test any field: one that doesn't exist is simply false.
- A field limited to some countries (`jurisdictions:` in `fields.yaml`) can only be used by those countries' clauses.
- An empty value printed outside an `{{#if}}` shows as a chip and blocks payment, so wrap optional values in
  `{{#if}}` together with their words.

`src/lib/letter/__snapshots__/country-packs.test.ts.snap` holds the text of a complete sample letter for every
launch jurisdiction. After changing wording, run `pnpm test -u` and review the snapshot diff with the lawyer.

## Translations

Where a country's own language isn't English, paid letters also come translated, as a second PDF at no extra
cost. The English version prevails, and the translation says so in its footer on every page. `translation` in
`content/jurisdictions.yaml` names the language (Germany: `de`, the Netherlands: `nl`).

- `<country>.<language>.yaml` (e.g. `de.de.yaml`) translates the country's English clauses with `language: de`.
  Every section with an English clause needs a translation that prints the same placeholders and tests the same
  conditions; the content tests check this, and so does the admin clause editor before saving or approving.
- Locks and editor help come from the English clauses, so translations leave out `locked` and `editor_help`.
- `letter-phrases.yaml` → `languages.<language>` translates the fixed wording: every default phrase, section
  titles (`section.<key>`, optionally `section.<key>.short`), printed answers (`option.<field>.<value>`) and
  `translation_notice`.
- Text people type (job title, place of work, benefits…) appears as typed, so set free text off with a colon
  rather than building a sentence around it.
- Translations are reviewed like English clauses. A letter comes translated only when every section in it has an
  approved translation (drafts count in local development); otherwise it's issued in English only.
