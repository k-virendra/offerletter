import "server-only";
import { LOGO_BUCKET } from "@/lib/companies/queries";
import { countryName } from "@/lib/countries";
import { loadLetterContext } from "@/lib/letter/context.server";
import { COMPANY_FOR_LETTER, letterState, type CompanyRow } from "@/lib/letter/letters.server";
import type { LetterCompany, LetterContext, LetterState } from "@/lib/letter/types";
import { adminClient } from "@/lib/supabase/admin";
import { todayIso } from "@/lib/template/format";
import type { IssuedCompany, IssuedSnapshot } from "./snapshot";

// Everything the print page needs, read with the secret key: the caller (a signed render token, or the issuing
// code after a confirmed payment) has already established who may see it.

export type PrintInputs = { context: LetterContext; state: LetterState; company: LetterCompany; date: string; name: string };

const PRINT_LOGO_SECONDS = 10 * 60;

async function signedLogo(logo: IssuedCompany["logo"]): Promise<LetterCompany["logo"]> {
  if (!logo) return null;
  const { data } = await adminClient().storage.from(LOGO_BUCKET).createSignedUrl(logo.path, PRINT_LOGO_SECONDS);
  return data?.signedUrl ? { url: data.signedUrl, width: logo.width, height: logo.height } : null;
}

export function issuedCompany(row: CompanyRow): IssuedCompany {
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
    logo: row.logo_path && row.logo_width && row.logo_height ? { path: row.logo_path, width: row.logo_width, height: row.logo_height } : null,
  };
}

async function loadDraft(letterId: string) {
  const { data: letter } = await adminClient()
    .from("letters")
    .select(`id, name, status, author_id, jurisdiction_code, template_key, field_values, removed_sections, accent_color, current_version, companies(${COMPANY_FOR_LETTER})`)
    .eq("id", letterId)
    .maybeSingle();
  if (!letter?.companies) return null;
  const context = await loadLetterContext(letter.jurisdiction_code);
  if (!context) return null;
  return { letter, context, company: issuedCompany(letter.companies) };
}

/** A draft as it is now, for a watermarked preview. */
export async function draftInputs(letterId: string): Promise<PrintInputs | null> {
  const draft = await loadDraft(letterId);
  if (!draft) return null;
  return {
    context: draft.context,
    state: letterState(draft.letter),
    company: { ...draft.company, logo: await signedLogo(draft.company.logo) },
    date: todayIso(),
    name: draft.letter.name,
  };
}

/** An issued version, exactly as it was frozen. */
export async function versionInputs(versionId: string): Promise<PrintInputs | null> {
  const { data: version } = await adminClient()
    .from("letter_versions")
    .select("id, snapshot, company_snapshot, letters(name)")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return null;
  const snapshot = version.snapshot as unknown as IssuedSnapshot;
  const company = version.company_snapshot as unknown as IssuedCompany;
  if (snapshot.schema !== 1) return null;
  return {
    context: snapshot.context,
    state: snapshot.state,
    company: { ...company, logo: await signedLogo(company.logo) },
    date: snapshot.date,
    name: version.letters?.name ?? snapshot.state.name,
  };
}

/** Freezes a draft for issuing. */
export async function snapshotDraft(letterId: string) {
  const draft = await loadDraft(letterId);
  if (!draft) return null;
  const snapshot: IssuedSnapshot = { schema: 1, date: todayIso(), context: draft.context, state: letterState(draft.letter) };
  return { snapshot, company: draft.company, letter: draft.letter };
}
