"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { PAPER } from "@/letter-styles/kit";
import { LetterPages } from "@/letter-styles/letter-pages";
import type { FieldDefinition, LetterDocument } from "@/lib/letter/types";
import { previewWatermark } from "@/lib/letter/watermark";
import { cn } from "@/lib/utils";

// The live preview: real pages (the same ones the PDF prints), zoom, and chips for empty required fields.

const STEPS = [0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5];
const ZOOM_KEY = "olp.preview-zoom";
const PADDING = 32;

// Each device remembers its zoom. Without storage (private windows) it's kept for this visit only.
let memoryZoom: number | "fit" = "fit";
const zoomListeners = new Set<() => void>();

function readZoom(): number | "fit" {
  try {
    const saved = localStorage.getItem(ZOOM_KEY);
    return saved && STEPS.includes(Number(saved)) ? Number(saved) : memoryZoom;
  } catch {
    return memoryZoom;
  }
}

function writeZoom(next: number | "fit") {
  memoryZoom = next;
  try {
    if (next === "fit") localStorage.removeItem(ZOOM_KEY);
    else localStorage.setItem(ZOOM_KEY, String(next));
  } catch {
    // Kept in memory only.
  }
  zoomListeners.forEach((listener) => listener());
}

function subscribeZoom(listener: () => void) {
  zoomListeners.add(listener);
  return () => zoomListeners.delete(listener);
}

export type PreviewLanguages = {
  options: { code: string; label: string }[];
  value: string;
  onChange: (code: string) => void;
};

export function PreviewPane({
  visible,
  doc,
  styleName,
  missing,
  onJump,
  languages,
  className,
}: {
  /** False while the pane is hidden behind the Form tab on small screens: the pages aren't laid out then. */
  visible: boolean;
  doc: LetterDocument;
  styleName: string;
  missing: FieldDefinition[];
  onJump: (field: string) => void;
  /** A letter that also comes translated: which version the preview shows. */
  languages?: PreviewLanguages;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoom = useSyncExternalStore(subscribeZoom, readZoom, () => "fit" as const);
  const [fit, setFit] = useState(0.75);
  const [pages, setPages] = useState(1);
  const paper = PAPER[doc.paperSize];

  // "Fit width" picks the largest step that fits the pane.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      const available = (element.clientWidth - PADDING * 2) / paper.width;
      setFit([...STEPS].reverse().find((step) => step <= available) ?? STEPS[0]!);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [paper.width]);

  const scale = zoom === "fit" ? fit : zoom;
  const setAndRemember = useCallback((next: number | "fit") => writeZoom(next), []);
  const step = (direction: 1 | -1) => {
    const index = STEPS.indexOf(scale);
    const next = index === -1 ? STEPS.findIndex((s) => s > scale) - (direction < 0 ? 1 : 0) : index + direction;
    setAndRemember(STEPS[Math.max(0, Math.min(STEPS.length - 1, next))]!);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key === "=" || event.key === "+") step(1);
    else if (event.key === "-") step(-1);
    else if (event.key === "0") setAndRemember("fit");
    else return;
    event.preventDefault();
  };

  const totalHeight = pages * paper.height + (pages - 1) * 24;

  return (
    <section aria-label="Letter preview" className={cn("relative flex min-h-0 flex-col bg-desk", className)} onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#D5E3DD] bg-[#EEF4F1] px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">Live preview</span>
          <span className="text-xs text-ink-2">
            {styleName} · {paper.label} · {pages} {pages === 1 ? "page" : "pages"}
          </span>
        </div>
        {languages ? (
          <div role="radiogroup" aria-label="Preview language" className="flex rounded-[10px] bg-white p-0.5 ring-1 ring-[#C9D8D1]">
            {languages.options.map((option) => (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={languages.value === option.code}
                onClick={() => languages.onChange(option.code)}
                className={cn(
                  "min-h-10 rounded-lg px-3 text-sm font-semibold",
                  languages.value === option.code ? "bg-evergreen-600 text-white" : "text-ink-2 hover:bg-hover-soft",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        <div role="group" aria-label="Zoom" className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="Zoom out" className="inline-flex size-11 items-center justify-center rounded-[10px] hover:bg-white">
            <Minus aria-hidden className="size-4" />
          </button>
          <output aria-live="polite" className="w-12 text-center text-sm font-semibold tabular-nums">
            {Math.round(scale * 100)}%
          </output>
          <button type="button" onClick={() => step(1)} aria-label="Zoom in" className="inline-flex size-11 items-center justify-center rounded-[10px] hover:bg-white">
            <Plus aria-hidden className="size-4" />
          </button>
          <span aria-hidden className="mx-1 h-6 w-px bg-[#C9D8D1]" />
          <button
            type="button"
            onClick={() => setAndRemember("fit")}
            aria-pressed={zoom === "fit"}
            className={cn("min-h-11 rounded-[10px] px-3 text-sm font-semibold hover:bg-white", zoom === "fit" && "bg-white text-evergreen-700")}
          >
            Fit width
          </button>
        </div>
      </div>

      {languages && languages.value !== languages.options[0]?.code ? (
        <p className="px-4 pt-3 text-[13px] text-ink-2">
          The translation comes with the paid letter. Your typed answers appear as you typed them, and the English version prevails.
        </p>
      ) : null}

      {missing.length ? (
        <>
          <p className="hidden items-center gap-2 px-4 pt-3 text-[13px] text-ink-2 lg:flex">
            <span aria-hidden className="letter-chip">
              Field
            </span>
            Highlighted chips are required fields that are still empty. Select one to fill it in.
          </p>
          {/* Chips on a page shrunk to phone width are too small to tap, so phones get large ones here. */}
          <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 lg:hidden" role="group" aria-label="Empty required fields">
            {missing.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => onJump(field.key)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-dashed border-marigold-700 bg-chip px-3 text-sm font-semibold text-marigold-800"
              >
                {field.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" style={{ padding: PADDING }} tabIndex={-1}>
        <div className="mx-auto" style={{ width: paper.width * scale, height: totalHeight * scale }}>
          <div style={{ width: paper.width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            {/* Unpaid letters are always shown watermarked, like the preview PDF. */}
            {visible ? <LetterPages doc={doc} chips="interactive" onJump={onJump} onPageCount={setPages} watermark={previewWatermark(doc.language)} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
