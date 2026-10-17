import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small building blocks shared by the admin pages.

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-4xl font-medium tracking-tight">{title}</h1>
        {description ? <p className="mt-1.5 max-w-[720px] text-[15px] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function AdminCard({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={title && id ? `${id}-heading` : undefined} className={cn("min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card md:p-6", className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id={id ? `${id}-heading` : undefined} className="text-lg font-semibold">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const TONES = {
  success: "bg-evergreen-50 text-evergreen-700",
  info: "bg-info-50 text-info",
  danger: "bg-danger-50 text-danger",
  warning: "bg-marigold-100 text-marigold-800",
  neutral: "bg-neutral-chip text-ink-2",
  outline: "border border-dashed border-control text-ink-2",
} as const;

export type PillTone = keyof typeof TONES;

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export function Metric({ label, value, note, noteTone = "muted" }: { label: string; value: ReactNode; note?: ReactNode; noteTone?: "muted" | "success" | "info" | "danger" }) {
  const tone = { muted: "text-ink-2", success: "text-evergreen-700", info: "text-info", danger: "text-danger" }[noteTone];
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white px-5 py-4 shadow-card">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-0.5 font-display text-[40px] leading-tight font-medium tabular-nums">{value}</p>
      {note ? <p className={cn("text-[13px]", tone)}>{note}</p> : null}
    </div>
  );
}

/** A table that scrolls sideways on narrow screens instead of squashing. */
export function AdminTable({ caption, children, minWidth = 640 }: { caption: string; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const th = "border-b border-line px-3 py-2.5 text-left text-[13px] font-semibold text-ink-2 first:pl-0 last:pr-0";
export const td = "border-b border-line-soft px-3 py-3 align-top first:pl-0 last:pr-0";

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-2">{children}</p>;
}

export const REVIEW_LABELS = {
  draft: { text: "Draft", tone: "outline" },
  in_review: { text: "In review", tone: "warning" },
  approved: { text: "Approved", tone: "success" },
} as const satisfies Record<string, { text: string; tone: PillTone }>;
