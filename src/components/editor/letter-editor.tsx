"use client";

import { ArrowLeft, Check, CircleAlert, CloudOff, FilePenLine, FileText, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { changeLetterCountry } from "@/app/(editor)/letters/actions";
import { ChangeCountryDialog } from "@/components/editor/change-country-dialog";
import { fieldDomId, SectionCard, sectionHeadingId, type FieldNote } from "@/components/editor/section-card";
import { PreviewPane } from "@/components/editor/preview-pane";
import { recoverBackup, useAutosave, type SaveStatus } from "@/components/editor/use-autosave";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { normalizeHex, readableAccent } from "@/lib/color";
import { companyInitials } from "@/lib/companies/format";
import { buildLetterDocument } from "@/lib/letter/build";
import { LOCKED_IN_CORRECTIONS } from "@/lib/letter/corrections";
import { crossFieldErrors, fieldError, isEmptyValue, letterSections, missingFields, sectionLock } from "@/lib/letter/fields";
import { automaticName, DEFAULT_LETTER_NAME } from "@/lib/letter/naming";
import type { JurisdictionOption } from "@/lib/letter/context.server";
import type { FieldDefinition, FieldValue, LetterCompany, LetterContext, LetterDocument, LetterState, Run } from "@/lib/letter/types";
import { formatDay, formatMoney, parseAmount, payFigures } from "@/lib/template/format";
import { cn } from "@/lib/utils";

const PAPER_LABEL = { a4: "A4 paper", letter: "US Letter paper" } as const;
const LOCKED = new Set<string>(LOCKED_IN_CORRECTIONS);

// Below this width the form and the preview take turns (the toggle); the hidden one isn't rendered.
const SIDE_BY_SIDE = "(min-width: 1024px)";
function useSideBySide() {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(SIDE_BY_SIDE);
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => window.matchMedia(SIDE_BY_SIDE).matches,
    () => true,
  );
}

function chipFields(doc: LetterDocument): Set<string> {
  const found = new Set<string>();
  const walk = (runs: Run[]) => {
    for (const run of runs) {
      if (run.kind === "missing") found.add(run.field);
      if (run.kind === "strong" || run.kind === "em") walk(run.children);
    }
  };
  const blocks = [...doc.opening, ...doc.sections.flatMap((s) => s.blocks), ...doc.closing];
  for (const block of blocks) {
    if (block.kind === "list") block.items.forEach(walk);
    else if (block.kind === "table") [...block.header, ...block.rows.flat()].forEach(walk);
    else walk(block.runs);
  }
  [doc.recipient.name, doc.title.subject, doc.dateLine, doc.signatures.company.name, doc.signatures.company.title].forEach(walk);
  return found;
}

