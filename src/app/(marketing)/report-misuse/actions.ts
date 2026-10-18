"use server";

import { z } from "zod";
import { clientKey, takeRateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";

// Anyone can report a letter made with AI Company Wala (a candidate asked for money, a company that never sent
// it). Reports go straight to the admin panel; the reporter needs no account.

const reportSchema = z.object({
  reporterEmail: z.union([z.literal(""), z.string().trim().max(254).pipe(z.email({ message: "Enter an email address like name@example.com, or leave it empty." }))]),
  companyName: z.string().trim().max(200),
  letterReference: z.string().trim().max(200),
  description: z.string().trim().min(10, "Tell us what happened (at least a sentence).").max(5000),
  // Left empty by people; bots fill every field.
  website: z.string().max(0).optional(),
});

export type ReportInput = z.input<typeof reportSchema>;
export type ReportResult = { ok: true } | { ok: false; message: string; field?: keyof ReportInput };

/** A payment reference or a letter's fingerprint points at the company that made the letter. */
async function companyFor(reference: string): Promise<string | null> {
  const db = adminClient();
  const compact = reference.replace(/\s+/g, "");
  if (/^OLP-\d{8}-[A-Z0-9]{6}$/i.test(compact)) {
    const { data } = await db.from("payments").select("company_id").eq("txnid", compact.toUpperCase()).maybeSingle();
    return data?.company_id ?? null;
  }
  if (/^[0-9a-f]{12,64}$/i.test(compact)) {
    const { data } = await db.from("letter_versions").select("letters(company_id)").like("content_hash", `${compact.toLowerCase()}%`).limit(2);
    return data?.length === 1 ? (data[0]?.letters?.company_id ?? null) : null;
  }
  return null;
}

export async function submitReport(input: ReportInput): Promise<ReportResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? "Check the form.", field: issue?.path[0] as keyof ReportInput | undefined };
  }
  if (!(await takeRateLimit(`misuse-report:${await clientKey()}`, 3600, 5))) {
    return { ok: false, message: "You’ve sent several reports in a short time. Wait an hour, or email us instead." };
  }
  const { reporterEmail, companyName, letterReference, description } = parsed.data;
  const { error } = await adminClient()
    .from("abuse_reports")
    .insert({
      reporter_email: reporterEmail || null,
      company_name: companyName || null,
      letter_reference: letterReference || null,
      description,
      company_id: letterReference ? await companyFor(letterReference) : null,
    });
  if (error) {
    console.error("misuse report failed", error.message);
    return { ok: false, message: "We couldn’t send your report. Try again in a moment." };
  }
  return { ok: true };
}
