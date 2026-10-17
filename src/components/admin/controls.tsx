"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import type { AdminResult } from "@/lib/admin/auth";
import { cn } from "@/lib/utils";

// Client controls for admin actions: each runs a server action, says what happened, and lets the page refresh.

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (action: () => Promise<AdminResult>, after?: (result: AdminResult) => void) =>
    start(async () => {
      const result = await action().catch(() => ({ ok: false as const, message: "That didn’t work. Check your connection and try again." }));
      if (result.message) toast(result.message);
      after?.(result);
      if (result.ok) router.refresh();
    });
  return { pending, run };
}

/** An on/off switch. */
export function Switch({ checked, label, description, onChange, disabled }: { checked: boolean; label: string; description?: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={description}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-evergreen-600 bg-evergreen-600" : "border-control bg-[#EEF0EC]",
      )}
    >
      <span aria-hidden className={cn("inline-block size-6 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[26px]" : "translate-x-[3px]")} />
    </button>
  );
}

export function ToggleAction({ checked, label, action }: { checked: boolean; label: string; action: (next: boolean) => Promise<AdminResult> }) {
  const { pending, run } = useRun();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const shown = optimistic ?? checked;
  return (
    <Switch
      checked={shown}
      label={label}
      disabled={pending}
      onChange={(next) => {
        setOptimistic(next);
        run(() => action(next), () => setOptimistic(null));
      }}
    />
  );
}

export function ActionButton({
  action,
  children,
  variant = "secondary",
  confirm,
  className,
}: {
  action: () => Promise<AdminResult>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger" | "danger-outline" | "link" | "ghost";
  confirm?: { title: string; description: ReactNode; confirmLabel: string; tone?: "danger" | "primary" };
  className?: string;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} disabled={pending} className={className} onClick={() => (confirm ? setOpen(true) : run(action))}>
        {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
        {children}
      </Button>
      {confirm ? (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          tone={confirm.tone ?? "danger"}
          pending={pending}
          pendingLabel="Working…"
          onConfirm={() => run(action, () => setOpen(false))}
        />
      ) : null}
    </>
  );
}

/** Asks PayU about a payment now (and completes the letter if it's paid), instead of waiting for the recheck. */
export function VerifyPaymentButton({ txnid, variant = "link" }: { txnid: string; variant?: "link" | "secondary" }) {
  const { pending, run } = useRun();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        run(async () => {
          const response = await fetch(`/api/admin/payments/${encodeURIComponent(txnid)}/verify`, { method: "POST" });
          const body = (await response.json().catch(() => null)) as { status?: string; error?: string } | null;
          return response.ok ? { ok: true, message: `PayU says: ${body?.status ?? "unknown"}.` } : { ok: false, message: body?.error ?? "PayU couldn’t be asked right now." };
        })
      }
    >
      {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
      Verify now
    </Button>
  );
}
