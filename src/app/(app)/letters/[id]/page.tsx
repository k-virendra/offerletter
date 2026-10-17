import { Download, FilePenLine, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { LetterView } from "@/components/letter/letter-view";
import { Button } from "@/components/ui/button";
import { getUser, requireUser } from "@/lib/auth";
import { correctionDaysLeft } from "@/lib/letter/letters.server";
import { formatMoney } from "@/lib/payments/prices.server";
import { versionInputs } from "@/lib/pdf/inputs.server";
import { fingerprint } from "@/lib/pdf/snapshot";
import { createClient } from "@/lib/supabase/server";
import { formatDay as day } from "@/lib/template/format";


export async function generateMetadata({ params }: PageProps<"/letters/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Letter" };
  const supabase = await createClient();
  const user = await getUser();
  const { data } = user ? await supabase.from("letters").select("name").eq("id", id).eq("author_id", user.id).maybeSingle() : { data: null };
  return { title: data?.name ?? "Letter" };
}

// A paid letter: the issued PDF, its versions, free corrections and the payment. Drafts open in the editor.
export default async function LetterPage({ params }: PageProps<"/letters/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/letters/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  // RLS: authors only, for the letter, its versions and its payments.
  const supabase = await createClient();
  const { data: letter } = await supabase
    .from("letters")
    .select("id, name, status, paid_at, correction_until, current_version, companies(legal_name)")
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!letter) notFound();
  if (letter.status === "draft") redirect(`/letters/${id}/edit`);

  const [{ data: versions }, { data: payment }] = await Promise.all([
    supabase.from("letter_versions").select("id, version, content_hash, pdf_path, note, created_at").eq("letter_id", id).order("version", { ascending: false }),
    supabase
      .from("payments")
      .select("txnid, status, amount_minor, currency, display_amount_minor, display_currency, verified_at, created_at")
      .eq("letter_id", id)
      .in("status", ["success", "refunded"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const latest = versions?.[0];
  const inputs = latest ? await versionInputs(latest.id) : null;

  const refunded = payment?.status === "refunded";
  const until = letter.correction_until ? new Date(letter.correction_until) : null;
  const daysLeft = correctionDaysLeft(letter.correction_until);
  const canCorrect = !refunded && daysLeft > 0 && Boolean(latest?.pdf_path);
  const charged = payment ? formatMoney({ currency: payment.currency, amountMinor: payment.amount_minor }) : "";
  const shown = payment?.display_currency && payment.display_amount_minor ? formatMoney({ currency: payment.display_currency, amountMinor: payment.display_amount_minor }) : charged;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="inline-flex h-[26px] items-center rounded-full bg-evergreen-50 px-2.5 font-semibold text-evergreen-700">
              {refunded ? "Refunded" : "Paid"}
              {latest ? ` · version ${latest.version}` : ""}
            </span>
            <span className="text-ink-2">{letter.companies?.legal_name}</span>
          </p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight break-words">{letter.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {canCorrect ? (
            <Button asChild variant="secondary">
              <Link href={`/letters/${id}/edit`}>
                <FilePenLine aria-hidden />
                Correct a mistake
              </Link>
            </Button>
          ) : null}
          {latest?.pdf_path ? (
            <Button asChild>
              <a href={`/api/letters/${id}/versions/${latest.version}/pdf`}>
                <Download aria-hidden />
                Download PDF
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {!latest?.pdf_path ? (
        <section role="status" className="flex items-start gap-3 rounded-xl border border-info bg-info-50 px-5 py-4 text-sm text-info">
          <Hourglass aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">We’re preparing your letter</p>
            <p className="mt-0.5">
              The final PDF is being made. It usually takes a few seconds.{" "}
              {payment ? (
                <Link href={`/letters/${id}/checkout/${payment.txnid}`} className="font-semibold underline underline-offset-2">
                  Follow its progress
                </Link>
              ) : null}
            </p>
          </div>
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-xl bg-desk p-4 md:p-8">
          {inputs ? (
            <LetterView label={`Version ${latest!.version}`} context={inputs.context} company={inputs.company} state={inputs.state} date={inputs.date} />
          ) : (
            <p className="py-16 text-center text-sm text-ink-2">The preview appears once the letter is issued.</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <section aria-labelledby="corrections-heading" className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 id="corrections-heading" className="text-base font-semibold">
              Free corrections
            </h2>
            {refunded ? (
              <p className="mt-1.5 text-sm text-ink-2">This payment was refunded, so the letter can’t be corrected.</p>
            ) : canCorrect && until ? (
              <>
                <p className="mt-1.5 text-sm text-ink-2">
                  <strong className="font-semibold text-ink">
                    {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                  </strong>
                  , until {day(until.toISOString())}. Fix a typo, a date or the pay, and issue a corrected version at no charge. The candidate’s name and the job title
                  can’t change.
                </p>
                <Button asChild variant="secondary" className="mt-3">
                  <Link href={`/letters/${id}/edit`}>Correct a mistake</Link>
                </Button>
              </>
            ) : until && daysLeft <= 0 ? (
              <p className="mt-1.5 text-sm text-ink-2">The free correction period ended on {day(until.toISOString())}. For a different letter, start a new one.</p>
            ) : (
              <p className="mt-1.5 text-sm text-ink-2">Corrections open once the letter is issued.</p>
            )}
          </section>

          <section aria-labelledby="versions-heading" className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 id="versions-heading" className="text-base font-semibold">
              Versions
            </h2>
            <ol className="mt-2 flex flex-col">
              {(versions ?? []).map((version) => (
                <li key={version.id} className="flex items-start justify-between gap-3 border-t border-line-soft py-3 first:border-t-0">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">
                      Version {version.version}
                      {version.version === latest?.version ? <span className="ml-2 text-xs font-normal text-muted">Latest</span> : null}
                    </p>
                    <p className="text-ink-2">
                      {day(version.created_at)}
                      {version.note ? ` · ${version.note}` : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted" title="The start of this version’s content fingerprint (SHA-256)">
                      Fingerprint {fingerprint(version.content_hash)}
                    </p>
                  </div>
                  {version.pdf_path ? (
                    <Button asChild variant="ghost" className="text-evergreen-600">
                      <a href={`/api/letters/${id}/versions/${version.version}/pdf`} aria-label={`Download version ${version.version}`}>
                        <Download aria-hidden />
                        PDF
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">Preparing…</span>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {payment ? (
            <section aria-labelledby="payment-heading" className="rounded-xl border border-line bg-white p-5 shadow-card">
              <h2 id="payment-heading" className="text-base font-semibold">
                Payment
              </h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Amount</dt>
                <dd className="tabular-nums">{shown === charged ? charged : `${shown} (charged as ${charged})`}</dd>
                <dt className="text-muted">Paid on</dt>
                <dd>{day(payment.verified_at ?? payment.created_at)}</dd>
                <dt className="text-muted">Reference</dt>
                <dd className="font-mono text-[13px] break-all">{payment.txnid}</dd>
              </dl>
              <Button asChild variant="link" className="mt-3">
                <Link href={`/receipts/${payment.txnid}`}>View the receipt</Link>
              </Button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
