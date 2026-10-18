import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

/** The slim top bar of checkout and payment status pages. */
export function CheckoutHeader({ back }: { back?: { href: string; label: string } }) {
  return (
    <header className="flex min-h-[64px] items-center gap-3 border-b border-line bg-white px-3 py-2 md:px-5">
      {back ? (
        <Button asChild variant="ghost" className="-ml-1 px-2.5">
          <Link href={back.href}>
            <ArrowLeft aria-hidden />
            <span className="max-sm:sr-only">{back.label}</span>
          </Link>
        </Button>
      ) : null}
      <Link href="/dashboard" aria-label={`${BRAND.name}, back to the app`} className="mr-auto rounded-md">
        <LogoMark className="sm:hidden" />
        <Wordmark className="max-sm:hidden" />
      </Link>
      <span className="flex items-center gap-1.5 text-[13px] text-muted">
        <Lock aria-hidden className="size-3.5" />
        Secure payment by PayU
      </span>
    </header>
  );
}
