"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PAPER } from "@/letter-styles/kit";
import { LetterPages } from "@/letter-styles/letter-pages";
import { buildLetterDocument } from "@/lib/letter/build";
import type { LetterCompany, LetterContext, LetterState } from "@/lib/letter/types";
import { cn } from "@/lib/utils";

// Read-only letters outside the editor: a first-page thumbnail (checkout) and the whole letter fitted to its
// column (the paid letter's page). The same pages the PDF prints.

type LetterProps = { context: LetterContext; company: LetterCompany; state: LetterState; date: string };

function useDoc({ context, company, state, date }: LetterProps) {
  return useMemo(() => buildLetterDocument(context, company, state, { date }), [context, company, state, date]);
}

export function LetterThumbnail({ width, className, ...letter }: LetterProps & { width: number; className?: string }) {
  const doc = useDoc(letter);
  const paper = PAPER[doc.paperSize];
  const scale = width / paper.width;
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-sm bg-white shadow-paper", className)} style={{ width, height: paper.height * scale }}>
      <div style={{ width: paper.width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <LetterPages doc={doc} onlyFirstPage gap={0} />
      </div>
    </div>
  );
}

export function LetterView({ label, ...letter }: LetterProps & { label: string }) {
  const doc = useDoc(letter);
  const paper = PAPER[doc.paperSize];
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [pages, setPages] = useState(1);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScale(Math.min(1, element.clientWidth / paper.width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [paper.width]);

  const gap = 16;
  return (
    <section aria-label={label} ref={ref} className="w-full">
      <div style={{ height: (pages * paper.height + (pages - 1) * gap) * scale }}>
        <div style={{ width: paper.width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <LetterPages doc={doc} gap={gap} onPageCount={setPages} />
        </div>
      </div>
    </section>
  );
}
