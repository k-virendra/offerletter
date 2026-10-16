"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LetterDocument } from "@/lib/letter/types";
import {
  Flow,
  hasPlace,
  INK,
  LogoOrWordmark,
  MUTED,
  PageBox,
  PageLabel,
  RULE,
  Runs,
  sectionItems,
  StackedWords,
  standardFlow,
  type BlockLook,
  type LetterStyle,
} from "./kit";

// Modern: an accent band and numbered section headings.

const look = (doc: LetterDocument): BlockLook => ({
  gap: { paragraph: 8, list: 4, table: 10, heading: 10 },
  table: { fontSize: 13.5, head: { background: doc.tint }, th: { padding: "7px 10px" }, td: { padding: "7px 10px" } },
});

const label: CSSProperties = { fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED };

function Page({ doc, index, count, children }: { doc: LetterDocument; index: number; count: number; children: ReactNode }) {
  return (
    <PageBox doc={doc} className="font-sans" style={{ fontSize: 14, lineHeight: 1.55, color: INK }}>
      <div aria-hidden style={{ height: index === 0 ? 12 : 4, background: doc.accent }} />
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: index === 0 ? "40px 72px 0" : "24px 72px 0" }}>
        {index === 0 ? (
          <>
            <header className="flex items-start justify-between gap-6">
              <LogoOrWordmark
                doc={doc}
                maxHeight={56}
                maxWidth={240}
                wordmark={
                  <div className="text-[17px] leading-tight font-bold tracking-[0.08em]" style={{ color: doc.accent }}>
                    <StackedWords text={doc.company.wordmark} />
                  </div>
                }
              />
              <div className="text-right text-[12px] leading-normal" style={{ color: MUTED }}>
                {doc.company.legalName}
                <br />
                {doc.company.addressLines.join(", ")}
                <br />
                {[doc.company.website, doc.company.phone].filter(Boolean).join(" · ")}
                <br />
                {doc.company.registration}
              </div>
            </header>
            <div aria-hidden className="mt-[22px]" style={{ borderTop: `1px solid ${RULE}` }} />
          </>
        ) : (
          <header className="flex items-baseline justify-between gap-4 pb-2.5" style={{ borderBottom: `1px solid ${RULE}` }}>
            <span className="text-[12px] font-bold tracking-[0.08em]" style={{ color: doc.accent }}>
              {doc.company.wordmark}
            </span>
            <span className="text-[12px]" style={{ color: MUTED }}>
              <Runs runs={doc.runningHeader} />
            </span>
          </header>
        )}
        <Flow>{children}</Flow>
        <footer className="mt-4 flex justify-between gap-4 pt-2 text-[12px]" style={{ marginBottom: 28, borderTop: `1px solid ${RULE}`, color: MUTED }}>
          <span>{doc.feeLine}</span>
          <span className="whitespace-nowrap">
            <PageLabel doc={doc} index={index} count={count} number={(n) => <strong style={{ color: doc.accent }}>{n}</strong>} />
          </span>
        </footer>
      </div>
    </PageBox>
  );
}

function flow(doc: LetterDocument) {
  const blockLook = look(doc);
  const numbered = (number: ReactNode, content: ReactNode, paddingTop: number) => (
    <div className="grid grid-cols-[36px_1fr]" style={{ paddingTop }}>
      <span className="text-[14px] font-bold" style={{ color: doc.accent }}>
        {number}
      </span>
      <div>{content}</div>
    </div>
  );
  const signature = (heading: string, name: ReactNode, second: ReactNode, place: ReactNode) => (
    <div className="flex flex-col pt-2.5" style={{ borderTop: `2px solid ${doc.accent}` }}>
      <span style={label}>{heading}</span>
      <span aria-hidden className="block h-12" style={{ borderBottom: `1px solid ${INK}` }} />
      <span className="mt-1.5 font-semibold">{name}</span>
      <span>{second}</span>
      <span className="mt-1.5 text-[12.5px]" style={{ color: MUTED }}>
        {place}
      </span>
    </div>
  );
  const blank = "______________";

  return standardFlow(doc, {
    look: blockLook,
    before: [
      {
        id: "recipient",
        node: (
          <div className="grid grid-cols-2 gap-6" style={{ paddingTop: 22 }}>
            <div className="flex flex-col">
              <span style={label}>{doc.phrases.confidential}</span>
              <span className="mt-1.5 font-semibold">
                <Runs runs={doc.recipient.name} />
              </span>
              {doc.recipient.addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <div className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-0.5 justify-self-end">
              <span style={label}>{doc.phrases["label.date"]}</span>
              <span>{doc.date}</span>
              {hasPlace(doc) ? (
                <>
                  <span style={label}>{doc.phrases["label.place"]}</span>
                  <span>
                    <Runs runs={doc.place} />
                  </span>
                </>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "title",
        node: (
          <div style={{ paddingTop: 30 }}>
            <p className="text-[12px] font-bold tracking-[0.12em] uppercase" style={{ color: doc.accent }}>
              {doc.title.label}
            </p>
            <h1 className="mt-1 text-balance" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.005em" }}>
              <Runs runs={doc.title.subject} />
            </h1>
          </div>
        ),
      },
    ],
    opening: { first: 18, rest: 8 },
    section: (section, index) =>
      sectionItems(section, blockLook, {
        head: (first) =>
          numbered(
            section.number ? String(section.number).padStart(2, "0") : "",
            <>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{section.title}</h2>
              <div style={{ paddingTop: 4 }}>{first}</div>
            </>,
            index === 0 ? 22 : 18,
          ),
        more: (block) => numbered("", block, 0),
      }),
    closing: { first: 22, rest: 12 },
    signatures: (
      <div className="grid grid-cols-2 gap-8" style={{ paddingTop: 20 }}>
        {signature(
          doc.signatures.company.heading,
          <Runs runs={doc.signatures.company.name} />,
          <Runs runs={doc.signatures.company.title} />,
          <>
            {doc.signatures.placeLabel}: <Runs runs={doc.signatures.company.place} /> · {doc.signatures.dateLabel}: {blank}
          </>,
        )}
        {signature(
          doc.signatures.candidate.heading,
          <Runs runs={doc.signatures.candidate.name} />,
          doc.signatures.candidate.note,
          <>
            {doc.signatures.placeLabel}: {blank} · {doc.signatures.dateLabel}: {blank}
          </>,
        )}
      </div>
    ),
  });
}

export const modern: LetterStyle = { key: "modern", Page, flow };
