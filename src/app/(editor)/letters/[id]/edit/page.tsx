import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { LetterEditor } from "@/components/editor/letter-editor";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { splitAddress } from "@/lib/letter/build";
import { listJurisdictions } from "@/lib/letter/context.server";
import { correctionOpen, displayPrice, getLetter, letterCompany, letterState } from "@/lib/letter/letters.server";
import { letterWording } from "@/lib/pdf/inputs.server";

export async function generateMetadata({ params }: PageProps<"/letters/[id]/edit">): Promise<Metadata> {
  const { id } = await params;
  const letter = z.uuid().safeParse(id).success ? await getLetter(id) : null;
  return { title: letter?.name ?? "Letter" };
}

export default async function EditLetterPage({ params }: PageProps<"/letters/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser(`/letters/${id}/edit`);
  if (!z.uuid().safeParse(id).success) notFound();

  const letter = await getLetter(id);
  if (!letter || !letter.companies) notFound();
  // A paid letter opens here only for a free correction, with the wording it was issued with.
  const correcting = letter.status === "paid";
  if (correcting && (letter.author_id !== user.id || !correctionOpen(letter))) redirect(`/letters/${id}`);

  const wording = await letterWording(letter);
  if (!wording) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-start justify-center gap-3 px-6">
        <h1 className="font-display text-3xl font-medium">This letter can’t be edited right now</h1>
        <p className="text-ink-2">Letters for this country have been switched off while their wording is updated. Your draft is safe and will open again once it’s back.</p>
        <Button asChild variant="secondary">
          <Link href="/dashboard">Back to letters</Link>
        </Button>
      </main>
    );
  }

  const { context, date } = wording;
  const row = letter.companies;
  const [company, price, jurisdictions] = await Promise.all([letterCompany(row), displayPrice(), listJurisdictions()]);
  const summary = [splitAddress(row.registered_address).join(", "), row.registration_number, `Signs: ${row.signatory_name}, ${row.signatory_title}`].join(" · ");

  return (
    // A new country (or a reload after one) starts the editor afresh from what the server has.
    <LetterEditor
      key={`${letter.jurisdiction_code}:${letter.edited_at}`}
      letterId={letter.id}
      initialState={letterState(letter)}
      editedAt={letter.edited_at}
      context={context}
      company={company}
      companySummary={summary}
      today={date}
      price={price}
      jurisdictions={jurisdictions}
      correction={correcting ? { version: letter.current_version, until: letter.correction_until! } : undefined}
    />
  );
}
