import { ArrowRight, Check, FileText, Globe } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { displayPriceLabel } from "@/lib/payments/prices.server";
import { activePlan, planMoney } from "@/lib/websites/queries.server";

// Prices come from the database; the page is rebuilt every few minutes so a new price shows without a deploy.
export const revalidate = 300;

// Interim home page with the portal's two products. The full landing page (gallery, pricing, FAQ) arrives with the
// legal pages.
export default async function HomePage() {
  const [letterPrice, plan] = await Promise.all([displayPriceLabel(), activePlan().catch(() => null)]);
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
            <Link href="/sign-in?next=/website/new" className="no-underline">
              Get your website
            </Link>
          </Button>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-[1200px] px-6 pt-16 pb-10">
          <p className="inline-flex rounded-full bg-evergreen-50 px-3 py-1.5 text-sm font-semibold text-evergreen-700">For small businesses and growing teams</p>
          <h1 className="mt-5 max-w-[820px] font-display text-[clamp(40px,6vw,62px)] leading-[1.05] font-medium tracking-tight text-balance">
            Your business online, done for you.
          </h1>
          <p className="mt-5 max-w-[600px] text-[19px] leading-relaxed text-ink-2">
            A website on your own domain with a business email address, set up and looked after by our team. And offer letters for hiring, ready to sign.
          </p>
        </section>

        <section aria-label="What we offer" className="mx-auto grid max-w-[1200px] gap-6 px-6 pb-20 md:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-card">
            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-evergreen-50 text-evergreen-700">
              <Globe aria-hidden className="size-6" />
            </span>
            <h2 className="mt-4 font-display text-[28px] font-medium">Business website</h2>
            <p className="mt-2 text-ink-2">{plan?.description ?? "Your website, your own domain and a business email address, set up for you."}</p>
            <ul className="mt-4 flex flex-col gap-2 text-[15px]">
              {(plan?.features ?? []).map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-evergreen-600" />
                  {feature}
                </li>
              ))}
            </ul>
            {plan ? (
              <p className="mt-5 text-[15px] text-ink-2">
                <strong className="font-display text-2xl font-medium text-ink">{planMoney(plan, plan.onboardingMinor)}</strong> to start, then {planMoney(plan, plan.monthlyMinor)} a month
              </p>
            ) : null}
            <span className="flex-1" />
            <Button asChild size="lg" className="mt-6 self-start">
              <Link href="/sign-in?next=/website/new" className="no-underline">
                Get your website
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </article>

          <article className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-card">
            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-marigold-100 text-marigold-800">
              <FileText aria-hidden className="size-6" />
            </span>
            <h2 className="mt-4 font-display text-[28px] font-medium">Offer letters</h2>
            <p className="mt-2 text-ink-2">The right offer letter for every country you hire in: Europe, the UK, Australia, New Zealand, Canada and the US.</p>
            <ul className="mt-4 flex flex-col gap-2 text-[15px]">
              {["Wording for each country, with state and province rules", "Five letter styles in your company’s colours", "Print-ready PDF with a handwritten-style signature"].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-evergreen-600" />
                  {item}
                </li>
              ))}
            </ul>
            {letterPrice ? (
              <p className="mt-5 text-[15px] text-ink-2">
                <strong className="font-display text-2xl font-medium text-ink">{letterPrice}</strong> per letter, no subscription
              </p>
            ) : null}
            <span className="flex-1" />
            <Button asChild size="lg" variant="secondary" className="mt-6 self-start">
              <Link href="/sign-in?next=/letters/new" className="no-underline">
                Create a letter
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </article>
        </section>
      </main>
      <footer className="bg-ink text-[#E9ECEF]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm">
          <span>
            © 2026 {BRAND.name} · {BRAND.domain}
          </span>
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
