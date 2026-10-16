import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Letters" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: letters, error } = await supabase
    .from("letters")
    .select("id, name, status, updated_at, jurisdiction_code, template_key, companies(legal_name)")
    .order("updated_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">Letters</h1>
          <p className="mt-1.5 text-[15px] text-ink-2">Drafts and paid letters for all your companies.</p>
        </div>
        <Button asChild>
          <Link href="/letters/new" className="no-underline">
            <Plus aria-hidden strokeWidth={2.4} />
            New letter
          </Link>
        </Button>
      </div>

      {error ? (
        <section role="alert" className="flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-white px-7 py-12 text-center">
          <h2 className="text-lg font-semibold">We couldn’t load your letters</h2>
          <p className="text-sm text-ink-2">Your letters are safe. Check your connection and try again.</p>
          <Button asChild variant="secondary">
            <Link href="/dashboard" className="no-underline">
              Try again
            </Link>
          </Button>
        </section>
      ) : !letters?.length ? (
        <section className="flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-white px-7 py-14 text-center">
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
            <rect x="12" y="6" width="32" height="44" rx="3" fill="#FFFFFF" stroke="#0F6E5F" strokeWidth="2" />
            <path d="M19 18h18M19 25h18M19 32h11" stroke="#CFE6E0" strokeWidth="3" strokeLinecap="round" />
            <circle cx="41" cy="42" r="8" fill="#F0B43C" />
            <path d="M41 38v8M37 42h8" stroke="#14181F" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h2 className="text-lg font-semibold">No letters yet</h2>
          <p className="max-w-[320px] text-sm leading-relaxed text-ink-2">
            Create your first offer letter. It takes about ten minutes and you pay only when you download.
          </p>
          <Button asChild className="mt-1">
            <Link href="/letters/new" className="no-underline">
              Create a letter
            </Link>
          </Button>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">Your letters</caption>
            <thead>
              <tr className="text-left text-ink-2">
                <th scope="col" className="border-b border-line px-5 py-3 text-[13px] font-semibold">Letter</th>
                <th scope="col" className="border-b border-line px-3 py-3 text-[13px] font-semibold">Company</th>
                <th scope="col" className="border-b border-line px-3 py-3 text-[13px] font-semibold">Country</th>
                <th scope="col" className="border-b border-line px-3 py-3 text-[13px] font-semibold">Status</th>
                <th scope="col" className="border-b border-line px-5 py-3 text-[13px] font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((letter) => (
                <tr key={letter.id} className="hover:bg-[#FAFBF9]">
                  <td className="border-b border-line-soft px-5 py-3.5">
                    <Link href={`/letters/${letter.id}`} className="font-semibold text-ink no-underline">
                      {letter.name}
                    </Link>
                  </td>
                  <td className="border-b border-line-soft px-3 py-3.5">{letter.companies?.legal_name}</td>
                  <td className="border-b border-line-soft px-3 py-3.5">{letter.jurisdiction_code}</td>
                  <td className="border-b border-line-soft px-3 py-3.5">
                    <span
                      className={
                        letter.status === "paid"
                          ? "inline-flex h-[26px] items-center rounded-full bg-evergreen-50 px-2.5 text-[13px] font-semibold text-evergreen-700"
                          : "inline-flex h-[26px] items-center rounded-full bg-neutral-chip px-2.5 text-[13px] font-semibold text-ink-2"
                      }
                    >
                      {letter.status === "paid" ? "Paid" : "Draft"}
                    </span>
                  </td>
                  <td className="border-b border-line-soft px-5 py-3.5 text-ink-2">
                    {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(letter.updated_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[13px] text-muted">Templates are a starting point, not legal advice.</p>
    </div>
  );
}
