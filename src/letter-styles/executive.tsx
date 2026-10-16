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

// Executive: a tinted side column with the company's details and the offer at a glance on page 1.

const look = (doc: LetterDocument): BlockLook => ({
  gap: { paragraph: 8, list: 4, table: 8, heading: 8 },
  table: { fontSize: 13, th: { borderBottom: `1px solid ${doc.accent}` } },
});

const smallCaps: CSSProperties = { fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" };

function Footer({ doc, index, count }: { doc: LetterDocument; index: number; count: number }) {
  return (
    <footer className="mt-4 flex justify-between gap-3 pt-2 text-[12px]" style={{ marginBottom: 28, borderTop: `1px solid ${RULE}`, color: MUTED }}>
      <span>{doc.feeLine}</span>
      <span className="whitespace-nowrap">
        <PageLabel doc={doc} index={index} count={count} />
      </span>
    </footer>
  );
}

function SideColumn({ doc }: { doc: LetterDocument }) {
  const contact = [doc.company.website, doc.company.phone, doc.company.email].filter(Boolean);
  return (
    <aside className="flex w-[214px] shrink-0 flex-col gap-[22px]" style={{ background: doc.tint, padding: "52px 24px 40px 32px" }}>
      <div>
        <LogoOrWordmark
          doc={doc}
          maxHeight={64}
          maxWidth={158}
          wordmark={
            <div className="font-display text-[25px] leading-[1.05] font-semibold" style={{ color: doc.accent }}>
              <StackedWords text={doc.company.brand} />
            </div>
          }
        />
        <div aria-hidden className="mt-1.5 h-0.5 w-9" style={{ background: doc.accent }} />
      </div>
      <div className="flex flex-col gap-3.5 text-[12px] leading-normal" style={{ color: "#2F343C" }}>
        <div>
          <div style={{ ...smallCaps, color: MUTED }}>{doc.phrases["company.registered_office"]}</div>
          {doc.company.legalName}
          {doc.company.addressLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div>
          <div style={{ ...smallCaps, color: MUTED }}>{doc.phrases["company.registration"]}</div>
          {doc.company.registration}
        </div>
        <div>
          <div style={{ ...smallCaps, color: MUTED }}>{doc.phrases["company.contact"]}</div>
          {contact.map((line) => (
            <div key={line} className="break-words">
              {line}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-2.5 pt-4 text-[12px] leading-snug" style={{ borderTop: `1px solid ${doc.accent}` }}>
        <div style={{ ...smallCaps, color: doc.accent }}>{doc.phrases["facts.heading"]}</div>
        {doc.keyFacts
          .filter((fact) => fact.id !== "holiday")
          .map((fact) => (
            <div key={fact.id}>
              <div style={{ color: MUTED }}>{fact.label}</div>
              <div className="font-semibold">
                <Runs runs={fact.value} />
              </div>
            </div>
          ))}
      </div>
    </aside>
  );
}

function Page({ doc, index, count, children }: { doc: LetterDocument; index: number; count: number; children: ReactNode }) {
  const base: CSSProperties = { fontSize: 13.5, lineHeight: 1.55, color: INK };
  if (index === 0) {
    return (
      <PageBox doc={doc} className="flex-row font-sans" style={base}>
        <SideColumn doc={doc} />
        <div className="flex min-w-0 flex-1 flex-col" style={{ padding: "52px 64px 0 48px" }}>
          <Flow>{children}</Flow>
          <Footer doc={doc} index={index} count={count} />
        </div>
      </PageBox>
    );
  }
  return (
    <PageBox doc={doc} className="font-sans" style={{ ...base, padding: "44px 72px 0" }}>
      <header className="flex items-baseline justify-between gap-4 pb-2.5" style={{ borderBottom: `1px solid ${doc.accent}` }}>
        <span className="font-display text-[16px] font-semibold" style={{ color: doc.accent }}>
          {doc.company.brand}
        </span>
        <span className="text-[12px]" style={{ color: MUTED }}>
          <Runs runs={doc.runningHeader} />
        </span>
      </header>
      <Flow>{children}</Flow>
      <Footer doc={doc} index={index} count={count} />
    </PageBox>
  );
}

function flow(doc: LetterDocument) {
  const blockLook = look(doc);
  const blank = "______________";
  const signature = (heading: string, name: ReactNode, second: ReactNode, place: ReactNode, divider?: boolean) => (
    <div className="flex flex-col" style={{ padding: "18px 20px", borderLeft: divider ? "1px solid #FFFFFF" : undefined }}>
      <span className="text-[12px]" style={{ ...smallCaps, color: doc.accent }}>
        {heading}
      </span>
      <span aria-hidden className="block h-[46px]" style={{ borderBottom: `1px solid ${INK}` }} />
      <span className="font-display mt-1.5 text-[16px] font-semibold">{name}</span>
      <span>{second}</span>
      <span className="mt-1.5 text-[12px]" style={{ color: MUTED }}>
        {place}
      </span>
    </div>
  );

  return standardFlow(doc, {
    look: blockLook,
    before: [
      {
        id: "recipient",
        node: (
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[12px]" style={{ ...smallCaps, color: MUTED }}>
                {doc.phrases.confidential}
              </span>
              <span className="mt-1.5 font-semibold">
                <Runs runs={doc.recipient.name} />
              </span>
              {doc.recipient.addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <span className="text-right">
              {hasPlace(doc) ? (
                <>
                  <Runs runs={doc.place} />
                  <br />
                </>
              ) : null}
              {doc.date}
            </span>
          </div>
        ),
      },
      {
        id: "title",
        node: (
          <div style={{ paddingTop: 34 }}>
            <h1 className="font-display text-[28px] leading-[1.15] font-medium tracking-[-0.005em]">{doc.title.label}</h1>
            <p className="font-display mt-0.5 text-[18px] italic" style={{ color: doc.accent }}>
              <Runs runs={doc.title.subject} />
            </p>
          </div>
        ),
      },
    ],
    opening: { first: 22, rest: 8 },
    section: (section, index) =>
      sectionItems(section, blockLook, {
        head: (first) => (
          <div style={{ paddingTop: index === 0 ? 22 : 18 }}>
            <h2 className="font-display text-[18px] font-semibold" style={{ color: doc.accent }}>
              {section.title}
            </h2>
            <div style={{ paddingTop: 4 }}>{first}</div>
          </div>
        ),
        more: (block) => block,
      }),
    closing: { first: 22, rest: 12 },
    signatures: (
      <div className="grid grid-cols-2" style={{ paddingTop: 20 }}>
        <div className="col-span-2 grid grid-cols-2" style={{ background: doc.tint }}>
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
            true,
          )}
        </div>
      </div>
    ),
  });
}

export const executive: LetterStyle = { key: "executive", Page, flow };
