"use client";

import { X } from "lucide-react";
import { Toast } from "radix-ui";
import { useSyncExternalStore } from "react";

// Short confirmations ("Company saved"), announced politely to screen readers. A toast with an action
// (Undo, Retry) stays for 8 seconds; others for 5.

type ToastItem = { id: number; message: string; action?: { label: string; altText: string; onClick: () => void } };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  for (const listener of listeners) listener();
}

export function toast(message: string, action?: ToastItem["action"]) {
  items = [...items.slice(-2), { id: nextId++, message, action }];
  emit();
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <Toast.Provider swipeDirection="down" label="Notification">
      {list.map((item) => (
        <Toast.Root
          key={item.id}
          duration={item.action ? 8000 : 5000}
          onOpenChange={(open) => !open && dismiss(item.id)}
          className="flex items-center gap-3 rounded-xl bg-ink py-1.5 pr-1.5 pl-4 text-white shadow-toast data-[state=closed]:opacity-0 data-[swipe=end]:translate-y-full"
        >
          <Toast.Description className="flex-1 text-sm">{item.message}</Toast.Description>
          {item.action ? (
            <Toast.Action
              altText={item.action.altText}
              onClick={item.action.onClick}
              className="min-h-11 rounded-lg bg-marigold-500 px-4 text-sm font-semibold text-ink hover:bg-[#E5A92F]"
            >
              {item.action.label}
            </Toast.Action>
          ) : null}
          <Toast.Close aria-label="Dismiss message" className="inline-flex size-11 items-center justify-center rounded-lg text-white hover:bg-white/10">
            <X aria-hidden className="size-[18px]" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-4 left-1/2 z-50 flex w-[min(520px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}
