"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LetterDocument } from "@/lib/letter/types";
import { letterStyle } from "./index";
import { LetterRenderProvider, PAPER, type ChipMode, type FlowItem } from "./kit";

// Splits a letter into pages. Every flow item is measured in hidden copies of the first page and of a later page
// (they can differ in width, as in Executive), then pages are filled in order:
//   * an item never splits (headings come with their first paragraph, table rows and signatures stay whole),
//   * an item marked keepWithNext moves to the next page with the item after it ("Yours sincerely" + signatures).
// The PDF is printed from these same pages, so the preview breaks exactly where the PDF will.

export function paginate(heights: { first: number[]; rest: number[] }, capacity: { first: number; rest: number }, items: FlowItem[]): number[][] {
  const pages: number[][] = [[]];
  let used = 0;
  const pageIsFirst = () => pages.length === 1;
  const height = (index: number) => (pageIsFirst() ? heights.first[index] : heights.rest[index]) ?? 0;
  const room = () => (pageIsFirst() ? capacity.first : capacity.rest) - used;

  for (let index = 0; index < items.length; index++) {
    const needed = height(index) + (items[index]?.keepWithNext && index + 1 < items.length ? height(index + 1) : 0);
    const current = pages.at(-1)!;
    if (current.length && needed > room() + 0.5) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1)!.push(index);
    used += height(index);
  }
  return pages;
}

const noSubscription = () => () => {};

/**
 * Pages are laid out by measuring in the browser, so the server sends a blank page of the right size instead of
 * rendering (and discarding) the whole letter. This keeps server rendering of the editor and gallery cheap.
 */
function useInBrowser() {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

export function LetterPages({
  doc,
  chips = "static",
  onJump,
  onPageCount,
  gap = 24,
  onlyFirstPage = false,
  print = false,
  watermark,
  onReady,
}: {
  doc: LetterDocument;
  chips?: ChipMode;
  onJump?: (field: string) => void;
  onPageCount?: (count: number) => void;
  gap?: number;
  onlyFirstPage?: boolean;
  /** For the PDF: no gaps or shadows, one printed page per letter page. */
  print?: boolean;
  /** Drawn diagonally across every page, e.g. "PREVIEW – NOT VALID". */
  watermark?: string;
  /** Called once fonts are in and the pages are laid out for this letter. */
  onReady?: (pageCount: number) => void;
}) {
  const inBrowser = useInBrowser();
  const style = letterStyle(doc.templateKey);
  const items = useMemo(() => style.flow(doc), [style, doc]);
  // A layout is only valid for the items it was measured with (removing a section changes them).
  const [layout, setLayout] = useState<{ items: FlowItem[]; pages: number[][] } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const probeRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const read = (name: string) => {
      const flow = probe.querySelector<HTMLElement>(`[data-probe="${name}"] [data-flow]`);
      if (!flow) return { capacity: 0, heights: [] };
      // The preview may sit inside a zoom transform: convert screen sizes back to paper pixels.
      const scale = flow.getBoundingClientRect().width / flow.offsetWidth || 1;
      return {
        capacity: flow.clientHeight,
        heights: [...flow.children].map((child) => child.getBoundingClientRect().height / scale),
      };
    };
    const first = read("first");
    const rest = read("rest");
    const next = paginate({ first: first.heights, rest: rest.heights }, { first: first.capacity, rest: rest.capacity }, items);
    setLayout((previous) => (previous?.items === items && JSON.stringify(previous.pages) === JSON.stringify(next) ? previous : { items, pages: next }));
  }, [items]);

  // Measure once the real pages replace the server's placeholder, and again whenever the letter changes.
  useLayoutEffect(() => {
    if (inBrowser) measure();
  }, [measure, inBrowser]);
  useEffect(() => {
    // Web fonts change line breaks: measure again once they're in.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (cancelled) return;
      measure();
      setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);

  const pageList = layout?.items === items ? layout.pages : [items.map((_, index) => index)];
  const count = pageList.length;
  const measured = layout?.items === items;
  useEffect(() => onPageCount?.(count), [count, onPageCount]);
  useEffect(() => {
    if (inBrowser && fontsReady && measured) onReady?.(count);
  }, [inBrowser, fontsReady, measured, count, onReady]);

  const Page = style.Page;
  const paper = PAPER[doc.paperSize];
  const shown = onlyFirstPage ? pageList.slice(0, 1) : pageList;

  if (!inBrowser) {
    return <div aria-hidden className="bg-white shadow-paper" style={{ width: paper.width, height: paper.height }} />;
  }

  return (
    <LetterRenderProvider chips={chips} onJump={onJump}>
      <div ref={probeRef} aria-hidden data-letter-probe className="pointer-events-none invisible fixed top-0 -left-[10000px]" inert>
        <div data-probe="first">
          <Page doc={doc} index={0} count={1}>
            {items.map((item) => (
              <div key={item.id} className="flow-root">
                {item.node}
              </div>
            ))}
          </Page>
        </div>
        {onlyFirstPage ? null : (
          <div data-probe="rest">
            <Page doc={doc} index={1} count={2}>
              {items.map((item) => (
                <div key={item.id} className="flow-root">
                  {item.node}
                </div>
              ))}
            </Page>
          </div>
        )}
      </div>
      <div className="flex flex-col items-center" style={{ gap: print ? 0 : gap, width: paper.width }}>
        {shown.map((indexes, pageIndex) => (
          <div
            key={pageIndex}
            {...(print ? { "data-letter-page": pageIndex + 1 } : { role: "group", "aria-label": `Letter, page ${pageIndex + 1} of ${count}` })}
            className={print ? "relative" : "relative shadow-paper"}
            style={print && pageIndex < shown.length - 1 ? { breakAfter: "page" } : undefined}
          >
            {watermark ? <Watermark text={watermark} /> : null}
            <Page doc={doc} index={pageIndex} count={count}>
              {indexes.map((index) => {
                const item = items[index]!;
                return (
                  <div key={item.id} className="flow-root">
                    {item.node}
                  </div>
                );
              })}
            </Page>
          </div>
        ))}
      </div>
    </LetterRenderProvider>
  );
}

/** A diagonal mark across the page. Hidden from screen readers; in the PDF it's decoration, not content. */
function Watermark({ text }: { text: string }) {
  // 64 px fits "Preview – not valid" across the page; longer translations get smaller so they aren't cut off.
  const size = Math.min(64, Math.floor((64 * 19) / text.length));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
      <span
        className="font-sans font-bold tracking-[0.08em] whitespace-nowrap uppercase select-none"
        style={{ fontSize: size, color: "rgb(180 35 24 / 0.16)", transform: "rotate(-35deg)" }}
      >
        {text}
      </span>
    </div>
  );
}
