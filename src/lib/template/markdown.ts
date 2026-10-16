import type { EvaluatedToken } from "./parse";

// The Markdown subset clauses may use, read from evaluated tokens:
//   paragraphs (separated by a blank line; single line breaks join with a space)
//   ### a sub-heading
//   - unordered list items        1. ordered list items
//   | pipe | tables |  with a |---|---:| separator row after the header (":" on the right aligns right)
//   **bold** and *italic* inside any of these
// Anything else, HTML included, is plain text.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "placeholder"; key: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] };

export type MdBlock =
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "heading"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; align: ("left" | "right")[]; header: Inline[][]; rows: Inline[][][] };

type Line = EvaluatedToken[];

function splitLines(tokens: EvaluatedToken[]): Line[] {
  const lines: Line[] = [[]];
  for (const token of tokens) {
    if (token.kind === "placeholder") {
      lines.at(-1)!.push(token);
      continue;
    }
    token.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ kind: "text", text: part });
    });
  }
  return lines;
}

const lineText = (line: Line) => line.map((t) => (t.kind === "text" ? t.text : "\u0000")).join("");
const isBlank = (line: Line) => line.every((t) => t.kind === "text" && !t.text.trim());

/** Drops `length` characters from the start of a line (its Markdown marker). */
function stripPrefix(line: Line, length: number): Line {
  const out: Line = [];
  let remaining = length;
  for (const token of line) {
    if (remaining > 0 && token.kind === "text") {
      const cut = Math.min(remaining, token.text.length);
      remaining -= cut;
      if (token.text.length > cut) out.push({ kind: "text", text: token.text.slice(cut) });
    } else out.push(token);
  }
  return out;
}

function trimLine(line: Line): Line {
  const out = line.map((t) => ({ ...t }));
  const first = out[0];
  if (first?.kind === "text") first.text = first.text.trimStart();
  const last = out.at(-1);
  if (last?.kind === "text") last.text = last.text.trimEnd();
  return out.filter((t) => t.kind !== "text" || t.text);
}

/** Splits a table row on "|" outside placeholders. */
function tableCells(line: Line): Line[] {
  const cells: Line[] = [[]];
  for (const token of trimLine(line)) {
    if (token.kind === "placeholder") {
      cells.at(-1)!.push(token);
      continue;
    }
    token.text.split("|").forEach((part, index) => {
      if (index > 0) cells.push([]);
      if (part) cells.at(-1)!.push({ kind: "text", text: part });
    });
  }
  // A row starts and ends with "|", leaving an empty first and last cell.
  if (cells.length && isBlank(cells[0]!)) cells.shift();
  if (cells.length && isBlank(cells.at(-1)!)) cells.pop();
  return cells.map(trimLine);
}

export function parseInline(line: Line): Inline[] {
  type Open = { marker: "**" | "*"; children: Inline[] };
  const root: Inline[] = [];
  const stack: Open[] = [];
  const target = () => stack.at(-1)?.children ?? root;
  const pushText = (text: string) => {
    if (!text) return;
    const list = target();
    const previous = list.at(-1);
    if (previous?.kind === "text") previous.text += text;
    else list.push({ kind: "text", text });
  };

  for (const token of line) {
    if (token.kind === "placeholder") {
      target().push(token);
      continue;
    }
    for (const part of token.text.split(/(\*\*|\*)/)) {
      if (part === "**" || part === "*") {
        const open = stack.at(-1);
        if (open?.marker === part) {
          stack.pop();
          target().push({ kind: part === "**" ? "strong" : "em", children: open.children });
        } else stack.push({ marker: part, children: [] });
      } else pushText(part);
    }
  }
  // Unclosed markers are just characters.
  while (stack.length) {
    const open = stack.pop()!;
    const list = target();
    pushText(open.marker);
    list.push(...open.children);
  }
  return root;
}

export function parseBlocks(tokens: EvaluatedToken[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = splitLines(tokens);
  let paragraph: Line[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const joined: Line = [];
    paragraph.forEach((line, index) => {
      if (index > 0) joined.push({ kind: "text", text: " " });
      joined.push(...trimLine(line));
    });
    blocks.push({ kind: "paragraph", content: parseInline(joined) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const text = lineText(line).trimStart();
    const indent = lineText(line).length - text.length;

    if (isBlank(line)) {
      flushParagraph();
      continue;
    }
    if (text.startsWith("### ")) {
      flushParagraph();
      blocks.push({ kind: "heading", content: parseInline(trimLine(stripPrefix(line, indent + 4))) });
      continue;
    }
    const bullet = text.match(/^([-*]|\d+\.)\s+/);
    if (bullet) {
      flushParagraph();
      const ordered = /\d/.test(bullet[1]!);
      const item = parseInline(trimLine(stripPrefix(line, indent + bullet[0].length)));
      const previous = blocks.at(-1);
      if (previous?.kind === "list" && previous.ordered === ordered && lines[i - 1] && !isBlank(lines[i - 1]!)) previous.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }
    if (text.startsWith("|")) {
      flushParagraph();
      const rows: Line[] = [];
      while (i < lines.length && lineText(lines[i]!).trimStart().startsWith("|")) rows.push(lines[i++]!);
      i -= 1;
      const separator = rows[1] ? lineText(rows[1]).replace(/\s/g, "") : "";
      const hasHeader = /^\|?(:?-+:?\|)+:?-*:?\|?$/.test(separator);
      const align = hasHeader
        ? separator.split("|").filter(Boolean).map((cell) => (cell.endsWith(":") ? ("right" as const) : ("left" as const)))
        : [];
      const toCells = (row: Line) => tableCells(row).map(parseInline);
      blocks.push({
        kind: "table",
        align,
        header: hasHeader ? toCells(rows[0]!) : [],
        rows: (hasHeader ? rows.slice(2) : rows).map(toCells),
      });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}
