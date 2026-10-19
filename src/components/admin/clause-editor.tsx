"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { approveClause, createClauseVersion, deleteDraft, saveClause, setClauseStatus } from "@/app/admin/clauses/actions";
import { Pill, REVIEW_LABELS } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlClass, Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { BlockView, LetterRenderProvider } from "@/letter-styles/kit";
import type { AdminResult } from "@/lib/admin/auth";
import { buildLetterDocument } from "@/lib/letter/build";
import { EXAMPLE_ENGINEERING } from "@/lib/letter/samples";
import type { FieldValues, LetterContext } from "@/lib/letter/types";
import { languageName } from "@/lib/letter/translation";
import { checkClause, translationMismatch, type ClauseField } from "@/lib/template/clause-check";
import { todayIso } from "@/lib/template/format";
import { cn } from "@/lib/utils";

// One clause version in the library: edit it as a draft, send it for review, approve it, or start a new version.
// The checks and the preview run as you type, with the same rules and letter builder the app uses.

type Status = "draft" | "in_review" | "approved";

export type ClauseHistoryEntry = { id: string; version: number; status: Status; lines: string[] };

type ClauseData = {
  id: string;
  sectionKey: string;
  sectionTitle: string;
  jurisdictionCode: string;
  jurisdictionLabel: string;
  /** "en", or the language of a translation ("de"). */
  language: string;
  version: number;
  status: Status;
  title: string;
  body: string;
  locked: boolean;
  lockedReason: string;
  editorHelp: string;
  legalNotes: string;
  reviewer: string;
  reviewedAt: string | null;
};

const STEPS: { status: Status; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "in_review", label: "In review" },
  { status: "approved", label: "Approved" },
];

