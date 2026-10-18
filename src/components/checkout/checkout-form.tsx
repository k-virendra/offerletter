"use client";

import { Loader2, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps, Input, Select, Textarea } from "@/components/ui/field";
import type { CountryOption } from "@/lib/countries";
import { billingErrors, billingSchema, type BillingErrors, type CheckoutResult } from "@/lib/payments/billing";

export type BillingDefaults = { fullName: string; email: string; companyName: string; country: string; postalCode: string; address: string };
export type Countries = { launch: CountryOption[]; other: CountryOption[] };

const BILLING_ORDER: (keyof BillingErrors)[] = ["fullName", "email", "companyName", "country", "postalCode", "address", "authorised"];
export const NETWORK_ERROR = "We couldn’t reach the server. Check your connection and try again.";

/** Moves focus to the first billing field with an error. */
export function focusFirstBillingError(found: BillingErrors) {
  const first = BILLING_ORDER.find((key) => found[key]);
  if (first) requestAnimationFrame(() => document.getElementById(`billing-${first}`)?.focus());
}

/** Posts the signed fields to PayU (or the local simulator) as a normal form submission, leaving the app. */
export function submitToGateway(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

/**
 * Billing details, the agreement and "Pay with PayU", for anything paid through PayU. `submit` is a server action
 * that checks everything again and returns the signed form for PayU.
 */
export function CheckoutForm({
  submit,
  agreement,
  price,
  defaults,
  countries,
  pendingPath,
}: {
  submit: (input: Record<string, unknown>) => Promise<CheckoutResult>;
  /** The text of the checkbox: what the payer confirms and agrees to. */
  agreement: ReactNode;
  price: string;
  defaults: BillingDefaults;
  countries: Countries;
  /** Where a payment already being confirmed can be followed: the path the transaction id is added to. */
  pendingPath?: string;
}) {
  const [values, setValues] = useState(defaults);
  const [authorised, setAuthorised] = useState(false);
  const [errors, setErrors] = useState<BillingErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pendingTxnid, setPendingTxnid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    setPendingTxnid(null);
    const input = { ...values, authorised };
    const checked = billingSchema.safeParse(input);
    if (!checked.success) {
      const found = billingErrors(checked.error);
      setErrors(found);
      focusFirstBillingError(found);
      return;
    }
    setBusy(true);
    const result = await submit(input).catch((): CheckoutResult => ({ ok: false, message: NETWORK_ERROR }));
    if (result.ok) {
      // Stays busy: the browser is leaving for PayU.
      submitToGateway(result.action, result.fields);
      return;
    }
    setBusy(false);
    setMessage(result.message);
    if (result.errors) {
      setErrors(result.errors);
      focusFirstBillingError(result.errors);
    }
    if (result.pendingTxnid) setPendingTxnid(result.pendingTxnid);
  };

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" aria-describedby={message ? "checkout-message" : undefined}>
      <FormMessage message={message} pending={pendingTxnid && pendingPath ? `${pendingPath}${pendingTxnid}` : null} />
      <BillingFields
        values={values}
        errors={errors}
        countries={countries}
        onChange={(key, value) => {
          setValues((current) => ({ ...current, [key]: value }));
          if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
        }}
      />
      <AgreementCheckbox
        checked={authorised}
        error={errors.authorised}
        onChange={(checked) => {
          setAuthorised(checked);
          if (errors.authorised) setErrors((current) => ({ ...current, authorised: undefined }));
        }}
      >
        {agreement}
      </AgreementCheckbox>
      <PayButton busy={busy} price={price} />
    </form>
  );
}

export function FormMessage({ message, pending }: { message: string | null; pending?: string | null }) {
  if (!message) return null;
  return (
    <div id="checkout-message" role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger bg-danger-50 px-3.5 py-3 text-sm text-danger-700">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {message}{" "}
        {pending ? (
          <Link href={pending} className="font-semibold underline underline-offset-2">
            See its status
          </Link>
        ) : null}
      </span>
    </div>
  );
}

export function BillingFields({
  values,
  errors,
  countries,
  onChange,
}: {
  values: BillingDefaults;
  errors: BillingErrors;
  countries: Countries;
  onChange: (key: keyof BillingDefaults, value: string) => void;
}) {
  const control = (key: keyof BillingDefaults) => ({
    ...fieldControlProps(`billing-${key}`, { error: errors[key] }),
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(key, event.target.value),
  });
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 shadow-card">
      <legend className="float-left mb-1 text-base font-semibold">Billing details</legend>
      <div className="clear-both grid gap-4 sm:grid-cols-2">
        <Field id="billing-fullName" label="Full name" required error={errors.fullName}>
          <Input {...control("fullName")} autoComplete="name" maxLength={120} />
        </Field>
        <Field id="billing-email" label="Email for the receipt" required error={errors.email}>
          <Input {...control("email")} type="email" autoComplete="email" inputMode="email" maxLength={254} />
        </Field>
      </div>
      <Field id="billing-companyName" label="Company name on the receipt" error={errors.companyName}>
        <Input {...control("companyName")} autoComplete="organization" maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="billing-country" label="Country" required error={errors.country}>
          <Select {...control("country")} autoComplete="country">
            <option value="">Choose a country</option>
            <optgroup label="Most used">
              {countries.launch.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="All countries">
              {countries.other.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field id="billing-postalCode" label="Postal code" required error={errors.postalCode}>
          <Input {...control("postalCode")} autoComplete="postal-code" maxLength={20} />
        </Field>
      </div>
      <Field id="billing-address" label="Billing address" error={errors.address}>
        <Textarea {...control("address")} autoComplete="street-address" maxLength={300} rows={3} />
      </Field>
    </fieldset>
  );
}

export function AgreementCheckbox({ checked, error, onChange, children }: { checked: boolean; error?: string; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          id="billing-authorised"
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "billing-authorised-error" : undefined}
          className="mt-0.5 size-5 shrink-0 accent-evergreen-600"
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p id="billing-authorised-error" className="pl-8 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** "the Terms and the Refund and cancellation policy", linked. */
export function PolicyLinks() {
  return (
    <>
      <Link href="/terms" target="_blank" className="font-semibold text-evergreen-700 underline underline-offset-2">
        Terms
      </Link>{" "}
      and the{" "}
      <Link href="/refunds" target="_blank" className="font-semibold text-evergreen-700 underline underline-offset-2">
        Refund and cancellation policy
      </Link>
    </>
  );
}

export function PayButton({ busy, price }: { busy: boolean; price: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto sm:self-start">
        {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Lock aria-hidden />}
        {busy ? "Taking you to PayU…" : `Pay ${price} with PayU`}
      </Button>
      <p className="text-[13px] text-muted">You’ll pay on PayU’s secure page, then come straight back here. We never see your card details.</p>
    </div>
  );
}
