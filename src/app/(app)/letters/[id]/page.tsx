import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getLetter } from "@/lib/letter/letters.server";

// The page for a letter. Drafts open in the editor; the page for paid letters (download, versions, corrections)
// comes with payments.
export default async function LetterPage({ params }: PageProps<"/letters/[id]">) {
  const { id } = await params;
  await requireUser(`/letters/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const letter = await getLetter(id);
  if (!letter) notFound();
  if (letter.status === "draft") redirect(`/letters/${id}/edit`);
  notFound();
}
