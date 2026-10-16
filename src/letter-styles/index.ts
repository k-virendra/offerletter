import { bold } from "./bold";
import { classic } from "./classic";
import { executive } from "./executive";
import type { LetterStyle } from "./kit";
import { minimal } from "./minimal";
import { modern } from "./modern";

// Letter layouts by templates.key. A style in the database without a layout here falls back to Classic.
const STYLES: Record<string, LetterStyle> = { classic, modern, minimal, executive, bold };

export function letterStyle(key: string): LetterStyle {
  return STYLES[key] ?? classic;
}

export const STYLE_KEYS = Object.keys(STYLES);
