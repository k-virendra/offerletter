import "server-only";
import { LOGO_BUCKET } from "@/lib/companies/queries";
import { countryName } from "@/lib/countries";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FieldValues, LetterCompany, LetterState } from "./types";

// Letters as the signed-in user sees them (RLS: authors only).

const EDITOR_LOGO_SECONDS = 4 * 60 * 60;

export type CompanyRow = {
  id: string;
  legal_name: string;
  trading_name: string | null;
  registered_address: string;
  registration_number: string;
  country_code: string;
  website: string | null;
  contact_phone: string;
  contact_email: string;
  brand_color: string | null;
  logo_path: string | null;
  logo_width: number | null;
  logo_height: number | null;
  signatory_name: string;
  signatory_title: string;
};

export const COMPANY_FOR_LETTER =
  "id, legal_name, trading_name, registered_address, registration_number, country_code, website, contact_phone, contact_email, brand_color, logo_path, logo_width, logo_height, signatory_name, signatory_title";

/** A company as letters use it, with a signed logo URL that lasts for an editing session. */
export async function letterCompany(row: CompanyRow, seconds = EDITOR_LOGO_SECONDS): Promise<LetterCompany> {
  let logo: LetterCompany["logo"] = null;
  if (row.logo_path && row.logo_width && row.logo_height) {
    const { data } = await adminClient().storage.from(LOGO_BUCKET).createSignedUrl(row.logo_path, seconds);
    if (data?.signedUrl) logo = { url: data.signedUrl, width: row.logo_width, height: row.logo_height };
  }
  return {
    id: row.id,
    legalName: row.legal_name,
    tradingName: row.trading_name,
    registeredAddress: row.registered_address,
    registrationNumber: row.registration_number,
    countryName: countryName(row.country_code),
    website: row.website,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    brandColor: row.brand_color,
    logo,
  };
}

/** One of the signed-in user's own letters (an admin's session can read others', but they don't open here). */
export async function getLetter(id: string) {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("letters")
    .select(
      `id, name, status, author_id, company_id, jurisdiction_code, template_key, field_values, removed_sections, accent_color, edited_at, current_version, correction_until, companies(${COMPANY_FOR_LETTER}, archived_at, suspended_at)`,
    )
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();
  return data;
}

export function letterState(row: { name: string; template_key: string; accent_color: string | null; field_values: unknown; removed_sections: string[] }): LetterState {
  return {
    name: row.name,
    templateKey: row.template_key,
    accentColor: row.accent_color,
    values: (row.field_values ?? {}) as FieldValues,
    removedSections: row.removed_sections,
  };
}

/** The price shown on the Pay button, e.g. "₹499". */
export { displayPriceLabel as displayPrice } from "@/lib/payments/prices.server";

/** Whole days left in a correction window (0 once it has closed). */
export function correctionDaysLeft(until: string | null, now = new Date()): number {
  return until ? Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000)) : 0;
}

/** A paid letter can be corrected for free until its correction window closes. */
export function correctionOpen(letter: { status: string; current_version: number; correction_until: string | null }, now = new Date()): boolean {
  return letter.status === "paid" && letter.current_version > 0 && Boolean(letter.correction_until) && new Date(letter.correction_until!) > now;
}
