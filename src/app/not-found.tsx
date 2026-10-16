import Link from "next/link";
import { Wordmark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center" data-no-print>
      <Wordmark />
      <h1 className="mt-6 text-2xl font-semibold">This page isn’t available</h1>
      <p className="max-w-[420px] text-[15px] leading-relaxed text-ink-2">
        It may have been moved or deleted, or it belongs to another account.
      </p>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center font-semibold text-evergreen-600">
        Go to your letters
      </Link>
    </main>
  );
}
