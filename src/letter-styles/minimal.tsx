"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LetterDocument } from "@/lib/letter/types";
import { BlockView, Flow, INK, LogoOrWordmark, MUTED, PageBox, Runs, standardFlow, type BlockLook, type FlowItem, type LetterStyle } from "./kit";

// Minimal: generous white space, small-caps labels, mostly monochrome. Sections are rows: a label, then the text.

const LINE = "#E3E3DE";
const LABEL_GREY = "#5B6472";

const look: BlockLook = {
  gap: { paragraph: 8, list: 4, table: 8, heading: 8 },
  table: { fontSize: 13.5, th: { fontWeight: 500, borderBottom: `1px solid ${INK}` }, td: { borderBottom: `1px solid ${LINE}` }, lastTd: { borderBottom: 0 } },
};

const label: CSSProperties = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: LABEL_GREY, paddingTop: 2 };

function Row({ label: text, children, top, bottom, borderTop }: { label?: string; children: ReactNode; top: number; bottom: number; borderTop?: boolean }) {
  return (
    <div
      className="grid grid-cols-[132px_1fr] gap-6"
      style={{ paddingTop: top, paddingBottom: bottom, borderBottom: bottom ? `1px solid ${LINE}` : undefined, borderTop: borderTop ? `1px solid ${LINE}` : undefined }}
    >
      {text ? <h2 style={{ ...label, fontWeight: 400 }}>{text}</h2> : <span />}
      <div>{children}</div>
    </div>
  );
}

function Page({ doc, index, count, children }: { doc: LetterDocument; index: number; count: number; children: ReactNode }) {
  return (
    <PageBox doc={doc} className="font-sans" style={{ padding: index === 0 ? "76px 88px 0" : "56px 88px 0", fontSize: 14, lineHeight: 1.6, color: INK }}>
      {index === 0 ? (
        <header className="flex items-center justify-between">
          <LogoOrWordmark doc={doc} maxHeight={40} maxWidth={200} wordmark={<span className="text-[13px] font-semibold tracking-[0.16em]">{doc.company.wordmark}</span>} />
          <span className="inline-flex items-center gap-2.5 text-[13px]" style={{ color: MUTED }}>
            <span aria-hidden className="size-[7px] rounded-full" style={{ background: doc.accent }} />
            <Runs runs={doc.dateLine} />
          </span>
        </header>
      ) : (
        <header className="flex items-center justify-between text-[12px]" style={{ color: MUTED }}>
          <span className="font-semibold tracking-[0.16em]" style={{ color: INK }}>
            {doc.company.wordmark}
          </span>
          <span>
            <Runs runs={doc.runningHeader} />
          </span>
        </header>
      )}
      <Flow>{children}</Flow>
      <footer className="mt-4 flex justify-between gap-4 text-[12px]" style={{ marginBottom: 36, color: LABEL_GREY }}>
        <span>{doc.feeLine}</span>
        <span className="whitespace-nowrap tracking-[0.08em]">
          <span className="font-semibold" style={{ color: doc.accent }}>
            {index + 1}
          </span>{" "}
          / {count}
        </span>
      </footer>
    </PageBox>
  );
}

function flow(doc: LetterDocument) {
  const blank = "______________";
  const signature = (heading: string, name: ReactNode, place: ReactNode) => (
    <div className="flex flex-col">
      <span style={label}>{heading}</span>
      <span aria-hidden className="block h-10" style={{ borderBottom: `1px solid ${INK}` }} />
      <span className="mt-1.5 font-medium">{name}</span>
      <span className="text-[12.5px]" style={{ color: MUTED }}>
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
          <div className="grid grid-cols-[132px_1fr] gap-x-6 gap-y-3" style={{ paddingTop: 56 }}>
            <span style={label}>{doc.phrases["label.to"]}</span>
            <div className="flex flex-col">
              <span className="font-semibold">
                <Runs runs={doc.recipient.name} />
              </span>
              {doc.recipient.addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <span style={label}>{doc.phrases["label.from"]}</span>
            <div className="flex flex-col" style={{ color: MUTED }}>
              <span>{[doc.company.legalName, ...doc.company.addressLines].join(" · ")}</span>
              <span>{[doc.company.website, doc.company.registration].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
        ),
      },
      {
        id: "title",
        node: (
          <h1 className="text-balance" style={{ paddingTop: 52, fontSize: 24, fontWeight: 300, lineHeight: 1.25, letterSpacing: "-0.005em" }}>
            {doc.title.label}: <Runs runs={doc.title.subject} />
          </h1>
        ),
      },
    ],
    opening: { first: 22, rest: 8 },
    section: (section, index): FlowItem[] => {
      const last = section.blocks.length - 1;
      return section.blocks.map((block, blockIndex) => ({
        id: `${section.key}-${blockIndex}`,
        node: (
          <div style={{ paddingTop: index === 0 && blockIndex === 0 ? 30 : 0 }}>
            <Row
              label={blockIndex === 0 ? section.shortTitle : undefined}
              top={blockIndex === 0 ? 16 : 8}
              bottom={blockIndex === last ? 16 : 0}
              borderTop={index === 0 && blockIndex === 0}
            >
              <BlockView block={block} look={look} first />
            </Row>
          </div>
        ),
      }));
    },
    closing: { first: 26, rest: 10 },
    signatures: (
      <div className="grid grid-cols-2 gap-10" style={{ paddingTop: 18 }}>
        {signature(
          doc.signatures.company.heading,
          <>
            <Runs runs={doc.signatures.company.name} />, <Runs runs={doc.signatures.company.title} />
          </>,
          <>
            <Runs runs={doc.signatures.company.place} /> · {doc.signatures.dateLabel} {blank}
          </>,
        )}
        {signature(
          doc.signatures.candidate.heading,
          <Runs runs={doc.signatures.candidate.name} />,
          <>
            {doc.signatures.placeLabel} {blank} · {doc.signatures.dateLabel} {blank}
          </>,
        )}
      </div>
    ),
  });
}

export const minimal: LetterStyle = { key: "minimal", Page, flow };
