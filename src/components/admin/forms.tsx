"use client";

import { Ban, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addPrice, liftSuspension, recordRefund, saveCountryNotes, saveStyle, setCompanyLimit, suspendCompany, updateReport } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import type { AdminResult } from "@/lib/admin/auth";

// The forms on the admin pages. Each shows the server's answer as a toast (and inline when it failed).

function useSubmit() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const submit = (action: () => Promise<AdminResult>, onDone?: () => void) =>
    start(async () => {
      const result = await action().catch(() => ({ ok: false as const, message: "That didn’t work. Check your connection and try again." }));
      setError(result.ok ? null : result.message);
      if (result.ok) {
        if (result.message) toast(result.message);
        onDone?.();
        router.refresh();
      }
    });
  return { pending, error, submit };
}

function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;
}

function Submit({ pending, children, variant = "primary" }: { pending: boolean; children: React.ReactNode; variant?: "primary" | "secondary" | "danger" }) {
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </Button>
  );
}

export function CountryNotesForm({ code, publicNote, adminNotes }: { code: string; publicNote: string; adminNotes: string }) {
  const id = useId();
  const [values, setValues] = useState({ publicNote, adminNotes });
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit(() => saveCountryNotes(code, values));
      }}
    >
      <Field id={`${id}-public`} label="Note shown to users" help="Shown when someone picks this country, e.g. why it isn’t available yet. Up to 300 characters.">
        <Textarea id={`${id}-public`} value={values.publicNote} maxLength={300} onChange={(e) => setValues((v) => ({ ...v, publicNote: e.target.value }))} />
      </Field>
      <Field id={`${id}-admin`} label="Notes for admins" help="Never shown to users.">
        <Textarea id={`${id}-admin`} value={values.adminNotes} maxLength={2000} onChange={(e) => setValues((v) => ({ ...v, adminNotes: e.target.value }))} />
      </Field>
      <FormError error={error} />
      <div>
        <Submit pending={pending}>Save notes</Submit>
      </div>
    </form>
  );
}

export function StyleForm({ styleKey, name, description, defaultAccent, sortOrder }: { styleKey: string; name: string; description: string; defaultAccent: string; sortOrder: number }) {
  const id = useId();
  const [values, setValues] = useState({ name, description, defaultAccent, sortOrder: String(sortOrder) });
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit(() => saveStyle(styleKey, values));
      }}
    >
      <Field id={`${id}-name`} label="Name" required>
        <Input id={`${id}-name`} value={values.name} maxLength={60} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
      </Field>
      <Field id={`${id}-order`} label="Order in lists" required>
        <Input id={`${id}-order`} type="number" min={0} max={1000} value={values.sortOrder} onChange={(e) => setValues((v) => ({ ...v, sortOrder: e.target.value }))} />
      </Field>
      <Field id={`${id}-description`} label="Description" className="sm:col-span-2">
        <Input id={`${id}-description`} value={values.description} maxLength={300} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
      </Field>
      <Field id={`${id}-accent`} label="Default colour" required help="Used when a company has no brand colour.">
        <div className="flex items-center gap-2">
          <input
            aria-label="Pick the default colour"
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(values.defaultAccent) ? values.defaultAccent.toLowerCase() : "#1f4e8c"}
            onChange={(e) => setValues((v) => ({ ...v, defaultAccent: e.target.value.toUpperCase() }))}
            className="h-11 w-12 cursor-pointer rounded-lg border border-control bg-white p-1"
          />
          <Input id={`${id}-accent`} value={values.defaultAccent} maxLength={7} className="font-mono" onChange={(e) => setValues((v) => ({ ...v, defaultAccent: e.target.value }))} />
        </div>
      </Field>
      <div className="flex flex-col justify-end gap-2 sm:col-span-2">
        <FormError error={error} />
        <div>
          <Submit pending={pending}>Save style</Submit>
        </div>
      </div>
    </form>
  );
}

export function AddPriceForm() {
  const id = useId();
  const [values, setValues] = useState({ purpose: "charge" as "display" | "charge", currency: "INR", amount: "", notes: "", activate: false });
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit(() => addPrice(values), () => setValues((v) => ({ ...v, amount: "", notes: "", activate: false })));
      }}
    >
      <Field id={`${id}-purpose`} label="Used for" required>
        <Select id={`${id}-purpose`} value={values.purpose} onChange={(e) => setValues((v) => ({ ...v, purpose: e.target.value as "display" | "charge" }))}>
          <option value="charge">Charge: the amount sent to PayU</option>
          <option value="display">Display: shown on the site and at checkout</option>
        </Select>
      </Field>
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <Field id={`${id}-currency`} label="Currency" required>
          <Input id={`${id}-currency`} value={values.currency} maxLength={3} className="uppercase" onChange={(e) => setValues((v) => ({ ...v, currency: e.target.value }))} />
        </Field>
        <Field id={`${id}-amount`} label="Amount" required>
          <Input id={`${id}-amount`} inputMode="decimal" placeholder="499.00" value={values.amount} onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))} />
        </Field>
      </div>
      <Field id={`${id}-notes`} label="Notes" className="sm:col-span-2">
        <Input id={`${id}-notes`} value={values.notes} maxLength={300} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
      </Field>
      <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
        <input type="checkbox" checked={values.activate} onChange={(e) => setValues((v) => ({ ...v, activate: e.target.checked }))} className="size-5 accent-evergreen-600" />
        Switch it on now (the current {values.purpose} price is switched off)
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError error={error} />
        <div>
          <Submit pending={pending}>Add price</Submit>
        </div>
      </div>
    </form>
  );
}

