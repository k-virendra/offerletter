"use client";

import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A confirmation for something that can't be undone. The confirm button says exactly what will happen.
 * Focus stays inside while open and returns to the button that opened it.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3.5 rounded-2xl bg-white p-7 shadow-[0_24px_60px_rgb(20_24_31/0.24)]">
          <AlertDialog.Title className="font-display text-[26px] leading-tight font-medium">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-[15px] leading-relaxed text-ink-2">{description}</AlertDialog.Description>
          <div className="mt-1.5 flex flex-wrap justify-end gap-2.5">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialog.Cancel>
            <Button
              variant="danger"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {pending ? "Deleting…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
