import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const controlClass =
  "w-full rounded-lg border border-control bg-white px-3 text-[15px] text-ink placeholder:text-muted focus-visible:border-evergreen-600 aria-invalid:border-2 aria-invalid:border-danger disabled:bg-[#F3F4F1] disabled:text-[#4E5561]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClass, "min-h-[68px] py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, "h-11 px-2.5", className)} {...props} />;
}

/** Label, control, help text and error, wired together for screen readers. */
export function Field({
  id,
  label,
  required,
  help,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  required?: boolean;
  help?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className="text-xs text-muted">{required ? "Required" : "Optional"}</span>
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-[13px] text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-[13px] text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** Props for the control inside a <Field>: describedby and invalid state. */
export function fieldControlProps(id: string, { error, help }: { error?: string; help?: ReactNode }) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : help ? `${id}-help` : undefined,
  } as const;
}
