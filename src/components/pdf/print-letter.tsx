"use client";

import { useCallback, useEffect, useMemo } from "react";
import { LetterPages } from "@/letter-styles/letter-pages";
import { buildLetterDocument } from "@/lib/letter/build";
import type { LetterCompany, LetterContext, LetterState } from "@/lib/letter/types";

// The page headless Chrome prints. It tells the renderer when it's safe to print by setting
// <html data-letter-ready="true"> (or "error"): pages laid out, fonts loaded and images decoded.

const PAGE = { a4: { width: "210mm", height: "297mm" }, letter: { width: "8.5in", height: "11in" } } as const;

function markReady(state: "true" | "error") {
  document.documentElement.dataset.letterReady = state;
}

export function PrintLetter({
  context,
  company,
  state,
  date,
  watermark,
}: {
  context: LetterContext;
  company: LetterCompany;
  state: LetterState;
  date: string;
  watermark?: string;
}) {
  const doc = useMemo(() => {
    try {
      return buildLetterDocument(context, company, state, { date });
    } catch (error) {
      console.error("The letter couldn't be built", error);
      return null;
    }
  }, [context, company, state, date]);

  useEffect(() => {
    if (!doc) markReady("error");
  }, [doc]);

  const onReady = useCallback(() => {
    const images = [...document.images].map((image) => (image.complete ? Promise.resolve() : image.decode().catch(() => undefined)));
    // Handwriting fonts aren't preloaded and may only start loading once the signature is laid out: load them
    // explicitly, so the PDF never prints a fallback font.
    const signatures = [...document.querySelectorAll<HTMLElement>("[data-signature]")].map((element) => {
      const { fontSize, fontFamily } = getComputedStyle(element);
      return document.fonts.load(`${fontSize} ${fontFamily}`, element.textContent ?? "").catch(() => undefined);
    });
    void Promise.all([...images, ...signatures]).then(() => requestAnimationFrame(() => markReady("true")));
  }, []);

  if (!doc) return <p>This letter couldn’t be laid out.</p>;
  return (
    <main lang={doc.language}>
      <style>{`
        @page { size: ${PAGE[doc.paperSize].width} ${PAGE[doc.paperSize].height}; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
        /* Exactly one sheet per page: whole-pixel page boxes are a fraction of a millimetre bigger than the paper. */
        [data-letter-page] > .letter-page { width: ${PAGE[doc.paperSize].width} !important; height: ${PAGE[doc.paperSize].height} !important; }
        @media print { [data-letter-probe] { display: none !important; } }
      `}</style>
      <LetterPages doc={doc} chips="static" print watermark={watermark} onReady={onReady} />
    </main>
  );
}
