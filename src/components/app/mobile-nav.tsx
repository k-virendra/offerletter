"use client";

import { Menu, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** On phones and small tablets the sidebar opens as a sheet from the menu button in the top bar. */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu aria-hidden />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content
          aria-label="Menu"
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col gap-5 overflow-y-auto bg-white px-4 py-5 shadow-[12px_0_40px_rgb(20_24_31/0.18)] outline-none"
          // Following any link inside closes the sheet.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close menu" className="absolute top-3 right-3">
              <X aria-hidden />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
