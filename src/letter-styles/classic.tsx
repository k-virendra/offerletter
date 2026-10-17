"use client";

import { Flow, INK, LogoOrWordmark, MUTED, PageBox, PageLabel, RULE, Runs, sectionItems, SignatureMark, standardFlow, type BlockLook, type LetterStyle } from "./kit";
import type { ReactNode } from "react";
import type { LetterDocument } from "@/lib/letter/types";

// Classic: centred letterhead, serif headings and fine rules.

const look = (doc: LetterDocument): BlockLook => ({
  gap: { paragraph: 8, list: 4, table: 10, heading: 10 },
  table: { fontSize: 14, th: { borderBottom: `1px solid ${doc.accent}` } },
});

function Footer({ doc, index, count }: { doc: LetterDocument; index: number; count: number }) {
  return (
    <footer className="mt-4 flex justify-between gap-4 pt-2 text-[12px]" style={{ marginBottom: 30, borderTop: `1px solid ${RULE}`, color: MUTED }}>
      <span>{doc.feeLine}</span>
      <span className="whitespace-nowrap">
        <PageLabel doc={doc} index={index} count={count} />
      </span>
    </footer>
  );
}

function Page({ doc, index, count, children }: { doc: LetterDocument; index: number; count: number; children: React.ReactNode }) {
  const contact = [doc.company.website, doc.company.phone, doc.company.registration].filter(Boolean).join(" · ");
  return (
    <PageBox doc={doc} className="font-serif" style={{ padding: index === 0 ? "56px 80px 0" : "40px 80px 0", fontSize: 14.5, lineHeight: 1.55, color: INK }}>
      {index === 0 ? (
        <header className="flex flex-col items-center gap-1 text-center">
          <LogoOrWordmark
            doc={doc}
            maxHeight={56}
            maxWidth={280}
            wordmark={
              <div className="text-[21px] font-semibold tracking-[0.22em]" style={{ paddingLeft: "0.22em", color: doc.accent }}>
                {doc.company.wordmark}
              </div>
            }
          />
          <div className="text-[12px] tracking-[0.03em]" style={{ color: MUTED }}>
            {[doc.company.legalName, ...doc.company.addressLines].join(" · ")}
          </div>
          <div className="text-[12px]" style={{ color: MUTED }}>
            {contact}
          </div>
          <div aria-hidden className="mt-4 h-1 self-stretch" style={{ borderTop: `1px solid ${doc.accent}`, borderBottom: `1px solid ${doc.accent}` }} />
        </header>
      ) : (
        <header className="flex items-baseline justify-between gap-4 pb-2.5" style={{ borderBottom: `1px solid ${doc.accent}` }}>
          <span className="text-[13px] font-semibold tracking-[0.2em]" style={{ color: doc.accent }}>
            {doc.company.wordmark}
          </span>
          <span className="text-[12px]" style={{ color: MUTED }}>
            <Runs runs={doc.runningHeader} />
          </span>
        </header>
      )}
      <Flow>{children}</Flow>
      <Footer doc={doc} index={index} count={count} />
    </PageBox>
  );
}

function flow(doc: LetterDocument) {
  const blockLook = look(doc);
  const label = { fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: MUTED };
  const signatureLine = (mark?: ReactNode) => (
    <span className="relative block h-11" style={{ borderBottom: `1px solid ${INK}` }}>
      {mark}
    </span>
  );
  const blank = "______________";

  return standardFlow(doc, {
    look: blockLook,
    before: [
      {
        id: "recipient",
        node: (
          <div className="flex items-start justify-between gap-6" style={{ paddingTop: 28 }}>
            <div className="flex flex-col">
              <span style={label}>{doc.phrases.confidential}</span>
              <span className="mt-1.5 font-semibold">
                <Runs runs={doc.recipient.name} />
              </span>
              {doc.recipient.addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <div className="text-right">
              <Runs runs={doc.dateLine} />
            </div>
          </div>
        ),
      },
      {
        id: "title",
        node: (
          <h1 className="text-balance" style={{ paddingTop: 28, fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>
            {doc.title.label}: <Runs runs={doc.title.subject} />
          </h1>
        ),
      },
    ],
    opening: { first: 16, rest: 10 },
    section: (section, index) =>
      sectionItems(section, blockLook, {
        head: (first) => (
          <div style={{ paddingTop: index === 0 ? 22 : 20 }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 600, color: doc.accent }}>{section.title}</h2>
            <div style={{ paddingTop: 6 }}>{first}</div>
          </div>
        ),
        more: (block) => block,
      }),
    closing: { first: 22, rest: 14 },
    signatures: (
      <div className="grid grid-cols-2 gap-10" style={{ paddingTop: 18 }}>
        <div className="flex flex-col">
          <span style={label}>{doc.signatures.company.heading}</span>
          <span className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            {doc.signatures.company.note}
          </span>
          {signatureLine(<SignatureMark signature={doc.signatures.company.signature} />)}
          <span className="mt-1.5 font-semibold">
            <Runs runs={doc.signatures.company.name} />
          </span>
          <span>
            <Runs runs={doc.signatures.company.title} />
          </span>
          <span className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
            {doc.signatures.placeLabel}: <Runs runs={doc.signatures.company.place} /> · {doc.signatures.dateLabel}: {blank}
          </span>
        </div>
        <div className="flex flex-col">
          <span style={label}>{doc.signatures.candidate.heading}</span>
          <span className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            {doc.signatures.candidate.note}
          </span>
          {signatureLine()}
          <span className="mt-1.5 font-semibold">
            <Runs runs={doc.signatures.candidate.name} />
          </span>
          <span>&nbsp;</span>
          <span className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
            {doc.signatures.placeLabel}: {blank} · {doc.signatures.dateLabel}: {blank}
          </span>
        </div>
      </div>
    ),
  });
}

export const classic: LetterStyle = { key: "classic", Page, flow };