export function LetterEditor({
  letterId,
  initialState,
  editedAt,
  context,
  company,
  companySummary,
  today,
  price,
  jurisdictions,
  correction,
}: {
  letterId: string;
  initialState: LetterState;
  editedAt: string;
  context: LetterContext;
  company: LetterCompany;
  companySummary: string;
  today: string;
  price: string;
  jurisdictions: JurisdictionOption[];
  /** A free correction of a paid letter: the version it corrects and when the free period ends. */
  correction?: { version: number; until: string };
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<"form" | "preview">("form");
  const [flash, setFlash] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const nameEdited = useRef(initialState.name !== DEFAULT_LETTER_NAME && initialState.name !== automaticName(initialState.values));

  // A copy kept on this device after a failed save comes back on reload (after hydration, so the server's
  // version renders first).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const recovered = recoverBackup(letterId, editedAt);
      if (!recovered) return;
      setState(recovered);
      toast("We restored changes that hadn’t been saved yet.");
    });
    return () => window.clearTimeout(timer);
  }, [letterId, editedAt]);

  const autosave = useAutosave({
    letterId,
    editedAt,
    state,
    onLocked: (message) => {
      // The country now requires a section the user removed: put back every locked one.
      setState((current) => ({
        ...current,
        removedSections: current.removedSections.filter((key) => {
          const section = context.sections.find((s) => s.key === key);
          return section ? !sectionLock(context, section) : false;
        }),
      }));
      toast(message);
    },
  });

  const sideBySide = useSideBySide();
  const deferred = useDeferredValue(state);
  const doc = useMemo(() => buildLetterDocument(context, company, deferred, { date: today }), [context, company, deferred, today]);

  const sections = letterSections(context, state.removedSections);
  const fieldsBySection = useMemo(() => {
    const map = new Map<string, FieldDefinition[]>();
    for (const field of context.fields) map.set(field.sectionKey, [...(map.get(field.sectionKey) ?? []), field]);
    return map;
  }, [context.fields]);

  // Required fields still empty, plus any chip in the letter, in letter order.
  const missing = useMemo(() => {
    const chips = chipFields(doc);
    const order = sections.flatMap((section) => fieldsBySection.get(section.key) ?? []);
    const required = new Set(missingFields(context, state).map((f) => f.key));
    return order.filter((field) => required.has(field.key) || (chips.has(field.key) && isEmptyValue(state.values[field.key])));
  }, [doc, sections, fieldsBySection, context, state]);
  const missingKeys = new Set(missing.map((f) => f.key));

  const cross = crossFieldErrors(state.values, context.jurisdiction.code);
  const pay = payFigures(parseAmount(String(state.values["pay.base_amount"] ?? "")), String(state.values["pay.period"] ?? "year"), String(state.values["pay.frequency"] ?? "monthly"));
  const noteFor = (field: FieldDefinition): FieldNote | undefined => {
    const value = state.values[field.key];
    const error = touched.has(field.key) || !isEmptyValue(value) ? (fieldError(field, value, today) ?? cross[field.key]) : undefined;
    if (error) return { kind: "error", text: error };
    if (missingKeys.has(field.key)) return { kind: "required", text: correction ? "Required. Fill this in before you issue the correction." : "Required. Fill this in before you pay." };
    if (field.key === "pay.base_amount" && pay) {
      return { kind: "info", text: `That is ${formatMoney(pay.perInstalment, context.jurisdiction.currency, context.jurisdiction.locale, true)} in each of ${pay.instalments} payments a year.` };
    }
    return field.help ? { kind: "info", text: field.help } : undefined;
  };

  const setValue = (key: string, value: FieldValue) =>
    setState((current) => {
      const values = { ...current.values, [key]: value };
      const name = nameEdited.current ? current.name : automaticName(values);
      return { ...current, values, name };
    });

  // Focus moves to the next section's heading after a removal, and to a restored section's heading.
  const focusSection = (key: string) => requestAnimationFrame(() => document.getElementById(sectionHeadingId(key))?.focus());

  const restoreSection = useCallback((key: string, title: string, fromToast: boolean) => {
    setState((current) => ({ ...current, removedSections: current.removedSections.filter((k) => k !== key) }));
    focusSection(key);
    if (!fromToast) toast(`${title} restored.`);
  }, []);

  const removeSection = (key: string, title: string) => {
    const index = sections.findIndex((s) => s.key === key);
    const next = sections[index + 1] ?? sections[index - 1];
    setState((current) => ({ ...current, removedSections: [...current.removedSections.filter((k) => k !== key), key] }));
    if (next) focusSection(next.key);
    toast(`${title} removed from the letter.`, { label: "Undo", altText: `Restore ${title}`, onClick: () => restoreSection(key, title, true) });
  };

  const jumpTo = useCallback((key: string) => {
    setView("form");
    setFlash(key);
    window.setTimeout(() => setFlash((current) => (current === key ? null : current)), 1800);
    window.setTimeout(() => {
      const element = document.getElementById(fieldDomId(key));
      element?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      element?.focus({ preventScroll: true });
    }, 40);
  }, []);

  const jumpNext = () => {
    const active = document.activeElement?.id;
    const index = missing.findIndex((f) => fieldDomId(f.key) === active);
    const next = missing[(index + 1) % missing.length];
    if (next) jumpTo(next.key);
  };

  // Before paying or issuing a correction: everything saved, nothing missing or invalid.
  const readyToIssue = async (): Promise<boolean> => {
    const saved = await autosave.flush();
    if (missing[0]) {
      jumpTo(missing[0].key);
      return false;
    }
    const invalid = sections.flatMap((s) => fieldsBySection.get(s.key) ?? []).find((f) => fieldError(f, state.values[f.key], today) ?? cross[f.key]);
    if (invalid) {
      setTouched((current) => new Set([...current, invalid.key]));
      jumpTo(invalid.key);
      return false;
    }
    if (!saved) {
      toast(correction ? "Save your changes first: the corrected letter must match the screen." : "Save your changes first: the letter you pay for must match the screen.");
      return false;
    }
    return true;
  };

  const payAndDownload = async () => {
    if (await readyToIssue()) router.push(`/letters/${letterId}/checkout`);
  };

  const askToIssueCorrection = async () => {
    if (await readyToIssue()) setConfirmIssue(true);
  };

  const issueCorrection = async () => {
    setIssuing(true);
    const response = await fetch(`/api/letters/${letterId}/corrections`, { method: "POST" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { version?: number; error?: string } | null;
    if (!response?.ok || !body?.version) {
      setIssuing(false);
      setConfirmIssue(false);
      toast(body?.error ?? "We couldn’t issue the corrected version. Check your connection and try again.");
      return;
    }
    router.push(`/letters/${letterId}`);
  };

  // The tab opens straight away (inside the click, so pop-up blockers allow it); the PDF loads once any pending
  // change is saved, so the preview always matches the screen.
  const previewPdf = async () => {
    const tab = window.open("about:blank", "_blank");
    if (tab) {
      tab.document.title = "Preparing your preview…";
      tab.document.body.style.font = "16px system-ui, sans-serif";
      tab.document.body.textContent = "Preparing your preview…";
    }
    await autosave.flush();
    // A PDF, not an app page: plain navigation, not the router.
    const url = new URL(`/api/letters/${letterId}/preview-pdf`, window.location.origin).href;
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  };

  const changeCountry = async (code: string) => {
    await autosave.flush();
    const result = await changeLetterCountry(letterId, autosave.editedAt(), code);
    if (!result.ok) {
      toast(result.message);
      return false;
    }
    const dropped = result.dropped.length
      ? ` ${result.dropped.length === 1 ? "One answer doesn’t" : `${result.dropped.length} answers don’t`} apply there and ${result.dropped.length === 1 ? "was" : "were"} removed: ${result.dropped.join(", ")}.`
      : "";
    toast(`Now using ${result.name} wording.${dropped}`);
    router.refresh();
    return true;
  };

  const template = context.templates.find((t) => t.key === state.templateKey);
  const accentInput = normalizeHex(state.accentColor ?? "") ?? normalizeHex(company.brandColor ?? "") ?? template?.defaultAccent ?? "#1F4E8C";
  const accent = readableAccent(accentInput);
  const removed = context.sections.filter((s) => context.clauses[s.key] && state.removedSections.includes(s.key));

  return (
    <div className="flex h-dvh flex-col bg-canvas" data-view={view}>
      <header className="flex min-h-[68px] flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line bg-white px-3 py-2.5 md:px-5">
        <div className="flex min-w-0 flex-[1_1_320px] items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href={correction ? `/letters/${letterId}` : "/dashboard"} aria-label={correction ? "Back to the letter" : "Back to letters"}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="flex min-w-0 flex-1 flex-col">
            <label htmlFor="letter-name" className="text-xs text-muted">
              Letter name
            </label>
            <input
              id="letter-name"
              value={state.name}
              maxLength={200}
              onChange={(event) => {
                nameEdited.current = true;
                setState((current) => ({ ...current, name: event.target.value }));
              }}
              onBlur={(event) => {
                if (!event.target.value.trim()) {
                  nameEdited.current = false;
                  setState((current) => ({ ...current, name: automaticName(current.values) }));
                }
                autosave.retry();
              }}
              className="-ml-1 min-w-0 rounded-md px-1 text-base font-semibold text-ink outline-none hover:bg-ghost-hover focus-visible:bg-white"
            />
          </div>
          <SaveIndicator status={autosave.status} message={autosave.message} onRetry={autosave.retry} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="hidden items-center gap-2 text-sm text-ink-2 lg:flex">
            Style
            <select
              value={state.templateKey}
              onChange={(event) => setState((current) => ({ ...current, templateKey: event.target.value }))}
              className="h-11 rounded-lg border border-control bg-white px-2.5 text-sm font-semibold text-ink"
            >
              {context.templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="hidden items-center gap-2 lg:flex">
            <label htmlFor="brand-colour" className="text-sm text-ink-2">
              Brand colour
            </label>
            <input
              id="brand-colour"
              type="color"
              value={accentInput.toLowerCase()}
              aria-describedby="brand-colour-note"
              onChange={(event) => setState((current) => ({ ...current, accentColor: event.target.value.toUpperCase() }))}
              className="h-11 w-12 cursor-pointer rounded-lg border border-control bg-white p-1"
            />
            <span id="brand-colour-note" className="flex flex-col text-xs leading-tight">
              <span className="font-mono font-semibold">{accent.hex}</span>
              <span className="text-muted">{accent.darkened ? "Darkened for text" : "Readable as is"}</span>
            </span>
          </div>
          <Button variant="secondary" onClick={() => void previewPdf()} aria-describedby="preview-pdf-note">
            <FileText aria-hidden />
            Preview PDF
          </Button>
          <span id="preview-pdf-note" className="sr-only">
            Opens a watermarked PDF in a new tab.
          </span>
          {correction ? (
            <Button onClick={() => void askToIssueCorrection()}>
              <FilePenLine aria-hidden />
              Issue corrected version
            </Button>
          ) : (
            <Button onClick={() => void payAndDownload()}>Pay &amp; download{price ? ` · ${price}` : ""}</Button>
          )}
        </div>
      </header>

      {correction ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#BCD0F0] bg-info-50 px-5 py-2.5 text-sm text-info">
            <FilePenLine aria-hidden className="size-4 shrink-0" />
            <span className="flex-1">
              <strong className="font-semibold">Correcting version {correction.version}</strong>, free until{" "}
              {formatDay(correction.until)}. Version {correction.version} stays in the
              letter’s history. The candidate’s name and the job title can’t change.
            </span>
          </div>
          <ConfirmDialog
            open={confirmIssue}
            onOpenChange={(open) => !issuing && setConfirmIssue(open)}
            title={`Issue version ${correction.version + 1}?`}
            description={`The corrected letter becomes the latest version, with a new PDF. Version ${correction.version} stays available to download from the letter’s page.`}
            confirmLabel={`Issue version ${correction.version + 1}`}
            pendingLabel="Issuing…"
            tone="primary"
            pending={issuing}
            onConfirm={() => void issueCorrection()}
          />
        </>
      ) : null}

      {autosave.status === "conflict" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b-2 border-danger bg-[#FFFBFA] px-5 py-3 text-sm text-danger-700">
          <TriangleAlert aria-hidden className="size-4" />
          <span className="flex-1">{autosave.message ?? "This letter was changed somewhere else."} Reload to see the latest version; your changes here are kept on this device.</span>
          <Button variant="danger-outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      ) : null}

      <div className="flex gap-1.5 border-b border-line bg-white px-4 py-2 lg:hidden" role="group" aria-label="Show form or preview">
        {(["form", "preview"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold",
              view === option ? "bg-evergreen-50 text-evergreen-700" : "text-ink-2 hover:bg-ghost-hover",
            )}
          >
            {option === "form" ? "Form" : "Preview"}
            {option === "form" && missing.length ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-marigold-500 px-1.5 text-xs text-ink">{missing.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(440px,560px)_minmax(0,1fr)]">
        <section aria-labelledby="form-heading" className={cn("overflow-y-auto border-line bg-canvas px-4 pt-6 pb-28 md:px-6 lg:border-r", view === "preview" && "max-lg:hidden")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-evergreen-700">{correction ? `Free correction of version ${correction.version}` : "Step 2 of 3 · Fill in the details"}</p>
              <h1 id="form-heading" className="font-display text-[30px] leading-tight font-medium">
                Letter details
              </h1>
            </div>
            <div className="flex items-center gap-1.5" aria-live="polite">
              {missing.length ? (
                <>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-marigold-100 px-2.5 text-[13px] font-semibold text-marigold-800">
                    <CircleAlert aria-hidden className="size-3.5" />
                    {missing.length} required {missing.length === 1 ? "field" : "fields"} empty
                  </span>
                  <Button variant="ghost" onClick={jumpNext} className="text-evergreen-600">
                    Go to next
                  </Button>
                </>
              ) : (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-evergreen-50 px-2.5 text-[13px] font-semibold text-evergreen-700">
                  <Check aria-hidden className="size-3.5" />
                  All required fields are filled
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 font-semibold ring-1 ring-line">
              {context.jurisdiction.name === context.jurisdiction.countryName
                ? context.jurisdiction.name
                : `${context.jurisdiction.countryName}, ${context.jurisdiction.name}`}
            </span>
            <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 ring-1 ring-line">{PAPER_LABEL[context.jurisdiction.paperSize]}</span>
            <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 ring-1 ring-line">English</span>
            {correction ? null : <ChangeCountryDialog jurisdictions={jurisdictions} current={context.jurisdiction.code} today={today} onConfirm={changeCountry} />}
          </div>

          {doc.unreviewed ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-marigold-500 bg-marigold-100 px-3 py-2.5 text-[13px] text-marigold-800">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              Unreviewed wording. This letter uses draft clauses that a lawyer hasn’t checked yet. Only development builds show them.
            </p>
          ) : null}

          <section aria-labelledby="company-heading" className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-xl border border-line bg-white py-4 pr-3 pl-5 shadow-card">
            <span aria-hidden className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-line font-serif font-semibold tracking-[0.08em]" style={{ color: accent.hex }}>
              {companyInitials(company.legalName)}
            </span>
            <div className="min-w-[200px] flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <h2 id="company-heading" className="text-base font-semibold">
                  {company.legalName}
                </h2>
                <span className="text-xs text-muted">From My companies</span>
              </div>
              <p className="mt-0.5 text-[13px] text-ink-2">{companySummary}</p>
            </div>
            <Button asChild variant="ghost" className="text-evergreen-600 max-sm:-ml-3">
              <Link href={`/companies?edit=${company.id}`}>Edit company</Link>
            </Button>
          </section>

          {sections.map((section) => {
            const clause = context.clauses[section.key]!;
            const fields = fieldsBySection.get(section.key) ?? [];
            const notes = Object.fromEntries(fields.map((f) => [f.key, noteFor(f)]));
            return (
              <SectionCard
                key={section.key}
                section={section}
                clause={clause}
                fields={fields}
                values={state.values}
                notes={notes}
                emptyCount={fields.filter((f) => missingKeys.has(f.key)).length}
                lock={sectionLock(context, section)}
                badge={section.variesByCountry ? clause.jurisdictionName : null}
                currency={context.jurisdiction.currency}
                flash={flash}
                locked={correction ? LOCKED : undefined}
                onChange={setValue}
                onBlur={() => autosave.retry()}
                onRemove={() => removeSection(section.key, clause.title || section.title)}
              />
            );
          })}

          <section aria-labelledby="removed-heading" className="mt-6 rounded-xl border border-dashed border-[#A3AAB2] bg-[#FBFBF9] px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 id="removed-heading" className="text-base font-semibold">
                Removed sections
              </h2>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-neutral-chip px-2 text-xs font-semibold text-ink-2">{removed.length}</span>
            </div>
            {removed.length ? (
              <ul className="mt-2 flex flex-col">
                {removed.map((section) => {
                  const title = context.clauses[section.key]?.title || section.title;
                  return (
                    <li key={section.key} className="flex items-center justify-between gap-3 border-t border-line-soft py-1.5 first:border-t-0">
                      <span className="text-sm">{title}</span>
                      <Button variant="secondary" onClick={() => restoreSection(section.key, title, false)} aria-label={`Restore section: ${title}`}>
                        <RotateCcw aria-hidden />
                        Restore
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">Sections you remove appear here. You can restore them at any time.</p>
            )}
          </section>
          <p className="mt-6 text-[13px] text-muted">
            Templates are a starting point, not legal advice. Check the final letter with a qualified adviser in the country of employment.
          </p>
        </section>

        <PreviewPane
          visible={sideBySide || view === "preview"}
          doc={doc}
          styleName={template?.name ?? "Classic"}
          missing={missing}
          onJump={jumpTo}
          className={cn(view === "form" && "max-lg:hidden")}
        />
      </div>
    </div>
  );
}

function SaveIndicator({ status, message, onRetry }: { status: SaveStatus; message?: string; onRetry: () => void }) {
  const content = {
    saved: { icon: <Check aria-hidden className="size-3.5" />, text: "All changes saved", tone: "text-muted" },
    saving: { icon: <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />, text: "Saving…", tone: "text-muted" },
    offline: { icon: <CloudOff aria-hidden className="size-3.5" />, text: "Offline · saved on this device", tone: "text-marigold-800" },
    error: { icon: <CircleAlert aria-hidden className="size-3.5" />, text: message ?? "Couldn’t save", tone: "text-danger" },
    conflict: { icon: <TriangleAlert aria-hidden className="size-3.5" />, text: "Changed in another tab", tone: "text-danger" },
  }[status];
  return (
    // On phones there's no room in the top bar: screen readers still hear it.
    <p role="status" aria-live="polite" className={cn("flex shrink-0 items-center gap-1.5 text-[13px] max-sm:sr-only", content.tone)}>
      {content.icon}
      <span>{content.text}</span>
      {status === "error" ? (
        <button type="button" onClick={onRetry} className="ml-1 min-h-11 font-semibold text-danger underline underline-offset-2">
          Retry
        </button>
      ) : null}
    </p>
  );
}
