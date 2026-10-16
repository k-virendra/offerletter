"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center" data-no-print>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-[420px] text-[15px] leading-relaxed text-ink-2">Your work is saved. Try again, and contact us if it keeps happening.</p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