export function ClauseEditor({
  clause,
  isLatest,
  fields,
  chain,
  context,
  sampleValues,
  history,
  translationOf,
}: {
  clause: ClauseData;
  isLatest: boolean;
  fields: ClauseField[];
  chain: string[];
  context: LetterContext | null;
  sampleValues: FieldValues;
  history: ClauseHistoryEntry[];
  /** For a translation: the latest English clause it must match. */
  translationOf?: { version: number; body: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [today] = useState(() => todayIso());
  const initial = { title: clause.title, body: clause.body, locked: clause.locked, lockedReason: clause.lockedReason, editorHelp: clause.editorHelp, legalNotes: clause.legalNotes };
  const [values, setValues] = useState(initial);
  const [review, setReview] = useState({ reviewer: clause.reviewer, reviewedOn: today });
  const editable = clause.status === "draft";
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.type === "checkbox" ? (event.target as HTMLInputElement).checked : event.target.value }));

  const check = useMemo(() => {
    const result = checkClause(values.body, { sectionKey: clause.sectionKey, fields, chain });
    // A translation prints the same values and tests the same answers as the English clause.
    const mismatch = clause.language === "en" ? null : translationOf ? translationMismatch(translationOf.body, values.body) : "there’s no English clause to translate";
    return mismatch ? { ...result, errors: [...result.errors, `Compared with English version ${translationOf?.version ?? "–"}: ${mismatch}`] } : result;
  }, [values.body, clause.sectionKey, clause.language, fields, chain, translationOf]);
  const translation = clause.language === "en" ? null : languageName(clause.language, "en");

  // The section as it prints in a sample letter for this country, with this text in place of the current one.
  const preview = useMemo(() => {
    if (!context || check.errors.length) return { section: null, failed: !context };
    try {
      const base = context.clauses[clause.sectionKey];
      const withThis: LetterContext = {
        ...context,
        clauses: {
          ...context.clauses,
          [clause.sectionKey]: {
            id: clause.id,
            sectionKey: clause.sectionKey,
            jurisdictionCode: clause.jurisdictionCode,
            jurisdictionName: base?.jurisdictionName ?? clause.jurisdictionLabel,
            title: values.title || null,
            body: values.body,
            locked: values.locked,
            lockedReason: values.locked ? values.lockedReason : null,
            editorHelp: values.editorHelp || null,
            reviewStatus: clause.status,
            version: clause.version,
          },
        },
      };
      const doc = buildLetterDocument(withThis, EXAMPLE_ENGINEERING, { name: "Preview", templateKey: "classic", accentColor: null, values: sampleValues, removedSections: [] }, { date: today });
      // The opening and the reply text sit outside the numbered sections.
      const edge = clause.sectionKey === "candidate" ? doc.opening : clause.sectionKey === "acceptance" ? doc.closing : null;
      const section = edge ? (edge.length ? { title: "", showHeading: false, blocks: edge } : null) : (doc.sections.find((s) => s.key === clause.sectionKey) ?? null);
      return { section, failed: false };
    } catch {
      return { section: null, failed: true };
    }
  }, [context, check.errors.length, clause, values, sampleValues, today]);

  const run = (action: () => Promise<AdminResult>, after?: () => void) =>
    start(async () => {
      const result = await action().catch(() => ({ ok: false as const, message: "That didn’t work. Check your connection and try again." }));
      if (result.message) toast(result.message);
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });

  const newVersion = () =>
    start(async () => {
      const result = await createClauseVersion(clause.sectionKey, clause.jurisdictionCode, clause.language);
      if (!result.ok) return toast(result.message);
      toast(`Version ${clause.version + 1} started as a draft.`);
      router.push(`/admin/clauses?${new URLSearchParams({ country: clause.jurisdictionCode, status: "all", lang: clause.language, id: result.id })}`);
    });

  const current = STEPS.findIndex((step) => step.status === clause.status);

  return (
    <section aria-labelledby="clause-heading" className="flex min-w-0 flex-col gap-5 rounded-2xl border border-line bg-white p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="clause-heading" className="text-xl font-semibold">
          {values.title || clause.sectionTitle}
        </h2>
        <Pill tone="success" className="bg-white ring-1 ring-evergreen-600">
          {clause.jurisdictionLabel} · {clause.jurisdictionCode}
        </Pill>
        {translation ? <Pill tone="neutral">{translation} translation</Pill> : null}
        <Pill tone={REVIEW_LABELS[clause.status].tone}>
          Version {clause.version} · {REVIEW_LABELS[clause.status].text}
        </Pill>
      </div>
      {translation ? (
        <p className="-mt-2 text-[13px] text-ink-2">
          Translates English version {translationOf?.version ?? "–"} of this section, with the same placeholders and conditions. Paid letters come with the {translation}{" "}
          translation once every section has an approved one; the English version prevails. Whether the section is required comes from the English clause.
        </p>
      ) : null}

      <ol aria-label="Review progress" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {STEPS.map((step, index) => (
          <li key={step.status} className="flex items-center gap-3" aria-current={index === current ? "step" : undefined}>
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                index < current || clause.status === "approved" ? "bg-evergreen-600 text-white" : index === current ? "ring-2 ring-marigold-700 text-ink" : "ring-1 ring-control text-muted",
              )}
            >
              {index < current || clause.status === "approved" ? <Check aria-hidden className="size-3.5" /> : index + 1}
            </span>
            <span className={cn(index <= current ? "font-semibold text-ink" : "text-muted")}>{step.label}</span>
            {index < STEPS.length - 1 ? <span aria-hidden className={cn("h-px w-10", index < current ? "bg-evergreen-600" : "bg-line")} /> : null}
          </li>
        ))}
      </ol>

      {!editable ? (
        <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-sm text-ink-2">
          {clause.status === "in_review"
            ? "In review: the text is frozen so the reviewer approves exactly what letters will print. Send it back to draft to change it."
            : `Approved${clause.reviewer ? ` by ${clause.reviewer}` : ""}. Approved clauses never change: start a new version to change the wording.`}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="clause-title" label="Heading in the letter" help={`Leave empty to use “${clause.sectionTitle}”.`}>
          <Input id="clause-title" value={values.title} maxLength={120} onChange={set("title")} readOnly={!editable} />
        </Field>
        <div className={cn("flex flex-col gap-2", translation && "hidden")}>
          <label className="flex min-h-11 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={values.locked} onChange={set("locked")} disabled={!editable} className="size-5 accent-evergreen-600" />
            Required in this country (users can’t remove it)
          </label>
          {values.locked ? (
            <Field id="clause-locked-reason" label="Reason shown to users" required>
              <Input id="clause-locked-reason" value={values.lockedReason} maxLength={120} onChange={set("lockedReason")} readOnly={!editable} placeholder={`Required in ${clause.jurisdictionLabel}`} />
            </Field>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="clause-body" className="text-sm font-semibold">
            Clause text
          </label>
          <span className="text-xs text-muted">Markdown subset · placeholders in double braces, e.g. {"{{position.start_date}}"}</span>
        </div>
        <textarea
          id="clause-body"
          value={values.body}
          onChange={set("body")}
          readOnly={!editable}
          rows={9}
          spellCheck
          aria-describedby="clause-check"
          aria-invalid={check.errors.length ? true : undefined}
          className={cn(controlClass, "min-h-[200px] py-3 font-mono text-[14px] leading-relaxed", !editable && "bg-[#F7F7F4]")}
        />
        <div id="clause-check" aria-live="polite" className="text-[13px]">
          {check.errors.length ? (
            <ul className="flex flex-col gap-1 text-danger">
              {check.errors.map((error) => (
                <li key={error} className="flex items-start gap-1.5">
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-evergreen-700">
              <Check aria-hidden className="size-3.5" />
              {check.placeholders} {check.placeholders === 1 ? "placeholder" : "placeholders"}, all defined · {check.conditions ? `${check.conditions} ${check.conditions === 1 ? "condition" : "conditions"}, balanced` : "no conditions"} · no raw HTML
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Preview with sample answers</h3>
        <div className="mt-2 rounded-xl bg-canvas px-5 py-4 font-serif text-[15px] leading-relaxed text-ink">
          {preview.section ? (
            <LetterRenderProvider chips="static">
              {preview.section.showHeading ? <h4 className="mb-1 font-sans text-sm font-semibold text-[#1F4E8C]">{preview.section.title}</h4> : null}
              {preview.section.blocks.map((block, index) => (
                <BlockView key={index} block={block} first={index === 0} look={{ gap: { paragraph: 8, list: 6, table: 8, heading: 10 } }} />
              ))}
            </LetterRenderProvider>
          ) : (
            <p className="font-sans text-sm text-ink-2">
              {check.errors.length
                ? "Fix the text to see the preview."
                : preview.failed
                  ? "The preview isn’t available for this country."
                  : "With the sample answers this section is empty, so a letter leaves it out."}
            </p>
          )}
        </div>
      </div>

      <Field id="clause-help" label="Help shown to users above the section’s fields">
        <Textarea id="clause-help" value={values.editorHelp} maxLength={500} onChange={set("editorHelp")} readOnly={!editable} />
      </Field>
      <Field id="clause-notes" label={<>Legal notes for admins <span className="font-normal text-muted">· never shown to users</span></>}>
        <Textarea id="clause-notes" value={values.legalNotes} maxLength={5000} rows={3} onChange={set("legalNotes")} readOnly={!editable} />
      </Field>

      <div className="flex flex-col gap-3 border-t border-line-soft pt-5">
        {clause.status === "draft" ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <ActionButton pending={pending} disabled={!dirty || check.errors.length > 0} onClick={() => run(() => saveClause(clause.id, values))}>
              Save draft
            </ActionButton>
            <ActionButton
              pending={pending}
              variant="secondary"
              disabled={dirty || check.errors.length > 0}
              onClick={() => run(() => setClauseStatus(clause.id, "in_review"))}
            >
              Send for review
            </ActionButton>
            <Button variant="danger-outline" disabled={pending} onClick={() => setConfirmDelete(true)}>
              Delete draft
            </Button>
            {dirty ? <span className="text-[13px] text-muted">Save the draft before sending it for review.</span> : null}
            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title={`Delete version ${clause.version}?`}
              description="The draft is deleted for good. Approved versions and letters already issued aren’t affected."
              confirmLabel="Delete draft"
              pending={pending}
              onConfirm={() => run(() => deleteDraft(clause.id), () => router.push(`/admin/clauses?${new URLSearchParams({ country: clause.jurisdictionCode, status: "all" })}`))}
            />
          </div>
        ) : null}

        {clause.status === "in_review" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <Field id="clause-reviewer" label="Reviewer" required help="The lawyer and firm who checked it.">
                <Input id="clause-reviewer" value={review.reviewer} maxLength={200} placeholder="Name, firm" onChange={(e) => setReview((r) => ({ ...r, reviewer: e.target.value }))} />
              </Field>
              <Field id="clause-review-date" label="Review date" required>
                <Input id="clause-review-date" type="date" max={today} value={review.reviewedOn} onChange={(e) => setReview((r) => ({ ...r, reviewedOn: e.target.value }))} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <ActionButton pending={pending} onClick={() => run(() => approveClause(clause.id, review))}>
                Approve version {clause.version}
              </ActionButton>
              <ActionButton pending={pending} variant="secondary" onClick={() => run(() => setClauseStatus(clause.id, "draft"))}>
                Send back to draft
              </ActionButton>
            </div>
          </>
        ) : null}

        {clause.status === "approved" ? (
          isLatest ? (
            <div>
              <ActionButton pending={pending} variant="secondary" onClick={newVersion}>
                Start version {clause.version + 1}
              </ActionButton>
            </div>
          ) : (
            <p className="text-sm text-ink-2">A newer version of this clause exists. Letters use the newest approved one.</p>
          )
        ) : null}
      </div>

      <div className="border-t border-line-soft pt-5">
        <h3 className="text-sm font-semibold">
          Version history · {history.length} {history.length === 1 ? "version" : "versions"}
        </h3>
        <ol className="mt-2 flex flex-col gap-2.5">
          {history.map((entry) => (
            <li key={entry.id} className={cn("rounded-lg px-3 py-2 text-[13px]", entry.id === clause.id ? "bg-evergreen-50" : "bg-canvas")}>
              <p className="flex items-center gap-2 font-semibold">
                v{entry.version}
                <Pill tone={REVIEW_LABELS[entry.status].tone} className="h-5 px-2 text-xs">
                  {REVIEW_LABELS[entry.status].text}
                </Pill>
              </p>
              <ul className="mt-1 text-ink-2">
                {entry.lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ActionButton({
  pending,
  disabled,
  onClick,
  children,
  variant = "primary",
}: {
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Button variant={variant} disabled={pending || disabled} onClick={onClick}>
      {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </Button>
  );
}
