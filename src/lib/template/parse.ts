// Clause templates: a small Markdown subset (see markdown.ts) with placeholders and conditions.
//
//   {{position.job_title}}                          a value
//   {{#if position.department}} in {{position.department}}{{/if}}
//   {{#if notice.option == "custom"}}…{{else}}…{{/if}}
//   {{#unless conditions.references}}…{{/unless}}
//   {{#if a and b}} {{#if a or not b}} {{#if probation.months != "0"}}
//
// Templates are parsed once into a tree, then evaluated against a letter's values. Evaluation yields text and
// placeholder tokens; values are never spliced into the text, so nothing a user types is read as Markdown or HTML.

export type Condition =
  | { kind: "or"; terms: Condition[] }
  | { kind: "and"; terms: Condition[] }
  | { kind: "not"; term: Condition }
  | { kind: "truthy"; key: string }
  | { kind: "equals"; key: string; value: string; negate: boolean };

export type TemplateNode =
  | { kind: "text"; text: string }
  | { kind: "placeholder"; key: string }
  | { kind: "if"; condition: Condition; then: TemplateNode[]; else: TemplateNode[] };

export type EvaluatedToken = { kind: "text"; text: string } | { kind: "placeholder"; key: string };

export class TemplateError extends Error {
  override name = "TemplateError";
}

const KEY = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const TAG = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function parseCondition(source: string): Condition {
  const orParts = source.split(/\s+or\s+/);
  if (orParts.length > 1) return { kind: "or", terms: orParts.map(parseCondition) };
  const andParts = source.split(/\s+and\s+/);
  if (andParts.length > 1) return { kind: "and", terms: andParts.map(parseCondition) };

  const term = source.trim();
  if (term.startsWith("not ")) return { kind: "not", term: parseCondition(term.slice(4)) };
  const comparison = term.match(/^([a-z0-9_.]+)\s*(==|!=)\s*"([^"]*)"$/);
  if (comparison) {
    const [, key = "", operator, value = ""] = comparison;
    if (!KEY.test(key)) throw new TemplateError(`Unknown field name "${key}" in a condition`);
    return { kind: "equals", key, value, negate: operator === "!=" };
  }
  if (!KEY.test(term)) throw new TemplateError(`Can't read the condition "${source}"`);
  return { kind: "truthy", key: term };
}

type Frame = { kind: "if" | "unless"; condition: Condition; then: TemplateNode[]; else: TemplateNode[]; inElse: boolean };

export function parseTemplate(source: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: Frame[] = [];
  const target = () => {
    const frame = stack.at(-1);
    if (!frame) return root;
    return frame.inElse ? frame.else : frame.then;
  };

  let last = 0;
  for (const match of source.matchAll(TAG)) {
    if (match.index > last) target().push({ kind: "text", text: source.slice(last, match.index) });
    last = match.index + match[0].length;
    const tag = match[1] ?? "";

    const open = tag.match(/^#(if|unless)\s+(.+)$/);
    if (open) {
      stack.push({ kind: open[1] as "if" | "unless", condition: parseCondition(open[2] ?? ""), then: [], else: [], inElse: false });
    } else if (tag === "else") {
      const frame = stack.at(-1);
      if (!frame || frame.inElse) throw new TemplateError("{{else}} without a matching {{#if}}");
      frame.inElse = true;
    } else if (tag === "/if" || tag === "/unless") {
      const frame = stack.pop();
      if (!frame || `/${frame.kind}` !== tag) throw new TemplateError(`{{${tag}}} without a matching opening tag`);
      const condition: Condition = frame.kind === "unless" ? { kind: "not", term: frame.condition } : frame.condition;
      target().push({ kind: "if", condition, then: frame.then, else: frame.else });
    } else if (KEY.test(tag)) {
      target().push({ kind: "placeholder", key: tag });
    } else {
      throw new TemplateError(`Can't read {{${tag}}}`);
    }
  }
  if (last < source.length) target().push({ kind: "text", text: source.slice(last) });
  if (stack.length) throw new TemplateError(`{{#${stack.at(-1)?.kind}}} is never closed`);
  return root;
}

export type ValueLookup = { truthy: (key: string) => boolean; raw: (key: string) => string };

export function evaluateCondition(condition: Condition, values: ValueLookup): boolean {
  switch (condition.kind) {
    case "or":
      return condition.terms.some((term) => evaluateCondition(term, values));
    case "and":
      return condition.terms.every((term) => evaluateCondition(term, values));
    case "not":
      return !evaluateCondition(condition.term, values);
    case "truthy":
      return values.truthy(condition.key);
    case "equals":
      return (values.raw(condition.key) === condition.value) !== condition.negate;
  }
}

export function evaluateTemplate(nodes: TemplateNode[], values: ValueLookup): EvaluatedToken[] {
  const out: EvaluatedToken[] = [];
  const walk = (list: TemplateNode[]) => {
    for (const node of list) {
      if (node.kind === "if") walk(evaluateCondition(node.condition, values) ? node.then : node.else);
      else if (node.kind === "text") {
        const previous = out.at(-1);
        if (previous?.kind === "text") previous.text += node.text;
        else out.push({ kind: "text", text: node.text });
      } else out.push(node);
    }
  };
  walk(nodes);
  return out;
}

/** Every field name a template refers to, in placeholders and conditions. */
export function templateKeys(nodes: TemplateNode[]): Set<string> {
  const keys = new Set<string>();
  const fromCondition = (condition: Condition) => {
    if (condition.kind === "or" || condition.kind === "and") condition.terms.forEach(fromCondition);
    else if (condition.kind === "not") fromCondition(condition.term);
    else keys.add(condition.key);
  };
  const walk = (list: TemplateNode[]) => {
    for (const node of list) {
      if (node.kind === "placeholder") keys.add(node.key);
      if (node.kind === "if") {
        fromCondition(node.condition);
        walk(node.then);
        walk(node.else);
      }
    }
  };
  walk(nodes);
  return keys;
}

/** Field names a template prints as values (not those it only tests in conditions). */
export function placeholderKeys(nodes: TemplateNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (list: TemplateNode[]) => {
    for (const node of list) {
      if (node.kind === "placeholder") keys.add(node.key);
      if (node.kind === "if") {
        walk(node.then);
        walk(node.else);
      }
    }
  };
  walk(nodes);
  return keys;
}
