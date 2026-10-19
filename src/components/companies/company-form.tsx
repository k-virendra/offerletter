"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, ImagePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { saveCompany, type SaveCompanyResult } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps, Input, Select, Textarea } from "@/components/ui/field";
import { normalizeHex, readableAccent } from "@/lib/color";
import {
  COMPANY_FIELDS,
  companySchema,
  EMPTY_COMPANY,
  logoFileError,
  type CompanyField,
  type CompanyFormInput,
  type CompanyValues,
} from "@/lib/companies/schema";
import type { CountryOption } from "@/lib/countries";
import { cn } from "@/lib/utils";

export type EditableCompany = Omit<CompanyFormInput, "trading_name" | "website" | "brand_color" | "contact_phone" | "contact_email"> & {
  id: string;
  trading_name: string | null;
  website: string | null;
  brand_color: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  logoUrl?: string;
  logo_width: number | null;
  logo_height: number | null;
};

const LABELS: Record<CompanyField | "logo", string> = {
  legal_name: "Legal name",
  trading_name: "Trading name",
  country_code: "Country of registration",
  registration_number: "Registration number",
  registered_address: "Registered address",
  website: "Website",
  contact_phone: "Contact phone",
  contact_email: "Contact email",
  brand_color: "Brand colour",
  signatory_name: "Signatory name",
  signatory_title: "Signatory job title",
  logo: "Logo",
};

const fieldId = (name: CompanyField | "logo") => `company-${name.replaceAll("_", "-")}`;

const LOGO_HELP = "PNG, JPG or WebP up to 2 MB. We re-save uploads to remove hidden data. SVG isn’t accepted.";

