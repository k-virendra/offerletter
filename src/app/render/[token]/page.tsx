import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintLetter } from "@/components/pdf/print-letter";
import { serverEnv } from "@/lib/env.server";
import { draftInputs, versionInputs } from "@/lib/pdf/inputs.server";
import { verifyRenderToken } from "@/lib/pdf/token";

// The print page for PDFs. Only headless Chrome opens it, with a token the server signed a moment earlier; there's
// no user session here, so the token is the only way in. It's never linked to and never indexed.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Letter", robots: { index: false, follow: false } };

const WATERMARK: Record<string, string> = { en: "Preview – not valid", de: "Vorschau – nicht gültig", nl: "Voorbeeld – niet geldig" };

export default async function RenderPage({ params }: PageProps<"/render/[token]">) {
  const { token } = await params;
  const target = verifyRenderToken(decodeURIComponent(token), serverEnv().RENDER_TOKEN_SECRET);
  if (!target) notFound();

  const inputs = target.kind === "draft" ? await draftInputs(target.id, target.language) : await versionInputs(target.id, target.language);
  if (!inputs) notFound();

  return (
    <PrintLetter
      context={inputs.context}
      company={inputs.company}
      state={inputs.state}
      date={inputs.date}
      watermark={target.watermark ? (WATERMARK[target.language ?? "en"] ?? WATERMARK.en) : undefined}
    />
  );
}
