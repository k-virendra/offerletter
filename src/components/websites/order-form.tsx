"use client";

import { CircleCheck, CircleHelp, CircleX, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { startWebsiteOrder } from "@/app/(editor)/website/actions";
import { AgreementCheckbox, BillingFields, focusFirstBillingError, FormMessage, NETWORK_ERROR, PayButton, PolicyLinks, submitToGateway, type BillingDefaults, type Countries } from "@/components/checkout/checkout-form";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps, Input, RequiredMark, Select, Textarea } from "@/components/ui/field";
import { billingErrors, billingSchema, type BillingErrors } from "@/lib/payments/billing";
import { isDomain, normalizeDomain, orderErrors, orderSchema, PAGE_OPTIONS, type DomainCheck, type OrderErrors } from "@/lib/websites/order";

export type OrderBusiness = { id: string; name: string; detail: string };

const DOMAIN_LABELS = ["Domain you’d like most", "Second choice", "Third choice"];

export function WebsiteOrderForm({
  businesses,
  price,
  monthly,
  firstDue,
  allowance,
  defaults,
  countries,
}: {
  businesses: OrderBusiness[];
  price: string;
  monthly: string;
  /** "1 November 2026". */
  firstDue: string;
  allowance: string;
  defaults: BillingDefaults;
  countries: Countries;
}) {
  const [order, setOrder] = useState({
    companyId: businesses.length === 1 ? businesses[0]!.id : "",
    domains: ["", "", ""],
    mailboxName: "info",
    about: "",
    pages: ["Home", "About us", "Services", "Contact"] as string[],
    references: "",
    contactPhone: "",
  });
  const [billing, setBilling] = useState(defaults);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<OrderErrors>({});
  const [billingProblems, setBillingProblems] = useState<BillingErrors>({});
  const [checks, setChecks] = useState<Record<number, DomainCheck["result"] | "checking">>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firstDomain = order.domains.map(normalizeDomain).find(isDomain) ?? "yourbusiness.in";
  const setField = <K extends keyof typeof order>(key: K, value: (typeof order)[K]) => {
    setOrder((current) => ({ ...current, [key]: value }));
    if (errors[key as keyof OrderErrors]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const checkDomain = async (index: number) => {
    const domain = normalizeDomain(order.domains[index] ?? "");
    if (!isDomain(domain)) return setErrors((current) => ({ ...current, domains: "Enter domains like mybusiness.in or mybusiness.com." }));
    setChecks((current) => ({ ...current, [index]: "checking" }));
    const answer = await fetch(`/api/domains/check?domain=${encodeURIComponent(domain)}`)
      .then((r) => (r.ok ? (r.json() as Promise<DomainCheck>) : null))
      .catch(() => null);
    setChecks((current) => ({ ...current, [index]: answer?.result ?? "unknown" }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    const orderCheck = orderSchema.safeParse(order);
    const billingInput = { ...billing, authorised: agreed };
    const billingCheck = billingSchema.safeParse(billingInput);
    const foundOrder = orderCheck.success ? {} : orderErrors(orderCheck.error);
    const foundBilling = billingCheck.success ? {} : billingErrors(billingCheck.error);
    setErrors(foundOrder);
    setBillingProblems(foundBilling);
    if (!orderCheck.success || !billingCheck.success) {
      focusFirst(foundOrder, foundBilling);
      return;
    }
    setBusy(true);
    const result = await startWebsiteOrder({ order, billing: billingInput }).catch(() => ({ ok: false as const, message: NETWORK_ERROR }));
    if (result.ok) {
      submitToGateway(result.action, result.fields);
      return;
    }
    setBusy(false);
    setMessage(result.message);
    const nextOrder = "orderErrors" in result && result.orderErrors ? result.orderErrors : {};
    const nextBilling = "errors" in result && result.errors ? result.errors : {};
    setErrors(nextOrder);
    setBillingProblems(nextBilling);
    focusFirst(nextOrder, nextBilling);
  };

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
      <FormMessage message={message} />

      <Section title="Your business">
        {businesses.length ? (
          <Field id="order-companyId" label="Business" required error={errors.companyId} help="The website shows this business’s name and contact details.">
            <Select {...fieldControlProps("order-companyId", { error: errors.companyId })} value={order.companyId} onChange={(e) => setField("companyId", e.target.value)}>
              <option value="">Choose a business</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.detail}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-ink-2">
            First add your business in{" "}
            <Link href="/companies?add=1" className="font-semibold text-evergreen-700 underline underline-offset-2">
              My companies
            </Link>
            : its name, address and contact details go on the website.
          </p>
        )}
      </Section>

      <Section title="Your domain" note={`We register the first of these that’s free. The first year is included up to ${allowance}; for a pricier domain we’ll ask you first.`}>
        {errors.domains ? (
          <p id="order-domains-error" role="alert" className="text-[13px] text-danger">
            {errors.domains}
          </p>
        ) : null}
        {DOMAIN_LABELS.map((label, index) => (
          <div key={label} className="flex flex-col gap-1.5">
            <span className="flex items-baseline gap-0.5">
              <label htmlFor={index === 0 ? "order-domains" : `order-domain-${index}`} className="text-sm font-medium">
                {label}
              </label>
              {index === 0 ? <RequiredMark /> : null}
            </span>
            <div className="flex gap-2">
              <Input
                id={index === 0 ? "order-domains" : `order-domain-${index}`}
                aria-invalid={index === 0 && errors.domains ? true : undefined}
                aria-describedby={errors.domains ? "order-domains-error" : undefined}
                value={order.domains[index]}
                placeholder={index === 0 ? "mybusiness.in" : index === 1 ? "mybusiness.com" : "mybusinessindia.com"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
                onChange={(e) => {
                  setField("domains", order.domains.map((d, i) => (i === index ? e.target.value : d)));
                  setChecks((current) => ({ ...current, [index]: undefined as never }));
                }}
              />
              <Button variant="secondary" onClick={() => void checkDomain(index)} disabled={!order.domains[index] || checks[index] === "checking"}>
                Check
              </Button>
            </div>
            <DomainHint state={checks[index]} />
          </div>
        ))}
      </Section>

      <Section title="Your business email">
        <Field id="order-mailboxName" label="Email address" required error={errors.mailboxName} help="One mailbox is included. We’ll send you an invite to set its password.">
          <div className="flex items-center gap-2">
            <Input {...fieldControlProps("order-mailboxName", { error: errors.mailboxName })} value={order.mailboxName} onChange={(e) => setField("mailboxName", e.target.value)} className="max-w-[220px]" autoCapitalize="none" spellCheck={false} />
            <span className="min-w-0 truncate text-[15px] text-ink-2">@{normalizeDomain(firstDomain)}</span>
          </div>
        </Field>
      </Section>

      <Section title="About your website">
        <Field id="order-about" label="What does your business do?" required error={errors.about} help="Who you serve, what you offer, and anything that makes you different. We write the website from this.">
          <Textarea {...fieldControlProps("order-about", { error: errors.about })} value={order.about} onChange={(e) => setField("about", e.target.value)} rows={5} maxLength={2000} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium">Pages you’d like</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {PAGE_OPTIONS.map((page) => (
              <label key={page} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={order.pages.includes(page)}
                  onChange={(e) => setField("pages", e.target.checked ? [...order.pages, page] : order.pages.filter((p) => p !== page))}
                  className="size-5 accent-evergreen-600"
                />
                {page}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="order-references" label="Websites you like, or anything else we should know" error={errors.references}>
          <Textarea {...fieldControlProps("order-references", { error: errors.references })} value={order.references} onChange={(e) => setField("references", e.target.value)} rows={2} maxLength={500} />
        </Field>
        <Field id="order-contactPhone" label="Phone or WhatsApp number" required error={errors.contactPhone} help="So our team can ask quick questions while building your website.">
          <Input {...fieldControlProps("order-contactPhone", { error: errors.contactPhone })} type="tel" autoComplete="tel" value={order.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} className="max-w-[260px]" />
        </Field>
      </Section>

      <BillingFields
        values={billing}
        errors={billingProblems}
        countries={countries}
        onChange={(key, value) => {
          setBilling((current) => ({ ...current, [key]: value }));
          if (billingProblems[key]) setBillingProblems((current) => ({ ...current, [key]: undefined }));
        }}
      />
      <AgreementCheckbox
        checked={agreed}
        error={billingProblems.authorised}
        onChange={(checked) => {
          setAgreed(checked);
          if (billingProblems.authorised) setBillingProblems((current) => ({ ...current, authorised: undefined }));
        }}
      >
        I agree to the <PolicyLinks />, and to pay {monthly} on the 1st of every month from {firstDue} until I cancel.
      </AgreementCheckbox>
      <PayButton busy={busy} price={price} />
    </form>
  );
}

function focusFirst(order: OrderErrors, billing: BillingErrors) {
  const key = (["companyId", "domains", "mailboxName", "about", "references", "contactPhone"] as const).find((k) => order[k]);
  if (key) requestAnimationFrame(() => document.getElementById(`order-${key}`)?.focus());
  else focusFirstBillingError(billing);
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 shadow-card">
      <legend className="float-left text-base font-semibold">{title}</legend>
      {note ? <p className="clear-both -mt-2 text-[13px] text-ink-2">{note}</p> : <span className="clear-both -mt-4" />}
      {children}
    </fieldset>
  );
}

function DomainHint({ state }: { state: DomainCheck["result"] | "checking" | undefined }) {
  if (!state) return null;
  const content = {
    checking: { icon: <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />, text: "Checking…", tone: "text-muted" },
    available: { icon: <CircleCheck aria-hidden className="size-3.5" />, text: "Looks available", tone: "text-evergreen-700" },
    taken: { icon: <CircleX aria-hidden className="size-3.5" />, text: "Already registered: add another choice", tone: "text-danger" },
    unknown: { icon: <CircleHelp aria-hidden className="size-3.5" />, text: "We couldn’t check it; we’ll confirm when we register it", tone: "text-muted" },
  }[state];
  return (
    <p role="status" className={`flex items-center gap-1.5 text-[13px] ${content.tone}`}>
      {content.icon}
      {content.text}
    </p>
  );
}