export function CompanyForm({
  company,
  countries,
  footerNote,
  onSaved,
  onCancel,
}: {
  company?: EditableCompany;
  countries: { launch: CountryOption[]; other: CountryOption[] };
  footerNote: string;
  onSaved: (result: Extract<SaveCompanyResult, { ok: true }>) => void;
  onCancel: () => void;
}) {
  const defaultValues = useMemo<CompanyFormInput>(
    () =>
      company
        ? Object.fromEntries(COMPANY_FIELDS.map((key) => [key, company[key] ?? ""])) as CompanyFormInput
        : EMPTY_COMPANY,
    [company],
  );
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<CompanyFormInput, unknown, CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues,
    mode: "onTouched",
    // Focus goes to the error summary instead, which links to each field.
    shouldFocusError: false,
  });

  const [pending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string>();
  const [showSummary, setShowSummary] = useState(false);
  const [failedSaves, setFailedSaves] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failedSaves) summaryRef.current?.focus();
  }, [failedSaves]);

  const logo = useLogoInput(company);

  const fieldErrors = Object.entries(errors).flatMap(([key, error]) =>
    error?.message ? [{ key: key as CompanyField, message: error.message }] : [],
  );
  const allErrors = logo.error ? [...fieldErrors, { key: "logo" as const, message: logo.error }] : fieldErrors;

  function revealSummary() {
    setShowSummary(true);
    setFailedSaves((count) => count + 1);
  }

  const onValid = (values: CompanyValues) => {
    if (logo.error) return revealSummary();
    const formData = new FormData();
    if (company) formData.set("id", company.id);
    for (const key of COMPANY_FIELDS) formData.set(key, values[key] ?? "");
    if (logo.file) formData.set("logo", logo.file);
    if (logo.removed) formData.set("remove_logo", "true");

    setServerMessage(undefined);
    startTransition(async () => {
      const result = await saveCompany(formData);
      if (result.ok) return onSaved(result);
      for (const [key, message] of Object.entries(result.fieldErrors ?? {}) as [CompanyField | "logo", string][]) {
        if (key === "logo") logo.setError(message);
        else setError(key, { type: "server", message });
      }
      setServerMessage(result.message);
      revealSummary();
    });
  };

  const field = (name: CompanyField, help?: string) => ({
    ...register(name),
    ...fieldControlProps(fieldId(name), { error: errors[name]?.message, help }),
  });

  const brandColor = useWatch({ control, name: "brand_color" });
  const brandHex = normalizeHex(brandColor ?? "");
  const accent = brandHex ? readableAccent(brandHex) : null;
  const brandHelp = accent?.darkened
    ? `Too light to read as text on white, so letters use the darker shade ${accent.hex} for headings and rules. You don’t need to change anything.`
    : brandHex
      ? "Letters use this colour for headings, rules and numbers."
      : "Optional. Without one, each letter style uses its own colour.";

  return (
    <form onSubmit={(event) => handleSubmit(onValid, revealSummary)(event)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 py-6 sm:px-7">
        {showSummary && (allErrors.length > 0 || serverMessage) ? (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            aria-labelledby="company-errors-heading"
            className="rounded-xl border-2 border-danger bg-[#FFFBFA] px-4.5 py-4"
          >
            <h3 id="company-errors-heading" className="flex items-center gap-2 text-base font-semibold text-danger-700">
              <CircleAlert aria-hidden className="size-[18px]" />
              {allErrors.length > 0
                ? `${allErrors.length} ${allErrors.length === 1 ? "thing" : "things"} to fix before saving`
                : "We couldn’t save the company"}
            </h3>
            {serverMessage ? <p className="mt-1.5 text-sm text-ink-2">{serverMessage}</p> : null}
            {allErrors.length > 0 ? (
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
                {allErrors.map((error) => (
                  <li key={error.key}>
                    <a href={`#${fieldId(error.key)}`} className="text-danger-700 underline underline-offset-2">
                      {LABELS[error.key]}: {error.message}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-x-4 gap-y-4.5">
          <Legend>Legal details</Legend>
          <Field id={fieldId("legal_name")} label={LABELS.legal_name} required error={errors.legal_name?.message}>
            <Input {...field("legal_name")} autoComplete="organization" />
          </Field>
          <Field id={fieldId("trading_name")} label={LABELS.trading_name} help="If it trades under another name." error={errors.trading_name?.message}>
            <Input {...field("trading_name", "If it trades under another name.")} />
          </Field>
          <Field id={fieldId("country_code")} label={LABELS.country_code} required error={errors.country_code?.message}>
            <Select {...field("country_code")} autoComplete="country">
              <option value="">Choose a country</option>
              <optgroup label="Main countries">
                {countries.launch.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="All countries">
                {countries.other.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
          <Field id={fieldId("registration_number")} label={LABELS.registration_number} required error={errors.registration_number?.message}>
            <Input {...field("registration_number")} />
          </Field>
          <Field
            id={fieldId("registered_address")}
            label={LABELS.registered_address}
            required
            error={errors.registered_address?.message}
            className="col-span-full"
          >
            <Textarea {...field("registered_address")} rows={2} autoComplete="street-address" />
          </Field>
        </fieldset>

        <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-x-4 gap-y-4.5">
          <Legend>Contact</Legend>
          <Field id={fieldId("website")} label={LABELS.website} error={errors.website?.message}>
            <Input {...field("website")} type="url" inputMode="url" autoComplete="url" placeholder="https://" />
          </Field>
          <Field id={fieldId("contact_phone")} label={LABELS.contact_phone} error={errors.contact_phone?.message}>
            <Input {...field("contact_phone")} type="tel" autoComplete="tel" placeholder="+49 89 1234 5678" />
          </Field>
          <Field id={fieldId("contact_email")} label={LABELS.contact_email} error={errors.contact_email?.message}>
            <Input {...field("contact_email")} type="email" autoComplete="email" />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-4.5">
          <Legend>Branding</Legend>
          <LogoInput logo={logo} />
          <Field id={fieldId("brand_color")} label={LABELS.brand_color} help={brandHelp} error={errors.brand_color?.message}>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="color"
                aria-label="Pick brand colour"
                value={brandHex ?? "#0F6E5F"}
                onChange={(event) =>
                  setValue("brand_color", event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: !!errors.brand_color })
                }
                className="h-11 w-14 cursor-pointer rounded-lg border border-control bg-white p-1"
              />
              <Input {...field("brand_color", brandHelp)} className="w-36 font-mono uppercase" placeholder="#1F4E8C" spellCheck={false} />
              {accent?.darkened ? (
                <span aria-hidden className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                  <span className="size-5 rounded" style={{ background: accent.hex }} />
                  {accent.hex}
                </span>
              ) : null}
            </div>
          </Field>
        </fieldset>

        <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-x-4 gap-y-4.5">
          <Legend>Default signatory</Legend>
          <Field id={fieldId("signatory_name")} label="Name" required error={errors.signatory_name?.message}>
            <Input {...field("signatory_name")} autoComplete="name" />
          </Field>
          <Field id={fieldId("signatory_title")} label="Job title" required error={errors.signatory_title?.message}>
            <Input {...field("signatory_title")} autoComplete="organization-title" />
          </Field>
          <p className="col-span-full text-[13px] text-muted">You can change the signatory on any single letter.</p>
        </fieldset>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-white px-5 py-3.5 sm:px-7">
        <p className="basis-full text-[13px] text-muted sm:min-w-[200px] sm:flex-1 sm:basis-auto">{footerNote}</p>
        <Button variant="outline" onClick={onCancel} className="max-sm:flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="max-sm:flex-1">
          {pending ? "Saving…" : company ? "Save changes" : "Save company"}
        </Button>
      </footer>
    </form>
  );
}

function Legend({ children }: { children: string }) {
  return <legend className="mb-3 text-[13px] font-semibold tracking-[0.06em] text-ink-2 uppercase">{children}</legend>;
}

type LogoState = ReturnType<typeof useLogoInput>;

function useLogoInput(company?: EditableCompany) {
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const previewRef = useRef<string | undefined>(undefined);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    company?.logo_width && company.logo_height ? { width: company.logo_width, height: company.logo_height } : null,
  );

  function showPreview(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : undefined;
    setPreviewUrl(previewRef.current);
  }

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  return {
    file,
    removed,
    error,
    setError,
    size,
    setSize,
    url: previewUrl ?? (removed ? undefined : company?.logoUrl),
    choose(next: File | undefined) {
      if (!next) return;
      const problem = logoFileError(next);
      setError(problem);
      if (problem) return;
      setFile(next);
      showPreview(next);
      setRemoved(false);
    },
    remove() {
      setFile(null);
      showPreview(null);
      setError(undefined);
      setSize(null);
      setRemoved(Boolean(company?.logoUrl));
    },
  };
}

function LogoInput({ logo }: { logo: LogoState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = fieldId("logo");
  const describedBy = logo.error ? `${id}-error` : `${id}-help`;
  const details = logo.file
    ? `${logo.file.name} · ${Math.max(1, Math.round(logo.file.size / 1024))} KB`
    : logo.size
      ? `${logo.size.width} × ${logo.size.height} px`
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-ink">
        Logo
      </span>
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-xl border border-line bg-[#FBFBF9] p-3.5",
          logo.error && "border-2 border-danger",
        )}
      >
        <div className="flex h-16 w-40 shrink-0 items-center justify-center rounded-lg border border-line bg-white p-2">
          {logo.url ? (
            // Signed storage URLs and local previews: next/image would cache short-lived URLs for nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo.url}
              alt={logo.file ? "New logo preview" : "Current logo"}
              className="max-h-full max-w-full object-contain"
              onLoad={(event) => logo.file && logo.setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
          ) : (
            <span className="text-[13px] text-muted">No logo</span>
          )}
        </div>
        <div className="min-w-[160px] flex-1 text-[13px] leading-relaxed text-ink-2">
          {details ? <>{details}<br /></> : null}
          {logo.url ? "Shown at up to 56 px tall on letters." : "Without a logo, letters show the company name as a wordmark."}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" aria-describedby={describedBy} onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden />
            {logo.url ? "Replace" : "Upload logo"}
          </Button>
          {logo.url ? (
            <Button variant="ghost" onClick={logo.remove}>
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            logo.choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {logo.error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-[13px] text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {logo.error}
        </p>
      ) : (
        <p id={`${id}-help`} className="text-[13px] text-muted">
          {LOGO_HELP}
        </p>
      )}
    </div>
  );
}
