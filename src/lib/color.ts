// A company's brand colour becomes the letter accent: headings, rules and numbers. A colour too light to read as
// text on white is darkened in 10% steps (the rule from the approved design) until it meets WCAG AA (4.5:1).

export const HEX_COLOR = /^#[0-9A-F]{6}$/;
const MIN_TEXT_CONTRAST = 4.5;

/** "#1f4e8c", "1F4E8C" and "#abc" become "#1F4E8C" / "#AABBCC"; anything else becomes null. */
export function normalizeHex(value: string): string | null {
  let hex = value.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) hex = [...hex].map((c) => c + c).join("");
  return /^[0-9A-F]{6}$/.test(hex) ? `#${hex}` : null;
}

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio of a colour against a white page, from 1 to 21. */
export function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(toRgb(hex)) + 0.05);
}

/** A pale fill of a colour for side columns and table headers (`share` is how much of the colour is kept). */
export function tintOf(hex: string, share = 0.1): string {
  return toHex(toRgb(hex).map((c) => Math.round(255 - (255 - c) * share)) as [number, number, number]);
}

/** The colour letters use for text: the brand colour itself, or a darker shade of it when it's too light. */
export function readableAccent(hex: string): { hex: string; darkened: boolean } {
  let rgb = toRgb(hex);
  let darkened = false;
  for (let step = 0; step < 40 && 1.05 / (luminance(rgb) + 0.05) < MIN_TEXT_CONTRAST; step++) {
    rgb = rgb.map((c) => Math.round(c * 0.9)) as [number, number, number];
    darkened = true;
  }
  return { hex: toHex(rgb), darkened };
}
