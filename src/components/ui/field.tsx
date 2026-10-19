import { CircleAlert } from "lucide-react";
import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
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
      <div className="flex items-baseline gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {required ? <RequiredMark /> : null}
      </div>
      {required ? markRequired(children) : children}
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

/**
 * The red asterisk after a required field's label. It's outside the label, so the field's name stays clean; screen
 * readers hear "required" from the control's aria-required instead.
 */
export function RequiredMark() {
  return (
    <span aria-hidden className="text-sm font-semibold text-danger">
      *
    </span>
  );
}

/** Marks the control inside a <Field> as required for assistive technology. */
function markRequired(children: ReactNode): ReactNode {
  if (!isValidElement(children)) return children;
  const element = children as ReactElement<Record<string, unknown>>;
  const control = element.type === Input || element.type === Select || element.type === Textarea || ["input", "select", "textarea"].includes(element.type as string);
  return control ? cloneElement(element, { "aria-required": true }) : children;
}
