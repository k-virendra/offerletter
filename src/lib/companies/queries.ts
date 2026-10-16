import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const LOGO_BUCKET = "logos";
const SIGNED_URL_SECONDS = 600;

const COMPANY_COLUMNS =
  "id, legal_name, trading_name, country_code, registration_number, registered_address, website, contact_phone, contact_email, logo_path, logo_width, logo_height, brand_color, signatory_name, signatory_title, archived_at, suspended_at, created_at";

export type CompanySummary = Awaited<ReturnType<typeof listCompanies>>["companies"][number];

/** The signed-in user's companies with letter counts and short-lived logo URLs. RLS limits rows to the owner. */
export async function listCompanies() {
  const supabase = await createClient();
  const [companies, counts] = await Promise.all([
    supabase.from("companies").select(COMPANY_COLUMNS).order("created_at", { ascending: true }),
    supabase.from("company_letter_counts").select("company_id, paid, drafts"),
  ]);
  if (companies.error || counts.error) return { error: true as const, companies: [] };

  const countsById = new Map(counts.data.map((row) => [row.company_id, row]));
  const logoUrls = await signedLogoUrls(companies.data.flatMap((company) => (company.logo_path ? [company.logo_path] : [])));

  return {
    error: false as const,
    companies: companies.data.map((company) => ({
      ...company,
      paid: countsById.get(company.id)?.paid ?? 0,
      drafts: countsById.get(company.id)?.drafts ?? 0,
      logoUrl: company.logo_path ? logoUrls.get(company.logo_path) : undefined,
    })),
  };
}

async function signedLogoUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await adminClient().storage.from(LOGO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
}
