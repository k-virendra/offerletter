"use client";

import { CircleAlert, Globe, Lock, Minus } from "lucide-react";
import { controlClass, RequiredMark } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { FieldDefinition, FieldValue, ResolvedClause, SectionDefinition } from "@/lib/letter/types";

export const fieldDomId = (key: string) => `field-${key.replaceAll(".", "-")}`;
export const sectionHeadingId = (key: string) => `section-${key}-heading`;

export type FieldNote = { kind: "error" | "required" | "info"; text: string };

export function SectionCard({
  section,
  clause,
  fields,
  values,
  notes,
  emptyCount,
  lock,
  badge,
  currency,
  flash,
  locked,
  onChange,
  onBlur,
  onRemove,
}: {
  section: SectionDefinition;
  clause: ResolvedClause;
  fields: FieldDefinition[];
  values: Record<string, FieldValue | undefined>;
  notes: Record<string, FieldNote | undefined>;
  emptyCount: number;
  lock: string | null;
  badge: string | null;
  currency: string;
  flash: string | null;
  /** Fields that can't change (a correction keeps the candidate and the job). */
  locked?: ReadonlySet<string>;
  onChange: (key: string, value: FieldValue) => void;
  onBlur: () => void;
  onRemove: () => void;
}) {
  const title = clause.title || section.title;
  const help = clause.editorHelp || section.help;
  return (
    <article id={`section-${section.key}`} aria-labelledby={sectionHeadingId(section.key)} className="mt-4 rounded-xl border border-line bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft py-1.5 pr-1.5 pl-5">
        <h2 id={sectionHeadingId(section.key)} tabIndex={-1} className="py-2 text-base font-semibold outline-none">
          {title}
        </h2>
        {badge ? (
          <span title="The wording of this section changes by country" className="inline-flex h-6 items-center gap-1 rounded-full bg-info-50 px-2 text-xs font-semibold text-info">
            <Globe aria-hidden className="size-3" />
            {badge} wording
          </span>
        ) : null}
        {emptyCount ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-marigold-100 px-2 text-xs font-semibold text-marigold-800">
            {emptyCount} empty
          </span>
        ) : null}
        <span className="flex-1" />
        {lock ? (
          <span className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] text-muted">
            <Lock aria-hidden className="size-3.5" />
            {lock}
          </span>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove section: ${title}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold text-ink-2 hover:bg-ghost-hover"
          >
            <Minus aria-hidden className="size-4" />
            Remove section
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 p-5 sm:grid-cols-2">
        {help ? <p className="col-span-full -mb-1 text-[13px] leading-relaxed text-ink-2">{help}</p> : null}
        {fields.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={values[field.key]}
            note={notes[field.key]}
            currency={currency}
            flash={flash === field.key}
            locked={locked?.has(field.key) ?? false}
            onChange={(value) => {
              if (!locked?.has(field.key)) onChange(field.key, value);
            }}
            onBlur={onBlur}
          />
        ))}
      </div>
    </article>
  );
}

const WIDE_TYPES = new Set(["long_text", "address", "yes_no"]);

function FieldControl({
  field,
  value,
  note,
  currency,
  flash,
  locked,
  onChange,
  onBlur,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  note: FieldNote | undefined;
  currency: string;
  flash: boolean;
  locked: boolean;
  onChange: (value: FieldValue) => void;
  onBlur: () => void;
}) {
  const id = fieldDomId(field.key);
  const noteId = `${id}-note`;
  const text = typeof value === "string" ? value : "";
  const wide = WIDE_TYPES.has(field.type) || (field.validation.max_length ?? 0) >= 160;
  const invalid = note?.kind === "error";
  // Locked fields stay readable and focusable (read-only rather than disabled), with the reason as their note.
  const shown = locked ? { kind: "info" as const, text: "Can’t change in a correction: it’s the same offer to the same person." } : note;
  const common = {
    id,
    "aria-describedby": shown ? noteId : undefined,
    "aria-invalid": (!locked && invalid) || undefined,
    "aria-required": field.required || undefined,
    readOnly: locked || undefined,
    onBlur,
    className: cn(controlClass, !locked && note?.kind === "required" && "border-marigold-700", locked && "bg-[#F3F4F1] text-ink-2"),
  };

  let control: React.ReactNode;
  switch (field.type) {
    case "long_text":
    case "address":
      control = <textarea {...common} rows={2} value={text} placeholder={field.placeholder ?? undefined} onChange={(e) => onChange(e.target.value)} className={cn(common.className, "min-h-[68px] py-2.5 leading-relaxed")} />;
      break;
    case "select":
      control = (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value)} className={cn(common.className, "h-11 px-2.5")}>
          {!text ? <option value="">Choose…</option> : null}
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    case "money":
      control = (
        <div className="flex">
          <span aria-hidden className="inline-flex h-11 items-center rounded-l-lg border border-r-0 border-control bg-[#F3F4F1] px-3 text-sm font-semibold text-ink-2">
            {currency}
          </span>
          <input {...common} type="text" inputMode="decimal" autoComplete="off" value={text} onChange={(e) => onChange(e.target.value)} className={cn(common.className, "h-11 rounded-l-none")} />
        </div>
      );
      break;
    case "yes_no":
      control = (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            onBlur={onBlur}
            aria-describedby={note ? noteId : undefined}
            className="size-5 accent-evergreen-600"
          />
          {field.label}
        </label>
      );
      break;
    default:
      control = (
        <input
          {...common}
          type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={text}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(common.className, "h-11")}
        />
      );
  }

  return (
    <div
      id={`${id}-wrap`}
      className={cn("flex flex-col gap-1.5 rounded-lg transition-shadow", wide && "col-span-full", flash && "bg-[#FFF6DF] shadow-[0_0_0_6px_#FFF6DF,0_0_0_8px_var(--color-marigold-500)]")}
    >
      {field.type !== "yes_no" ? (
        <div className="flex items-baseline gap-0.5">
          <label htmlFor={id} className="text-sm font-medium text-ink">
            {field.label}
          </label>
          {field.required && !locked ? <RequiredMark /> : null}
          {locked ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted">
              <Lock aria-hidden className="size-3" />
              Locked
            </span>
          ) : null}
        </div>
      ) : null}
      {control}
      {shown ? (
        <p
          id={noteId}
          className={cn("flex items-start gap-1.5 text-[13px]", shown.kind === "error" ? "text-danger" : shown.kind === "required" ? "text-marigold-800" : "text-muted")}
        >
          {shown.kind !== "info" ? <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : null}
          {shown.text}
        </p>
      ) : null}
    </div>
  );
}
