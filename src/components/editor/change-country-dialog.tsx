"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { JurisdictionPicker } from "@/components/editor/jurisdiction-picker";
import { Button } from "@/components/ui/button";
import type { JurisdictionOption } from "@/lib/letter/context.server";

/** "Change country": the letter's wording, paper and money follow the new choice; answers that still apply stay. */
export function ChangeCountryDialog({
  jurisdictions,
  current,
  today,
  onConfirm,
}: {
  jurisdictions: JurisdictionOption[];
  current: string;
  today: string;
  onConfirm: (code: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(current);
  const [pending, setPending] = useState(false);
  const chosen = jurisdictions.find((j) => j.code === code);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setCode(current);
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="link" className="text-[13px]">
          Change country
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-7 shadow-[0_24px_60px_rgb(20_24_31/0.24)]">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-[26px] leading-tight font-medium">Change country</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close" className="-mt-2 -mr-2">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-[15px] leading-relaxed text-ink-2">
            The letter switches to that country’s wording, currency, date format and paper. Your answers stay wherever the new country asks for them; answers it doesn’t use are removed.
          </Dialog.Description>
          <JurisdictionPicker jurisdictions={jurisdictions} value={code} onChange={setCode} idPrefix="change-country" today={today} />
          <div className="mt-1 flex flex-wrap justify-end gap-2.5">
            <Dialog.Close asChild>
              <Button variant="outline">Cancel</Button>
            </Dialog.Close>
            <Button
              disabled={pending || !chosen || Boolean(chosen.unavailable) || code === current}
              onClick={async () => {
                setPending(true);
                const done = await onConfirm(code);
                setPending(false);
                if (done) setOpen(false);
              }}
            >
              {pending ? "Changing…" : "Change country"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
