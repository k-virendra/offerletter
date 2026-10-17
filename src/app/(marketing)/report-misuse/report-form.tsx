"use client";

import { CircleCheck, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps, Input, Textarea } from "@/components/ui/field";
import { submitReport, type ReportInput } from "./actions";

export function ReportForm() {
  const [values, setValues] = useState<ReportInput>({ reporterEmail: "", companyName: "", letterReference: "", description: "", website: "" });
  const [error, setError] = useState<{ message: string; field?: keyof ReportInput } | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const set = (key: keyof ReportInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const fieldError = (key: keyof ReportInput) => (error?.field === key ? error.message : undefined);

  if (sent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-line bg-white p-6">
        <CircleCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-evergreen-600" />
        <div>
          <h2 className="text-lg font-semibold">Thank you. We’ve got your report.</h2>
          <p className="mt-1 text-ink-2">We review every report. If you gave your email, we may write to you with questions. If you were asked to pay money to get or keep a job, don’t pay it.</p>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await submitReport(values).catch(() => ({ ok: false as const, message: "We couldn’t reach the server. Try again." }));
          if (result.ok) setSent(true);
          else {
            setError(result);
            if ("field" in result && result.field) document.getElementById(`report-${result.field}`)?.focus();
          }
        });
      }}
    >
      <Field id="report-description" label="What happened?" required error={fieldError("description")} help="For example: the company asked me to pay a fee, or we never sent this letter.">
        <Textarea {...fieldControlProps("report-description", { error: fieldError("description") })} value={values.description} onChange={set("description")} rows={5} maxLength={5000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="report-companyName" label="Company named in the letter" error={fieldError("companyName")}>
          <Input {...fieldControlProps("report-companyName", { error: fieldError("companyName") })} value={values.companyName} onChange={set("companyName")} maxLength={200} />
        </Field>
        <Field id="report-letterReference" label="Reference, if you have one" error={fieldError("letterReference")} help="A payment reference (OLP-…) or the letter’s fingerprint.">
          <Input {...fieldControlProps("report-letterReference", { error: fieldError("letterReference") })} value={values.letterReference} onChange={set("letterReference")} maxLength={200} />
        </Field>
      </div>
      <Field id="report-reporterEmail" label="Your email" error={fieldError("reporterEmail")} help="Only if you’d like us to be able to reply.">
        <Input {...fieldControlProps("report-reporterEmail", { error: fieldError("reporterEmail") })} type="email" autoComplete="email" value={values.reporterEmail} onChange={set("reporterEmail")} maxLength={254} />
      </Field>
      {/* Left empty by people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
        </label>
      </div>
      {error && !error.field ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
          Send report
        </Button>
      </div>
    </form>
  );
}
