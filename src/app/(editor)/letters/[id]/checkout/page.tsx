import { Check, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { startCheckout } from "@/app/(editor)/letters/[id]/checkout/actions";
import { CheckoutForm, PolicyLinks } from "@/components/checkout/checkout-form";
import { CheckoutHeader } from "@/components/checkout/checkout-header";
import { LetterThumbnail } from "@/components/letter/letter-view";
import { getProfile, requireUser } from "@/lib/auth";
import { countryOptions } from "@/lib/countries";
import { loadLetterContext, translatedWording } from "@/lib/letter/context.server";
import { blockingProblems } from "@/lib/letter/fields";
import { getLetter, letterCompany, letterState } from "@/lib/letter/letters.server";
import { coveredTranslation, languageName } from "@/lib/letter/translation";
import { correctionDeadline } from "@/lib/payments/complete.server";
import { activePrices, formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";
import { formatDay, todayIso } from "@/lib/template/format";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({ params }: PageProps<"/letters/[id]/checkout">) {
  const { id } = await params;
  const user = await requireUser(`/letters/${id}/checkout`);
  if (!z.uuid().safeParse(id).success) notFound();

  const letter = await getLetter(id);
  if (!letter?.companies) notFound();
  if (letter.status !== "draft") redirect(`/letters/${id}`);
  const row = letter.companies;
  if (row.archived_at || row.suspended_at) redirect(`/letters/${id}/edit`);

  const context = await loadLetterContext(letter.jurisdiction_code);
  if (!context) redirect(`/letters/${id}/edit`);
  const state = letterState(letter);
  const today = todayIso();
  // The editor shows what's missing and takes people to it.
  const problems = blockingProblems(context, state, today);
  if (problems.missing.length || problems.invalid.length) redirect(`/letters/${id}/edit`);

  const supabase = await createClient();
  const [company, prices, profile, pending, translated] = await Promise.all([
    letterCompany(row, 60 * 60),
    activePrices(),
    getProfile(),
    supabase.from("payments").select("txnid").eq("letter_id", id).eq("user_id", user.id).eq("status", "pending").limit(1).maybeSingle(),
    translatedWording(context),
  ]);
  // The same check as when the letter is frozen at Pay: a translation that covers every section comes with it.
  const translation = coveredTranslation(context, translated, state.removedSections);

  const price = formatMoney(prices.display);
  const charged = formatMoney(prices.charge);
  // Buyers abroad pay in rupees: their bank converts it.
  const currencyNote =
    prices.display.currency !== prices.charge.currency
      ? `PayU charges this as ${charged} (≈ ${price}). Your bank may add a currency conversion fee.`
      : prices.charge.currency === "INR"
        ? "Charged in Indian rupees. If your card is in another currency, your bank converts it and may add a fee."
        : null;
  const correctionsUntil = formatDay(correctionDeadline());
  const template = context.templates.find((t) => t.key === state.templateKey);
  const place = context.jurisdiction.name === context.jurisdiction.countryName ? context.jurisdiction.name : `${context.jurisdiction.countryName}, ${context.jurisdiction.name}`;

  return (
    <div className="min-h-dvh bg-canvas">
      <CheckoutHeader back={{ href: `/letters/${id}/edit`, label: "Back to the letter" }} />
      <main className="mx-auto grid max-w-[1080px] items-start gap-5 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-10 lg:py-10">
        <div className="min-w-0 max-lg:order-1 lg:col-start-1">
          <p className="text-[13px] font-semibold text-evergreen-700">Step 3 of 3 · Pay</p>
          <h1 className="font-display text-[30px] leading-tight font-medium">Checkout</h1>
        </div>
        <div className="min-w-0 max-lg:order-3 lg:col-start-1">
          {pending.data ? (
            <p className="mb-5 flex items-start gap-2.5 rounded-lg border border-info bg-info-50 px-3.5 py-3 text-sm text-info">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                A payment for this letter is still being confirmed.{" "}
                <Link href={`/letters/${id}/checkout/${pending.data.txnid}`} className="font-semibold underline underline-offset-2">
                  See its status
                </Link>{" "}
                before paying again.
              </span>
            </p>
          ) : null}
          <CheckoutForm
            submit={startCheckout.bind(null, id)}
            pendingPath={`/letters/${id}/checkout/`}
            agreement={
              <>
                I’m authorised to issue this letter on behalf of <strong className="font-semibold">{row.legal_name}</strong>, and I agree to the <PolicyLinks />.
              </>
            }
            price={price}
            countries={countryOptions()}
            defaults={{
              fullName: profile?.full_name ?? "",
              email: profile?.email ?? user.email ?? "",
              companyName: row.legal_name,
              country: row.country_code,
              postalCode: "",
              address: row.registered_address,
            }}
          />
        </div>

        {/* Phones: under the heading, before the form. Wide screens: the right-hand column. */}
        <aside aria-labelledby="summary-heading" className="rounded-xl border border-line bg-white p-5 shadow-card max-lg:order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h2 id="summary-heading" className="text-base font-semibold">
            Order summary
          </h2>
          <div className="mt-4 flex gap-4">
            <LetterThumbnail context={context} company={company} state={state} date={today} width={96} className="shrink-0 ring-1 ring-line" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold break-words">{letter.name}</p>
              <p className="mt-0.5 text-ink-2 break-words">{row.legal_name}</p>
              <p className="mt-0.5 text-muted">
                {place} · {template?.name ?? "Classic"}
              </p>
            </div>
          </div>
          <dl className="mt-5 flex items-baseline justify-between border-t border-line-soft pt-4">
            <dt className="text-sm text-ink-2">Offer letter, one-off</dt>
            <dd className="font-display text-2xl font-medium tabular-nums">{price}</dd>
          </dl>
          {currencyNote ? <p className="mt-2 text-[13px] text-muted">{currencyNote}</p> : null}
          <h3 className="mt-5 text-sm font-semibold">Included</h3>
          <ul className="mt-2 flex flex-col gap-2 text-sm text-ink-2">
            {[
              translation?.language
                ? `The final PDF in English, plus a ${languageName(translation.language, "en")} translation (the English version prevails)`
                : "The final PDF, without the preview watermark",
              `Free corrections until ${correctionsUntil}`,
              "Every version kept, with a fingerprint to check it by",
              "A receipt by email",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-evergreen-600" />
                {item}
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  );
}
