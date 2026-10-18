"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import {
  activateSubscription,
  addOneOffInvoice,
  changeStatus,
  markInvoicePaid,
  postUpdate,
  saveAdminNotes,
  saveDomain,
  saveMailbox,
  saveWebsite,
  voidInvoice,
} from "@/app/admin/websites/actions";
import { FormError, Submit, useSubmit } from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

// The forms on an admin website order: one per setup step, then activation, updates, invoices and status.

function Step({ title, done, children }: { title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-4", done ? "border-evergreen-100 bg-evergreen-50/40" : "border-line")}>
      <h3 className="flex items-center gap-2 font-semibold">
        <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs", done ? "bg-evergreen-600 text-white" : "ring-1 ring-control")}>
          {done ? <Check aria-hidden className="size-3.5" /> : null}
        </span>
        {title}
        {done ? <span className="text-xs font-normal text-evergreen-700">Done</span> : null}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function DomainStep({ id, done, defaults }: { id: string; done: boolean; defaults: { domain: string; registrar: string; cost: string; expiresOn: string } }) {
  const f = useId();
  const [values, setValues] = useState(defaults);
  const { pending, error, submit } = useSubmit();
  return (
    <Step title="Domain registered" done={done}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => saveDomain(id, values));
        }}
      >
        <Field id={`${f}-domain`} label="Domain" required>
          <Input id={`${f}-domain`} value={values.domain} onChange={(e) => setValues((v) => ({ ...v, domain: e.target.value }))} />
        </Field>
        <Field id={`${f}-expires`} label="Registered until" required>
          <Input id={`${f}-expires`} type="date" value={values.expiresOn} onChange={(e) => setValues((v) => ({ ...v, expiresOn: e.target.value }))} />
        </Field>
        <Field id={`${f}-registrar`} label="Registrar" help="Only the team sees this.">
          <Input id={`${f}-registrar`} value={values.registrar} maxLength={100} onChange={(e) => setValues((v) => ({ ...v, registrar: e.target.value }))} />
        </Field>
        <Field id={`${f}-cost`} label="What it cost (₹)" help="Only the team sees this.">
          <Input id={`${f}-cost`} inputMode="decimal" value={values.cost} onChange={(e) => setValues((v) => ({ ...v, cost: e.target.value }))} />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <FormError error={error} />
          <div>
            <Submit pending={pending} variant={done ? "secondary" : "primary"}>
              {done ? "Save domain" : "Mark domain registered"}
            </Submit>
          </div>
        </div>
      </form>
    </Step>
  );
}

export function WebsiteStep({ id, done, url }: { id: string; done: boolean; url: string }) {
  const f = useId();
  const [value, setValue] = useState(url);
  const { pending, error, submit } = useSubmit();
  return (
    <Step title="Website live" done={done}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => saveWebsite(id, { url: value }));
        }}
      >
        <Field id={`${f}-url`} label="Website address" required>
          <Input id={`${f}-url`} value={value} placeholder="https://mybusiness.in" onChange={(e) => setValue(e.target.value)} />
        </Field>
        <FormError error={error} />
        <div>
          <Submit pending={pending} variant={done ? "secondary" : "primary"}>
            {done ? "Save website" : "Mark website live"}
          </Submit>
        </div>
      </form>
    </Step>
  );
}

export function MailboxStep({ id, done, defaults }: { id: string; done: boolean; defaults: { address: string; provider: string } }) {
  const f = useId();
  const [values, setValues] = useState(defaults);
  const { pending, error, submit } = useSubmit();
  return (
    <Step title="Email ready" done={done}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => saveMailbox(id, values));
        }}
      >
        <Field id={`${f}-address`} label="Mailbox address" required>
          <Input id={`${f}-address`} value={values.address} onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))} />
        </Field>
        <Field id={`${f}-provider`} label="Email provider" required help="Send the provider’s invite to the customer; passwords never go in here.">
          <Input id={`${f}-provider`} value={values.provider} placeholder="Zoho Mail" onChange={(e) => setValues((v) => ({ ...v, provider: e.target.value }))} />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <FormError error={error} />
          <div>
            <Submit pending={pending} variant={done ? "secondary" : "primary"}>
              {done ? "Save mailbox" : "Mark email ready"}
            </Submit>
          </div>
        </div>
      </form>
    </Step>
  );
}

export function ActivateButton({ id, ready }: { id: string; ready: boolean }) {
  const { pending, error, submit } = useSubmit();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button disabled={!ready || pending} onClick={() => submit(() => activateSubscription(id))}>
          Activate and tell the customer
        </Button>
      </div>
      {!ready ? <p className="text-[13px] text-muted">Finish the three steps above first.</p> : null}
      <FormError error={error} />
    </div>
  );
}

