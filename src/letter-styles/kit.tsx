"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { Block, LetterDocument, Run, TypedSignature } from "@/lib/letter/types";

// Shared building blocks for the letter styles. The same components render the live preview and, later, the PDF.
// No wording lives here: every word comes from the LetterDocument (clauses and phrases from the database).

export const PAPER = {
  a4: { width: 794, height: 1123, label: "A4" },
  letter: { width: 816, height: 1056, label: "US Letter" },
} as const;

export const INK = "#1A1D23";
export const MUTED = "#474C55";
export const RULE = "#D9D9D4";

/** How empty required fields show: buttons that jump to the field, plain labels (PDF preview), or nothing. */
export type ChipMode = "interactive" | "static";
const RenderContext = createContext<{ chips: ChipMode; onJump?: (field: string) => void }>({ chips: "static" });

export function LetterRenderProvider({ chips, onJump, children }: { chips: ChipMode; onJump?: (field: string) => void; children: ReactNode }) {
  return <RenderContext.Provider value={{ chips, onJump }}>{children}</RenderContext.Provider>;
}

export function Runs({ runs }: { runs: Run[] }) {
  const { chips, onJump } = useContext(RenderContext);
  return runs.map((run, index) => {
    switch (run.kind) {
      case "text":
        return run.text;
      case "value":
        return run.text.includes("\n") ? (
          <span key={index} className="whitespace-pre-line">
            {run.text}
          </span>
        ) : (
          run.text
        );
      case "strong":
        return (
          <strong key={index} className="font-semibold">
            <Runs runs={run.children} />
          </strong>
        );
      case "em":
        return (
          <em key={index}>
            <Runs runs={run.children} />
          </em>
        );
      case "missing":
        return chips === "interactive" && onJump ? (
          <button key={index} type="button" className="letter-chip" data-field={run.field} onClick={() => onJump(run.field)} aria-label={`Fill in: ${run.label}`}>
            {run.label}
          </button>
        ) : (
          <span key={index} className="letter-chip">
            {run.label}
          </span>
        );
    }
  });
}

// Typed signatures: the signatory's name in handwriting, in pen-blue ink. Sizes even out the fonts' different
// proportions; `lift` sets the baseline on the line, as a pen signature would sit.
const SIGNATURE_LOOK = {
  flowing: { family: "var(--font-signature-flowing), cursive", size: 34, lift: -7 },
  quick: { family: "var(--font-signature-quick), cursive", size: 36, lift: -6 },
  hand: { family: "var(--font-signature-hand), cursive", size: 24, lift: 2 },
} as const;
const SIGNATURE_INK = "#1B3B8C";

/**
 * Drawn inside a signature line's box (which must be `relative`), so the letter's layout and page breaks are the
 * same with or without it. Long names get smaller to stay on the line. Hidden from screen readers and the PDF's
 * structure: the printed name under the line says the same.
 */
export function SignatureMark({ signature }: { signature: TypedSignature | null }) {
  if (!signature) return null;
  const look = SIGNATURE_LOOK[signature.style];
  const size = Math.round(look.size * Math.min(1, 20 / Math.max(signature.text.length, 1)));
  return (
    <span
      aria-hidden
      data-signature={signature.style}
      className="pointer-events-none absolute left-1 whitespace-nowrap select-none"
      style={{ bottom: look.lift, fontFamily: look.family, fontSize: size, lineHeight: 1.2, color: SIGNATURE_INK, fontWeight: 400 }}
    >
      {signature.text}
    </span>
  );
}

export type BlockLook = {
  /** Space above a block, by kind (padding, so heights add up when pages are measured). */
  gap: { paragraph: number; list: number; table: number; heading: number };
  table?: { head?: CSSProperties; th?: CSSProperties; td?: CSSProperties; lastTd?: CSSProperties; fontSize?: number };
  heading?: CSSProperties;
};

