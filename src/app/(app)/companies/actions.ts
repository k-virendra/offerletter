"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile, getUser } from "@/lib/auth";
import { processLogo } from "@/lib/companies/logo";
import { LOGO_BUCKET } from "@/lib/companies/queries";
import { companyInputFromFormData, companyRow, companySchema, firstFieldErrors, type CompanyField } from "@/lib/companies/schema";
import { takeRateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SaveCompanyResult =
  | { ok: true; id: string; name: string }
  | { ok: false; message?: string; fieldErrors?: Partial<Record<CompanyField | "logo", string>> };

export type CompanyActionResult = { ok: true; name: string } | { ok: false; message: string };

const SIGNED_OUT = "Your session has ended. Sign in again to save your changes.";
const companyId = z.uuid();

/** Adds a company or saves changes to one, including its logo. The database enforces the company limit. */
export async function saveCompany(formData: FormData): Promise<SaveCompanyResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: SIGNED_OUT };
  if (!(await takeRateLimit(`company-save:${user.id}`, 600, 60))) {
    return { ok: false, message: "That’s a lot of changes in a short time. Wait a few minutes, then save again." };
  }

  const id = formData.get("id");
  const existingId = typeof id === "string" && id ? companyId.safeParse(id) : null;
  if (existingId && !existingId.success) return { ok: false, message: "We couldn’t find this company." };

  const parsed = companySchema.safeParse(companyInputFromFormData(formData));
  if (!parsed.success) return { ok: false, fieldErrors: firstFieldErrors(parsed.error) };

  // Check a new logo before writing anything, so a bad file doesn't leave a half-saved company.
  const logoFile = formData.get("logo");
  const logo = logoFile instanceof File && logoFile.size > 0 ? await processLogo(logoFile) : null;
  if (logo && !logo.ok) return { ok: false, fieldErrors: { logo: logo.message } };
  const removeLogo = formData.get("remove_logo") === "true";

  const values = companyRow(parsed.data);
  const supabase = await createClient();
  const saved = existingId
    ? await supabase.from("companies").update(values).eq("id", existingId.data).eq("owner_id", user.id).select("id, legal_name, logo_path").maybeSingle()
    : await supabase.from("companies").insert({ ...values, owner_id: user.id }).select("id, legal_name, logo_path").single();

  if (saved.error || !saved.data) {
    if (saved.error?.message === "company_limit_reached") {
      const profile = await getProfile();
      return {
        ok: false,
        message: `You’ve reached your limit of ${profile?.company_limit ?? 5} companies. Delete a company that has no paid letters, or ask us for a higher limit.`,
      };
    }
    if (saved.error) console.error("saveCompany failed", saved.error.code, saved.error.message);
    return { ok: false, message: existingId ? "We couldn’t find this company." : "We couldn’t save the company. Try again in a moment." };
  }

  const company = saved.data;
  if (logo?.ok || removeLogo) {
    const logoError = await replaceLogo(user.id, company.id, company.logo_path, logo?.ok ? logo : null);
    if (logoError) return { ok: false, fieldErrors: { logo: logoError } };
  }

  revalidatePath("/", "layout");
  return { ok: true, id: company.id, name: company.legal_name };
}

/**
 * Stores a new logo (or none) and points the company at it. The old file is deleted only while the company has no
 * paid letters; once letters are issued, their snapshots may still refer to it.
 */
async function replaceLogo(
  ownerId: string,
  id: string,
  oldPath: string | null,
  logo: { png: Buffer; width: number; height: number } | null,
): Promise<string | undefined> {
  const storage = adminClient().storage.from(LOGO_BUCKET);
  const supabase = await createClient();

  let next: { logo_path: string | null; logo_width: number | null; logo_height: number | null } = {
    logo_path: null,
    logo_width: null,
    logo_height: null,
  };
  if (logo) {
    const path = `${ownerId}/${id}/${randomBytes(16).toString("hex")}.png`;
    const upload = await storage.upload(path, logo.png, { contentType: "image/png", upsert: false });
    if (upload.error) {
      console.error("logo upload failed", upload.error.message);
      return "We saved the company but couldn’t store the logo. Try uploading it again.";
    }
    next = { logo_path: path, logo_width: logo.width, logo_height: logo.height };
  }

  const { error } = await supabase.from("companies").update(next).eq("id", id).eq("owner_id", ownerId);
  if (error) {
    console.error("logo update failed", error.code, error.message);
    if (next.logo_path) await storage.remove([next.logo_path]);
    return "We saved the company but couldn’t update the logo. Try again.";
  }

  if (oldPath && oldPath !== next.logo_path) {
    const { data: counts } = await supabase.from("company_letter_counts").select("paid").eq("company_id", id).maybeSingle();
    if (!counts?.paid) await storage.remove([oldPath]);
  }
  return undefined;
}

export async function archiveCompany(id: string): Promise<CompanyActionResult> {
  return setArchived(id, new Date().toISOString());
}

export async function restoreCompany(id: string): Promise<CompanyActionResult> {
  return setArchived(id, null);
}

async function setArchived(id: string, archivedAt: string | null): Promise<CompanyActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: SIGNED_OUT };
  if (!companyId.safeParse(id).success) return { ok: false, message: "We couldn’t find this company." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").update({ archived_at: archivedAt }).eq("id", id).eq("owner_id", user.id).select("legal_name").maybeSingle();
  if (error || !data) return { ok: false, message: "We couldn’t find this company." };

  revalidatePath("/", "layout");
  return { ok: true, name: data.legal_name };
}

/** Deletes a company with no paid letters, its drafts (by cascade) and its logo files. */
export async function deleteCompany(id: string): Promise<CompanyActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: SIGNED_OUT };
  if (!companyId.safeParse(id).success) return { ok: false, message: "We couldn’t find this company." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").delete().eq("id", id).eq("owner_id", user.id).select("legal_name").maybeSingle();
  if (error?.message === "company_has_paid_letters") {
    return { ok: false, message: "This company has paid letters, so it can only be archived." };
  }
  if (error || !data) return { ok: false, message: "We couldn’t find this company." };

  const storage = adminClient().storage.from(LOGO_BUCKET);
  const { data: files } = await storage.list(`${user.id}/${id}`);
  if (files?.length) await storage.remove(files.map((file) => `${user.id}/${id}/${file.name}`));

  revalidatePath("/", "layout");
  return { ok: true, name: data.legal_name };
}