export function UpdateForm({ id }: { id: string }) {
  const f = useId();
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState(true);
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => postUpdate(id, { message, visible, email }), () => setMessage(""));
      }}
    >
      <Field id={`${f}-message`} label="Update">
        <Textarea id={`${f}-message`} value={message} rows={3} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-x-5">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-5 accent-evergreen-600" />
          Show to the customer
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={email && visible} disabled={!visible} onChange={(e) => setEmail(e.target.checked)} className="size-5 accent-evergreen-600" />
          Email it to them
        </label>
      </div>
      <FormError error={error} />
      <div>
        <Submit pending={pending} variant="secondary">
          {visible ? "Post update" : "Add internal note"}
        </Submit>
      </div>
    </form>
  );
}

export function NotesForm({ id, notes }: { id: string; notes: string }) {
  const f = useId();
  const [value, setValue] = useState(notes);
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveAdminNotes(id, value));
      }}
    >
      <Field id={`${f}-notes`} label="Team notes" help="Never shown to the customer.">
        <Textarea id={`${f}-notes`} value={value} rows={3} maxLength={5000} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <FormError error={error} />
      <div>
        <Submit pending={pending} variant="secondary">
          Save notes
        </Submit>
      </div>
    </form>
  );
}

export function OneOffInvoiceForm({ id }: { id: string }) {
  const f = useId();
  const [values, setValues] = useState({ description: "", amount: "" });
  const { pending, error, submit } = useSubmit();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => addOneOffInvoice(id, values), () => setValues({ description: "", amount: "" }));
      }}
    >
      <Field id={`${f}-description`} label="Extra charge for" required>
        <Input id={`${f}-description`} value={values.description} placeholder="Domain above ₹1,499 (first year)" maxLength={200} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
      </Field>
      <Field id={`${f}-amount`} label="Amount (₹)" required>
        <Input id={`${f}-amount`} inputMode="decimal" value={values.amount} onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError error={error} />
        <div>
          <Submit pending={pending} variant="secondary">
            Add invoice
          </Submit>
        </div>
      </div>
    </form>
  );
}

/** Cancel an unpaid invoice, or record that it was paid outside PayU. Both need a reason. */
export function InvoiceActions({ invoiceId, label }: { invoiceId: string; label: string }) {
  const [mode, setMode] = useState<"void" | "paid" | null>(null);
  const [reason, setReason] = useState("");
  const { pending, error, submit } = useSubmit();
  if (!mode) {
    return (
      <span className="flex gap-1">
        <Button variant="ghost" className="min-h-9 px-2 text-[13px]" onClick={() => setMode("paid")} aria-label={`Mark ${label} as paid`}>
          Mark paid
        </Button>
        <Button variant="ghost" className="min-h-9 px-2 text-[13px] text-danger" onClick={() => setMode("void")} aria-label={`Cancel ${label}`}>
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => (mode === "void" ? voidInvoice(invoiceId, reason) : markInvoicePaid(invoiceId, reason)), () => setMode(null));
      }}
    >
      <Input aria-label={mode === "void" ? "Why it’s cancelled" : "How it was paid"} placeholder={mode === "void" ? "Why it’s cancelled" : "How it was paid (e.g. bank transfer reference)"} value={reason} onChange={(e) => setReason(e.target.value)} />
      <FormError error={error} />
      <span className="flex gap-2">
        <Submit pending={pending} variant={mode === "void" ? "danger" : "primary"}>
          {mode === "void" ? "Cancel invoice" : "Mark as paid"}
        </Submit>
        <Button variant="ghost" onClick={() => setMode(null)}>
          Back
        </Button>
      </span>
    </form>
  );
}

export function StatusForm({ id, status }: { id: string; status: string }) {
  const f = useId();
  const [reason, setReason] = useState("");
  const { pending, error, submit } = useSubmit();
  if (status === "cancelled") return <p className="text-sm text-ink-2">Cancelled.</p>;
  return (
    <div className="flex flex-col gap-3">
      {status === "suspended" ? (
        <div>
          <Button variant="secondary" disabled={pending} onClick={() => submit(() => changeStatus(id, "reinstate", ""))}>
            Reinstate
          </Button>
        </div>
      ) : null}
      <Field id={`${f}-reason`} label="Reason" help="Shown to the customer and emailed to them.">
        <Textarea id={`${f}-reason`} value={reason} rows={2} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <FormError error={error} />
      <span className="flex flex-wrap gap-2">
        {status !== "suspended" ? (
          <Button variant="danger-outline" disabled={pending} onClick={() => submit(() => changeStatus(id, "suspend", reason))}>
            Suspend
          </Button>
        ) : null}
        <Button variant="danger" disabled={pending} onClick={() => submit(() => changeStatus(id, "cancel", reason))}>
          Cancel the plan
        </Button>
      </span>
    </div>
  );
}
