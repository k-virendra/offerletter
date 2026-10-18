import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { ReportForm } from "./report-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Report misuse", description: `Report an offer letter made with ${BRAND.name} that looks like a scam or that a company says it never sent.` };

export default function ReportMisusePage() {
  return (
    <div className="min-h-screen bg-canvas" data-no-print>
      <header className="border-b border-line-soft bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center px-6 py-3.5">
          <Link href="/" className="inline-flex min-h-11 items-center no-underline">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-4 py-10 md:py-14">
        <h1 className="font-display text-[clamp(34px,5vw,44px)] leading-tight font-medium">Report misuse</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-ink-2">
          Companies use {BRAND.name} to write their own offer letters. If a letter made here looks like a scam, asks you to pay money, or a company says it never sent it,
          tell us. We can suspend the company’s account while we look into it.
        </p>
        <p className="mt-3 mb-6 text-[15px] text-ink-2">A real employer never asks a candidate to pay for a job offer, visa or equipment.</p>
        <ReportForm />
      </main>
    </div>
  );
}
