import { z } from "zod";

// Schemas for the version-controlled content in content/. The seed script and the content tests share them, so a
// typo in a YAML file fails the tests before it can reach the database.

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a colour like #1F4E8C");
const sectionKey = z.string().regex(/^[a-z][a-z0-9_]{1,60}$/);
const jurisdictionCode = z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/);

export const jurisdictionSchema = z.strictObject({
  code: jurisdictionCode,
  parent_code: jurisdictionCode.optional(),
  name: z.string().min(1).max(100),
  currency: z.string().regex(/^[A-Z]{3}$/),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
  paper_size: z.enum(["a4", "letter"]),
  selectable: z.boolean().optional(),
  sort_order: z.number().int(),
  admin_notes: z.string().optional(),
  public_note: z.string().max(300).optional(),
});

export const templateSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  name: z.string().min(1).max(60),
  description: z.string().max(300),
  default_accent: hexColor,
  sort_order: z.number().int(),
});

export const sectionSchema = z.strictObject({
  key: sectionKey,
  default_title: z.string().min(1).max(120),
  short_title: z.string().min(1).max(40).optional(),
  default_order: z.number().int(),
  always_included: z.boolean().optional(),
  show_heading: z.boolean().optional(),
  varies_by_country: z.boolean().optional(),
  help_text: z.string().max(500).optional(),
});

export const fieldTypes = ["text", "long_text", "date", "money", "number", "select", "email", "phone", "address", "yes_no"] as const;

const fieldValidationSchema = z.strictObject({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  max_length: z.number().int().positive().optional(),
  future: z.boolean().optional(),
});

const optionSchema = z.strictObject({ value: z.string().min(1).max(40), label: z.string().min(1).max(80) });

const defaultValueSchema = z.union([z.string().min(1).max(200), z.boolean()]);

const fieldOverrideSchema = z.strictObject({
  label: z.string().min(1).max(120).optional(),
  default_value: defaultValueSchema.optional(),
  help_text: z.string().max(300).optional(),
  required: z.boolean().optional(),
  options: z.array(optionSchema).min(1).optional(),
  validation: fieldValidationSchema.optional(),
});

// An offer letter never needs government ID numbers. Mirrors the database constraint.
export const GOVERNMENT_ID_PATTERN =
  /(passport|social_?security|ssn|tax_?(id|number|file)|tfn|national_?(id|insurance)|sin_?number|ird_?number|steuer|bsn|pps)/i;

export const fieldSchema = z
  .strictObject({
    key: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
    section_key: sectionKey,
    label: z.string().min(1).max(120),
    type: z.enum(fieldTypes),
    required: z.boolean().optional(),
    options: z.array(optionSchema).min(1).optional(),
    validation: fieldValidationSchema.optional(),
    help_text: z.string().max(300).optional(),
    placeholder: z.string().max(120).optional(),
    default_value: defaultValueSchema.optional(),
    sort_order: z.number().int(),
    /** Countries the field applies to (with their states and provinces). Omitted: every country. */
    jurisdictions: z.array(jurisdictionCode).min(1).optional(),
    jurisdiction_overrides: z.record(jurisdictionCode, fieldOverrideSchema).optional(),
  })
  .refine((f) => !GOVERNMENT_ID_PATTERN.test(f.key), { message: "Fields for government ID numbers are not allowed" })
  .refine((f) => f.type !== "select" || (f.options?.length ?? 0) > 0, { message: "Select fields need options" });

export const priceSchema = z.strictObject({
  product: z.string().regex(/^[a-z_]{3,40}$/),
  purpose: z.enum(["display", "charge"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount_minor: z.number().int().positive(),
  active: z.boolean(),
  notes: z.string().optional(),
});

export const clauseSchema = z
  .strictObject({
    section: sectionKey,
    version: z.number().int().min(1).default(1),
    title: z.string().max(120).optional(),
    body: z.string().min(1).max(20000),
    locked: z.boolean().default(false),
    locked_reason: z.string().max(120).optional(),
    editor_help: z.string().max(500).optional(),
    legal_notes: z.string().optional(),
  })
  .refine((c) => !c.locked || Boolean(c.locked_reason), { message: "Locked clauses need a locked_reason" });

export const clauseFileSchema = z.strictObject({
  jurisdiction: jurisdictionCode,
  language: z.string().regex(/^[a-z]{2}$/).default("en"),
  clauses: z.array(clauseSchema),
});

const phraseKey = z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/);
const phraseText = z.string().min(1).max(300);

export const letterPhrasesSchema = z
  .strictObject({
    defaults: z.record(phraseKey, phraseText),
    overrides: z.record(jurisdictionCode, z.record(phraseKey, phraseText)).default({}),
  })
  .refine((p) => p.defaults.fee_line?.includes("{{company}}"), { message: "fee_line must name the company with {{company}}" })
  .refine((p) => Object.values(p.overrides).every((o) => o.fee_line === undefined || o.fee_line.includes("{{company}}")), {
    message: "Every fee_line must name the company with {{company}}",
  });

export type JurisdictionContent = z.infer<typeof jurisdictionSchema>;
export type TemplateContent = z.infer<typeof templateSchema>;
export type SectionContent = z.infer<typeof sectionSchema>;
export type FieldContent = z.infer<typeof fieldSchema>;
export type PriceContent = z.infer<typeof priceSchema>;
export type ClauseFileContent = z.infer<typeof clauseFileSchema>;
export type LetterPhrasesContent = z.infer<typeof letterPhrasesSchema>;
