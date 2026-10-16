import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";

// Interim home page. The full landing page from the design (gallery, pricing, FAQ) arrives with the legal pages.
export default function HomePage() {
  return (
    <div className="min-h-screen bg-white" data-no-print>
      <header className="border-b border-line-soft">
        <nav aria-label="Main" className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3.5">
          <Link href="/" className="inline-flex min-h-11 items-center no-underline">
            <Wordmark />
          </Link>
          <span className="flex-1" />
          <Link href="/sign-in" className="inline-flex min-h-11 items-center px-3.5 text-[15px] font-semibold text-evergreen-600">
            Sign in
          </Link>
          <Button asChild>
            <Link href="/sign-in?next=/letters/new" className="no-underline">
              Create a letter
            </Link>
          </Button>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-[1200px] px-6 pt-18 pb-20">
          <p className="inline-flex rounded-full bg-evergreen-50 px-3 py-1.5 text-sm font-semibold text-evergreen-700">
            For employers in Europe, the UK, Australia, New Zealand, Canada and the US
          </p>
          <h1 className="mt-5 max-w-[760px] font-display text-[clamp(42px,6vw,64px)] leading-[1.04] font-medium tracking-tight text-balance">
            The right offer letter for every country you hire in.
          </h1>
          <p className="mt-5 max-w-[560px] text-[19px] leading-relaxed text-ink-2">
            Choose a country and a style, fill in the details, then download a print-ready PDF in your company’s colours for US$9.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/sign-in?next=/letters/new" className="no-underline">
                Create a letter
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted">No subscription. Templates are a starting point, not legal advice.</p>
        </section>
      </main>
      <footer className="bg-ink text-[#E9ECEF]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm">
          <span>© 2026 Offer Letter PDF · Templates aren’t legal advice.</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
            {[
              ["Terms", "/terms"],
              ["Privacy", "/privacy"],
              ["Refunds and cancellation", "/refunds"],
              ["Shipping and delivery", "/delivery"],
              ["Contact", "/contact"],
              ["Report misuse", "/report-misuse"],
            ].map(([label, href]) => (
              <Link key={href} href={href!} className="inline-flex min-h-11 items-center text-white">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
