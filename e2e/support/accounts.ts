import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "../../src/lib/supabase/database.types";
import { uniqueEmail } from "./mailpit";

// Test accounts and data on the local Supabase stack. Sign-in uses a server-generated magic link that goes through
// the app's real /auth/confirm route, without sending an email (the sign-in spec covers the email itself).

let client: ReturnType<typeof createClient<Database>> | undefined;

function admin() {
  if (!client) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // CI sets the variables directly.
    }
    client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function signInAsNewUser(page: Page, label: string, next = "/companies") {
  const email = uniqueEmail(label);
  const created = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser failed: ${created.error?.message}`);
  const link = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`generateLink failed: ${link.error.message}`);
  await page.goto(`/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`);
  return { userId: created.data.user.id, email };
}

const SAMPLE_COMPANY = {
  registered_address: "Musterstraße 1, 80331 München",
  registration_number: "HRB 000000",
  country_code: "DE",
  contact_phone: "+49 89 1234 5678",
  contact_email: "people@example-engineering.test",
  signatory_name: "Dr. Anna Weber",
  signatory_title: "Managing Director",
} satisfies Partial<TablesInsert<"companies">>;

/** Saves companies straight to the database, as if the user had added them earlier. */
export async function seedCompanies(ownerId: string, names: string[]) {
  const { data, error } = await admin()
    .from("companies")
    .insert(names.map((legal_name) => ({ ...SAMPLE_COMPANY, legal_name, owner_id: ownerId })))
    .select("id, legal_name");
  if (error) throw new Error(`seedCompanies failed: ${error.message}`);
  return data;
}

/** A letter for the company that has been paid for (issuing is server work, done here with the secret key). */
export async function seedPaidLetter(ownerId: string, companyId: string) {
  const letter = await admin()
    .from("letters")
    .insert({ company_id: companyId, author_id: ownerId, jurisdiction_code: "DE", template_key: "classic", name: "Offer for Lena Hoffmann" })
    .select("id")
    .single();
  if (letter.error) throw new Error(`seedPaidLetter insert failed: ${letter.error.message}`);
  const paid = await admin()
    .from("letters")
    .update({ status: "paid", paid_at: new Date().toISOString(), current_version: 1 })
    .eq("id", letter.data.id);
  if (paid.error) throw new Error(`seedPaidLetter update failed: ${paid.error.message}`);
}

/** A user without a browser session, for tests that open letters through render tokens. */
export async function createTestUser(label: string) {
  const email = uniqueEmail(label);
  const created = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser failed: ${created.error?.message}`);
  return created.data.user.id;
}

/** A draft letter with the given answers. */
export async function seedLetter(
  ownerId: string,
  companyId: string,
  { jurisdiction, template = "classic", values, name = "Sample letter" }: { jurisdiction: string; template?: string; values: Record<string, unknown>; name?: string },
) {
  const { data, error } = await admin()
    .from("letters")
    .insert({ company_id: companyId, author_id: ownerId, jurisdiction_code: jurisdiction, template_key: template, name, field_values: values as never })
    .select("id")
    .single();
  if (error) throw new Error(`seedLetter failed: ${error.message}`);
  return data.id;
}

export { admin as testAdmin };
