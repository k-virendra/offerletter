import { z } from "zod";
import { normalizeHex } from "@/lib/color";
import { COUNTRY_CODES, REGIONS } from "@/lib/countries";

// One schema for the company form, used by the browser (react-hook-form) and again by the server action.
// Messages follow the validation catalogue on the design canvas.

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

const tooLong = (max: number) => `Keep this under ${max} characters`;

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max, tooLong(max));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, tooLong(max))
    .transform((value) => value || null);

/** "example.com" becomes "https://example.com"; returns null when it isn't a usable web address. */
export function normalizeWebsite(value: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol) || !/\.[a-z]{2,}$/i.test(url.hostname) || /\s/.test(value)) return null;
    return withScheme;
  } catch {
    return null;
  }
}

const website = z
  .string()
  .trim()
  .max(300, tooLong(300))
  .transform((value, ctx) => {
    if (!value) return null;
    const url = normalizeWebsite(value);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "Enter a full web address, like https://company.com" });
      return z.NEVER;
    }
    return url;
  });

// Optional: an empty contact email or phone is saved as nothing, and letters leave it out.
const contactEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, tooLong(254))
  .superRefine((value, ctx) => {
    if (!value) return;
    const [local, domain, extra] = value.split("@");
    if (!local || !domain || extra !== undefined) {
      return ctx.addIssue({ code: "custom", message: "Enter a full email address, like name@company.com" });
    }
    if (!domain.includes(".")) return ctx.addIssue({ code: "custom", message: "Add the ending, like .com" });
    if (!z.email().safeParse(value).success) {
      ctx.addIssue({ code: "custom", message: "Enter a full email address, like name@company.com" });
    }
  })
  .transform((value) => value || null);

const contactPhone = z
  .string()
  .trim()
  .max(40, tooLong(40))
  .superRefine((value, ctx) => {
    if (!value) return;
    const digits = value.replace(/\D/g, "").length;
    if (!/^\+[\d\s().-]+$/.test(value) || digits < 7 || digits > 15) {
      ctx.addIssue({ code: "custom", message: "Enter a phone number with the country code, like +49 89 1234 5678" });
    }
  })
  .transform((value) => value || null);

const brandColor = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const hex = normalizeHex(value);
    if (!hex) {
      ctx.addIssue({ code: "custom", message: "Enter a colour code, like #1F4E8C" });
      return z.NEVER;
    }
    return hex;
  });

export const companySchema = z
  .object({
    legal_name: requiredText(200, "Enter the company’s legal name"),
    trading_name: optionalText(200),
    country_code: z.enum(COUNTRY_CODES, { message: "Choose the country where the company is registered" }),
    // US and Canadian companies also give their state or province: letters use its wording. Ignored elsewhere.
    region_code: z
      .string()
      .trim()
      .transform((value) => value || null),
    registration_number: requiredText(100, "Enter the registration number, like HRB 123456"),
    registered_address: requiredText(500, "Enter the registered address"),
    website,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    brand_color: brandColor,
    signatory_name: requiredText(120, "Enter the name of the person who signs letters"),
    signatory_title: requiredText(120, "Enter the signatory’s job title"),
  })
  .superRefine((values, ctx) => {
    const regions = REGIONS[values.country_code];
    if (!regions) return;
    const noun = regions.label === "State" ? "state" : "province or territory";
    if (!values.region_code) ctx.addIssue({ code: "custom", path: ["region_code"], message: `Choose the ${noun} where the company is based` });
    else if (!regions.options.some((region) => region.code === values.region_code)) {
      ctx.addIssue({ code: "custom", path: ["region_code"], message: `Choose a ${noun} in ${values.country_code === "US" ? "the United States" : "Canada"}` });
    }
    // Checked alongside the other fields' errors, not only once they're fixed.
  }, { when: (payload) => typeof payload.value === "object" && payload.value !== null });

export type CompanyFormInput = z.input<typeof companySchema>;
export type CompanyValues = z.output<typeof companySchema>;
export type CompanyField = keyof CompanyFormInput;

export const COMPANY_FIELDS = Object.keys(companySchema.shape) as CompanyField[];

export const EMPTY_COMPANY: CompanyFormInput = {
  legal_name: "",
  trading_name: "",
  country_code: "",
  region_code: "",
  registration_number: "",
  registered_address: "",
  website: "",
  contact_phone: "",
  contact_email: "",
  brand_color: "",
  signatory_name: "",
  signatory_title: "",
};

/** The first problem with a chosen logo file, judged by its declared type and size. The server checks the content. */
export function logoFileError(file: { size: number; type: string }): string | undefined {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "Upload a PNG, JPG or WebP file. SVG isn’t accepted.";
  if (file.size > LOGO_MAX_BYTES) return `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Upload one under 2 MB.`;
  return undefined;
}

/** Reads the company fields from a submitted form. Non-text entries (files) are treated as empty. */
export function companyInputFromFormData(formData: FormData): CompanyFormInput {
  const input = { ...EMPTY_COMPANY };
  for (const key of COMPANY_FIELDS) {
    const value = formData.get(key);
    input[key] = typeof value === "string" ? value : "";
  }
  return input;
}

/** What's saved: a state or province only for countries that ask for one. */
export function companyRow(values: CompanyValues): CompanyValues {
  return { ...values, region_code: REGIONS[values.country_code] ? values.region_code : null };
}

/** Field errors as one message per field, the shape the form shows. */
export function firstFieldErrors(error: z.ZodError<CompanyValues>): Partial<Record<CompanyField, string>> {
  const errors: Partial<Record<CompanyField, string>> = {};
  for (const [key, messages] of Object.entries(z.flattenError(error).fieldErrors) as [CompanyField, string[] | undefined][]) {
    if (messages?.[0]) errors[key] = messages[0];
  }
  return errors;
}
