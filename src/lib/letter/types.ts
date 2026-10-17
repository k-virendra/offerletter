// The data a letter is built from (LetterContext + LetterState + company), and the style-independent document
// every letter style renders (LetterDocument). Everything here is plain JSON so it can cross from server to client.

export type FieldType = "text" | "long_text" | "date" | "money" | "number" | "select" | "email" | "phone" | "address" | "yes_no";
export type PaperSize = "a4" | "letter";
export type FieldValue = string | boolean;
export type FieldValues = Record<string, FieldValue | undefined>;

export type FieldDefinition = {
  key: string;
  sectionKey: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: { value: string; label: string }[];
  validation: { min?: number; max?: number; step?: number; max_length?: number; future?: boolean };
  help: string | null;
  placeholder: string | null;
  /** Filled in when a letter is created. */
  defaultValue: FieldValue | null;
  sortOrder: number;
};

export type SectionDefinition = {
  key: string;
  title: string;
  shortTitle: string;
  order: number;
  alwaysIncluded: boolean;
  showHeading: boolean;
  variesByCountry: boolean;
  help: string | null;
};

export type ResolvedClause = {
  id: string;
  sectionKey: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  title: string | null;
  body: string;
  locked: boolean;
  lockedReason: string | null;
  editorHelp: string | null;
  reviewStatus: "draft" | "in_review" | "approved";
  version: number;
};

export type Jurisdiction = {
  code: string;
  name: string;
  /** Name for "<country> wording" badges and labels: the top-level country, e.g. "United States". */
  countryName: string;
  currency: string;
  locale: string;
  paperSize: PaperSize;
};

export type LetterTemplate = { key: string; name: string; description: string | null; defaultAccent: string };

/** Reference data for one jurisdiction, resolved on the server. */
export type LetterContext = {
  jurisdiction: Jurisdiction;
  sections: SectionDefinition[];
  /** The clause each section uses in this jurisdiction. Sections without one are left out of the letter. */
  clauses: Record<string, ResolvedClause>;
  fields: FieldDefinition[];
  templates: LetterTemplate[];
  phrases: Record<string, string>;
};

export type LetterCompany = {
  id: string;
  legalName: string;
  tradingName: string | null;
  registeredAddress: string;
  registrationNumber: string;
  countryName: string;
  website: string | null;
  contactPhone: string;
  contactEmail: string;
  brandColor: string | null;
  logo: { url: string; width: number; height: number } | null;
};

/** What the user edits. Saved on the letter row. */
export type LetterState = {
  name: string;
  templateKey: string;
  accentColor: string | null;
  values: FieldValues;
  removedSections: string[];
};

// --- The rendered document ---------------------------------------------------------------------------------------

export type Run =
  | { kind: "text"; text: string }
  /** A filled-in value. `field` is the form field it came from (for jumping to it). */
  | { kind: "value"; text: string; field: string }
  /** A required field that is still empty: a chip in the preview. */
  | { kind: "missing"; field: string; label: string }
  | { kind: "strong"; children: Run[] }
  | { kind: "em"; children: Run[] };

export type Block =
  | { kind: "paragraph"; runs: Run[] }
  | { kind: "heading"; runs: Run[] }
  | { kind: "list"; ordered: boolean; items: Run[][] }
  | { kind: "table"; align: ("left" | "right")[]; header: Run[][]; rows: Run[][][] };

export type DocumentSection = {
  key: string;
  title: string;
  shortTitle: string;
  showHeading: boolean;
  /** 1-based number among the sections that show a heading (Modern numbers them). */
  number: number | null;
  blocks: Block[];
};

export const SIGNATURE_STYLES = ["flowing", "quick", "hand"] as const;
export type TypedSignature = { text: string; style: (typeof SIGNATURE_STYLES)[number] };

export type LetterDocument = {
  paperSize: PaperSize;
  templateKey: string;
  /** Accent for text (darkened when the brand colour is too light) and a pale tint of it for fills. */
  accent: string;
  tint: string;
  company: {
    legalName: string;
    displayName: string;
    /** The name without its legal form ("Example Engineering"), and upper-case for text letterheads. */
    brand: string;
    wordmark: string;
    addressLines: string[];
    registration: string;
    website: string | null;
    phone: string;
    email: string;
    countryName: string;
    logo: LetterCompany["logo"];
  };
  recipient: { name: Run[]; addressLines: string[] };
  date: string;
  dateLine: Run[];
  place: Run[];
  /** "Offer of employment" and the job title, kept apart so styles can lay them out differently. */
  title: { label: string; subject: Run[] };
  /** The opening (greeting and introduction) and the closing (reply and sign-off) have no headings. */
  opening: Block[];
  sections: DocumentSection[];
  closing: Block[];
  signatures: {
    /** `signature`: the signatory's name drawn in handwriting above the line, or null to sign with a pen. */
    company: { heading: string; note: string; name: Run[]; title: Run[]; place: Run[]; signature: TypedSignature | null };
    candidate: { heading: string; note: string; name: Run[] };
    placeLabel: string;
    dateLabel: string;
  };
  /** For summary boxes. `short` drops words such as "gross" where a style has little room. */
  keyFacts: { id: string; label: string; value: Run[]; short?: Run[] }[];
  runningHeader: Run[];
  feeLine: string;
  addressedTo: Run[];
  phrases: Record<string, string>;
  /** Some wording hasn't been reviewed by a lawyer yet (only possible in development). */
  unreviewed: boolean;
};
