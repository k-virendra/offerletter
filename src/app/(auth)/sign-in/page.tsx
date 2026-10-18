import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { publicEnv } from "@/lib/env";
import { displayPriceLabel } from "@/lib/payments/prices.server";
import { safeNext } from "@/lib/safe-next";
import { SignInForm } from "./sign-in-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, price] = await Promise.all([searchParams, displayPriceLabel()]);
  const next = safeNext(params.next);
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="flex min-h-screen flex-wrap bg-white" data-no-print>
      <main className="flex min-w-0 flex-[1_1_520px] flex-col px-6 py-8">
        <Link href="/" className="self-start rounded-lg px-4 py-2 no-underline">
          <Wordmark />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-[420px] flex-col gap-6">
            <div>
              <h1 className="font-display text-[40px] leading-[1.1] font-medium tracking-tight">Sign in or create an account</h1>
              <p className="mt-2.5 text-base leading-relaxed text-ink-2">
                We’ll email you a secure sign-in link, so there’s no password to remember.
              </p>
            </div>
            <SignInForm
              next={next}
              googleEnabled={publicEnv.NEXT_PUBLIC_GOOGLE_SIGN_IN}
              turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
              urlError={error}
            />
            <p className="text-[13px] leading-relaxed text-muted">
              By continuing, you agree to the{" "}
              <Link href="/terms" className="text-evergreen-600 underline underline-offset-2">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-evergreen-600 underline underline-offset-2">
                Privacy policy
              </Link>
              , and confirm you’ll issue letters only for companies you’re authorised to represent.
            </p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 px-4 text-sm">
          {[
            ["Terms", "/terms"],
            ["Privacy", "/privacy"],
            ["Contact", "/contact"],
            ["Report misuse", "/report-misuse"],
          ].map(([label, href]) => (
            <Link key={href} href={href!} className="inline-flex min-h-11 items-center text-evergreen-600">
              {label}
            </Link>
          ))}
        </nav>
      </main>

      <aside aria-label={`About ${BRAND.name}`} className="flex min-w-0 flex-[1_1_520px] items-center justify-center bg-desk px-10 py-14">
        <div className="flex max-w-[480px] flex-col gap-7">
          <h2 className="font-display text-[34px] leading-[1.15] font-medium">Your business online, done for you.</h2>
          <ul className="flex flex-col gap-3 text-base">
            {[
              "A website on your own domain, built and looked after by our team",
              "A business email address at your domain",
              `Offer letters for 8 countries${price ? `, ${price} each when ready to download` : ""}`,
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-evergreen-600" strokeWidth={2.4} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