export function BlockView({ block, look, first }: { block: Block; look: BlockLook; first?: boolean }) {
  const paddingTop = first ? 0 : look.gap[block.kind];
  switch (block.kind) {
    case "paragraph":
      return (
        <p style={{ paddingTop }} className="text-pretty">
          <Runs runs={block.runs} />
        </p>
      );
    case "heading":
      return (
        <h3 style={{ paddingTop, fontWeight: 600, ...look.heading }}>
          <Runs runs={block.runs} />
        </h3>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <div style={{ paddingTop }}>
          <List className={block.ordered ? "list-decimal" : "list-disc"} style={{ paddingLeft: 22 }}>
            {block.items.map((item, index) => (
              <li key={index} className="text-pretty">
                <Runs runs={item} />
              </li>
            ))}
          </List>
        </div>
      );
    }
    case "table": {
      const t = look.table ?? {};
      return (
        <div style={{ paddingTop }}>
          <table className="w-full border-collapse" style={{ fontSize: t.fontSize }}>
            {block.header.length ? (
              <thead>
                <tr style={t.head}>
                  {block.header.map((cell, index) => (
                    <th key={index} scope="col" style={{ textAlign: block.align[index] ?? "left", fontWeight: 600, padding: "6px 0", ...t.th }}>
                      <Runs runs={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      style={{
                        textAlign: block.align[index] ?? "left",
                        padding: "6px 0",
                        borderBottom: `1px solid ${RULE}`,
                        fontVariantNumeric: block.align[index] === "right" ? "tabular-nums" : undefined,
                        ...t.td,
                        ...(rowIndex === block.rows.length - 1 ? t.lastTd : undefined),
                      }}
                    >
                      <Runs runs={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

/** The company's logo within its size limits, or its name as a text wordmark. */
export function LogoOrWordmark({
  doc,
  maxHeight,
  maxWidth,
  wordmark,
}: {
  doc: LetterDocument;
  maxHeight: number;
  maxWidth: number;
  wordmark: ReactNode;
}) {
  const logo = doc.company.logo;
  if (!logo) return wordmark;
  const scale = Math.min(maxHeight / logo.height, maxWidth / logo.width, 1);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo.url} alt={doc.company.legalName} width={Math.round(logo.width * scale)} height={Math.round(logo.height * scale)} className="block object-contain" />
  );
}

/** "Page {{page}} of {{pages}}" with the page number styled by the caller. */
export function PageLabel({ doc, index, count, number }: { doc: LetterDocument; index: number; count: number; number?: (n: number) => ReactNode }) {
  const template = doc.phrases.page ?? "{{page}} / {{pages}}";
  const parts = template.split(/(\{\{page\}\}|\{\{pages\}\})/);
  return parts.map((part, i) =>
    part === "{{page}}" ? <span key={i}>{number ? number(index + 1) : index + 1}</span> : part === "{{pages}}" ? <span key={i}>{count}</span> : part,
  );
}

/** Puts the wordmark's words on separate lines when it's two words or more ("EXAMPLE / ENGINEERING"). */
export function StackedWords({ text }: { text: string }) {
  const words = text.split(/\s+/);
  if (words.length < 2) return text;
  const middle = Math.ceil(words.length / 2);
  return (
    <>
      {words.slice(0, middle).join(" ")}
      <br />
      {words.slice(middle).join(" ")}
    </>
  );
}

export const hasPlace = (doc: LetterDocument) => (doc.phrases.date_line ?? "").includes("{{place}}");

export type FlowItem = { id: string; node: ReactNode; keepWithNext?: boolean };

export type PageProps = { doc: LetterDocument; index: number; count: number; children: ReactNode };

export type LetterStyle = {
  key: string;
  Page: (props: PageProps) => ReactNode;
  flow: (doc: LetterDocument) => FlowItem[];
};

/** The page box every style uses: fixed paper size, content in `data-flow`, footer at the bottom. */
export function PageBox({
  doc,
  className,
  style,
  children,
}: {
  doc: LetterDocument;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const paper = PAPER[doc.paperSize];
  return (
    <article className={`letter-page ${className ?? ""}`} style={{ width: paper.width, height: paper.height, ...style }}>
      {children}
    </article>
  );
}

export function Flow({ children }: { children: ReactNode }) {
  return (
    <div data-flow className="min-h-0 flex-1">
      {children}
    </div>
  );
}

/**
 * Standard reading order shared by the styles: opening paragraphs, sections (heading kept with its first block),
 * closing paragraphs (the last kept with the signatures) and the signatures.
 */
export function standardFlow(
  doc: LetterDocument,
  parts: {
    look: BlockLook;
    before: FlowItem[];
    opening: { first: number; rest: number };
    section: (section: LetterDocument["sections"][number], index: number) => FlowItem[];
    closing: { first: number; rest: number };
    signatures: ReactNode;
  },
): FlowItem[] {
  const items: FlowItem[] = [...parts.before];
  doc.opening.forEach((block, index) =>
    items.push({
      id: `opening-${index}`,
      node: (
        <div style={{ paddingTop: index === 0 ? parts.opening.first : parts.opening.rest }}>
          <BlockView block={block} look={parts.look} first />
        </div>
      ),
    }),
  );
  doc.sections.forEach((section, index) => items.push(...parts.section(section, index)));
  doc.closing.forEach((block, index) =>
    items.push({
      id: `closing-${index}`,
      keepWithNext: index === doc.closing.length - 1,
      node: (
        <div style={{ paddingTop: index === 0 ? parts.closing.first : parts.closing.rest }}>
          <BlockView block={block} look={parts.look} first />
        </div>
      ),
    }),
  );
  items.push({ id: "signatures", node: parts.signatures });
  return items;
}

/** Items for one section: its heading with the first block, then each further block on its own. */
export function sectionItems(
  section: LetterDocument["sections"][number],
  look: BlockLook,
  render: { head: (first: ReactNode) => ReactNode; more: (block: ReactNode) => ReactNode },
): FlowItem[] {
  const [first, ...rest] = section.blocks;
  return [
    { id: `${section.key}-0`, node: render.head(first ? <BlockView block={first} look={look} first /> : null) },
    ...rest.map((block, index) => ({ id: `${section.key}-${index + 1}`, node: render.more(<BlockView block={block} look={look} />) })),
  ];
}