export function CompanyLimitForm({ ownerId, limit }: { ownerId: string; limit: number }) {
  const id = useId();
  const [value, setValue] = useState(String(limit));
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit(() => setCompanyLimit(ownerId, Number(value)));
      }}
    >
      <label htmlFor={`${id}-limit`} className="text-sm font-semibold">
        Company limit
      </label>
      <div className="flex gap-2.5">
        <Input id={`${id}-limit`} type="number" min={0} max={100} value={value} onChange={(e) => setValue(e.target.value)} className="w-24" />
        <Submit pending={pending} variant="secondary">
          Save limit
        </Submit>
      </div>
      <FormError error={error} />
    </form>
  );
}

export function SuspendForm({ companyId, suspended, reason }: { companyId: string; suspended: boolean; reason: string | null }) {
  const id = useId();
  const [text, setText] = useState("");
  const { pending, error, submit } = useSubmit();
  if (suspended) {
    return (
      <div className="flex flex-col gap-2.5 rounded-xl border border-danger/40 bg-danger-50 p-4">
        <p className="flex items-center gap-2 font-semibold text-danger-700">
          <Ban aria-hidden className="size-4" />
          Suspended
        </p>
        {reason ? <p className="text-sm text-ink-2">Reason given to the owner: {reason}</p> : null}
        <FormError error={error} />
        <div>
          <Button variant="secondary" disabled={pending} onClick={() => submit(() => liftSuspension(companyId))}>
            {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
            Lift the suspension
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2.5 rounded-xl border border-danger/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(() => suspendCompany(companyId, text), () => setText(""));
      }}
    >
      <h3 className="font-semibold text-danger-700">Suspend this company</h3>
      <p className="text-sm text-ink-2">Blocks new letters and payments for this company. Letters already issued stay downloadable by the owner. We email the owner the reason.</p>
      <Field id={`${id}-reason`} label="Reason" required help="Shown to the owner.">
        <Textarea id={`${id}-reason`} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      </Field>
      <FormError error={error} />
      <div>
        <Submit pending={pending} variant="danger">
          Suspend company
        </Submit>
      </div>
    </form>
  );
}

export function ReportForm({
  reportId,
  status,
  adminNotes,
  companyId,
  companies,
}: {
  reportId: string;
  status: "new" | "investigating" | "closed";
  adminNotes: string;
  companyId: string | null;
  companies: { id: string; label: string }[];
}) {
  const id = useId();
  const [values, setValues] = useState({ status, adminNotes, companyId });
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit(() => updateReport(reportId, values));
      }}
    >
      <Field id={`${id}-status`} label="Status" required>
        <Select id={`${id}-status`} value={values.status} onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as typeof status }))}>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="closed">Closed</option>
        </Select>
      </Field>
      <Field id={`${id}-company`} label="Company it’s about" help="Companies whose name matches the report.">
        <Select id={`${id}-company`} value={values.companyId ?? ""} onChange={(e) => setValues((v) => ({ ...v, companyId: e.target.value || null }))}>
          <option value="">Not linked</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${id}-notes`} label="Notes for admins">
        <Textarea id={`${id}-notes`} value={values.adminNotes} maxLength={5000} rows={4} onChange={(e) => setValues((v) => ({ ...v, adminNotes: e.target.value }))} />
      </Field>
      <FormError error={error} />
      <div>
        <Submit pending={pending}>Save report</Submit>
      </div>
    </form>
  );
}

export function RefundForm({ txnid, amount }: { txnid: string; amount: string }) {
  const id = useId();
  const [note, setNote] = useState("");
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-2.5 rounded-xl border border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(() => recordRefund(txnid, note), () => setNote(""));
      }}
    >
      <h3 className="font-semibold">Record a refund</h3>
      <p className="text-sm text-ink-2">
        Refund {amount} in the PayU dashboard first, then record it here. The letter’s PDFs stay available, but its free corrections end.
      </p>
      <Field id={`${id}-note`} label="Refund note" required help="Why, and PayU’s refund reference.">
        <Textarea id={`${id}-note`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormError error={error} />
      <div>
        <Submit pending={pending} variant="danger">
          Record refund
        </Submit>
      </div>
    </form>
  );
}
