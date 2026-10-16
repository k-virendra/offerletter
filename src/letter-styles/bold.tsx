"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LetterDocument } from "@/lib/letter/types";
import {
  Flow,
  INK,
  LogoOrWordmark,
  MUTED,
  PageBox,
  RULE,
  Runs,
  sectionItems,
  StackedWords,
  standardFlow,
  type BlockLook,
  type LetterStyle,
} from "./kit";

// Bold: colour blocks in the header and key facts in boxes, still print-friendly (the page stays white).

const look: BlockLook = {
  gap: { paragraph: 8, list: 4, table: 8, heading: 8 },
  table: { fontSize: 13, th: { fontWeight: 700, padding: "7px 0", borderBottom: `2px solid ${INK}` }, td: { padding: "7px 0" } },
};

const caps: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED };

function Page({ doc, index, count, children }: { doc: LetterDocument; index: number; count: number; children: ReactNode }) {
  return (
    <PageBox doc={doc} className="font-sans" style={{ fontSize: 13.5, lineHeight: 1.55, color: INK }}>
      {index === 0 ? (
        <header className="flex h-[168px] shrink-0">
          <div className="flex w-[236px] shrink-0 flex-col justify-between text-white" style={{ background: doc.accent, padding: "34px 28px" }}>
            {doc.company.logo ? (
              <span className="inline-flex self-start rounded bg-white p-1.5">
                <LogoOrWordmark doc={doc} maxHeight={44} maxWidth={168} wordmark={null} />
              </span>
            ) : (
              <div className="text-[19px] leading-tight font-bold tracking-[0.06em]">
                <StackedWords text={doc.company.wordmark} />
              </div>
            )}
            <div className="text-[12px] leading-snug">
              {doc.company.legalName}
              <br />
              {doc.company.addressLines.slice(-2).join(", ") || doc.company.countryName}
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center gap-1" style={{ background: doc.tint, padding: "34px 48px 28px 36px" }}>
            <span className="text-[12px] font-bold tracking-[0.14em] uppercase" style={{ color: doc.accent }}>
              {doc.title.label}
            </span>
            <span className="text-[30px] leading-[1.1] font-bold tracking-[-0.01em]">
              <Runs runs={doc.title.subject} />
            </span>
            <span className="mt-1 text-[14px]" style={{ color: "#2F343C" }}>
              <Runs runs={doc.addressedTo} />
            </span>
          </div>
        </header>
      ) : (
        <>
          <div aria-hidden className="h-2 shrink-0" style={{ background: doc.accent }} />
          <header className="mx-[72px] mt-[22px] flex items-center justify-between gap-4 pb-3" style={{ borderBottom: `1px solid ${RULE}` }}>
            <span className="inline-flex items-center gap-2.5">
              <span aria-hidden className="size-[22px]" style={{ background: doc.accent }} />
              <span className="text-[13px] font-bold tracking-[0.06em]">{doc.company.wordmark}</span>
            </span>
            <span className="text-[12px]" style={{ color: MUTED }}>
              <Runs runs={doc.runningHeader} />
            </span>
          </header>
        </>
      )}
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: index === 0 ? "30px 72px 0" : "0 72px" }}>
        <Flow>{children}</Flow>
        <footer className="mt-4 flex justify-between gap-4 pt-2 text-[12px]" style={{ marginBottom: 28, borderTop: `2px solid ${doc.accent}`, color: MUTED }}>
          <span>{doc.feeLine}</span>
          <span className="font-bold whitespace-nowrap" style={{ color: INK }}>
            {index + 1} / {count}
          </span>
        </footer>
      </div>
    </PageBox>
  );
}

function flow(doc: LetterDocument) {
  const blank = "____________";
  const facts = ["start_date", "annual_salary", "holiday", "reply_by"]
    .map((id) => doc.keyFacts.find((fact) => fact.id === id))
    .filter((fact) => fact !== undefined)
    .slice(0, 3);
  const box: CSSProperties = { border: `1px solid ${RULE}`, borderTop: `4px solid ${doc.accent}` };
  const signature = (heading: string, name: ReactNode, second: ReactNode, place: ReactNode) => (
    <div className="flex flex-col" style={{ ...box, padding: "12px 16px 14px" }}>
      <span style={caps}>{heading}</span>
      <span aria-hidden className="block h-[42px]" style={{ borderBottom: `1px solid ${INK}` }} />
      <span className="mt-1.5 font-bold">{name}</span>
      <span>{second}</span>
      <span className="mt-1 text-[12px]" style={{ color: MUTED }}>
        {place}
      </span>
    </div>
  );

  return standardFlow(doc, {
    look,
    before: [
      {
        id: "recipient",
        node: (
          <div className="grid grid-cols-2 gap-6 text-[13px]">
            <div className="flex flex-col">
              <span style={caps}>{doc.phrases["label.to"]}</span>
              <span className="mt-1 font-semibold">
                <Runs runs={doc.recipient.name} />
              </span>
              {doc.recipient.addressLines.length ? <span>{doc.recipient.addressLines.join(", ")}</span> : null}
              <span style={{ color: MUTED }}>{doc.phrases.confidential}</span>
            </div>
            <div className="flex flex-col">
              <span style={caps}>{doc.phrases["label.from"]}</span>
              <span className="mt-1">{doc.company.addressLines.join(", ")}</span>
              <span>{[doc.company.website, doc.company.phone].filter(Boolean).join(" · ")}</span>
              <span style={{ color: MUTED }}>{doc.company.registration}</span>
            </div>
          </div>
        ),
      },
    ],
    opening: { first: 24, rest: 6 },
    section: (section, index) => {
      const items = sectionItems(section, look, {
        head: (first) => (
          <div style={{ paddingTop: index === 0 ? 24 : 20 }}>
            <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-[0.1em] uppercase">
              <span aria-hidden className="size-[9px] shrink-0" style={{ background: doc.accent }} />
              {section.title}
            </h2>
            <div style={{ paddingTop: 4 }}>{first}</div>
          </div>
        ),
        more: (block) => block,
      });
      if (index > 0 || !facts.length) return items;
      return [
        {
          id: "facts",
          node: (
            <div className="grid gap-3" style={{ paddingTop: 22, gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
              {facts.map((fact) => (
                <div key={fact.id} style={{ ...box, padding: "10px 14px 12px" }}>
                  <div className="text-[12px] font-bold tracking-[0.08em] uppercase" style={{ color: MUTED }}>
                    {fact.label}
                  </div>
                  <div className="mt-0.5 text-[20px] leading-tight font-bold" style={{ color: doc.accent }}>
                    <Runs runs={fact.short ?? fact.value} />
                  </div>
                </div>
              ))}
            </div>
          ),
        },
        ...items,
      ];
    },
    closing: { first: 22, rest: 10 },
    signatures: (
      <div className="grid grid-cols-2 gap-6" style={{ paddingTop: 16 }}>
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

export const bold: LetterStyle = { key: "bold", Page, flow };
