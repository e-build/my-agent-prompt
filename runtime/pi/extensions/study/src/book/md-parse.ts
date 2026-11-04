/**
 * Markdown subset used by study documents, parsed into a small AST.
 * Blocks: headings, paragraphs, rules, fenced code (``` and ~~~), lists
 * (nested, ordered, task boxes), block quotes, GFM tables. Inline: code,
 * strong, em, strike, links, autolinks, backslash escapes. Raw HTML is never
 * interpreted: it stays text. Study managed-region comments are dropped.
 */
export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong" | "em" | "strike"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Align = "left" | "right" | "center" | null;
export type ListItem = { checked?: boolean; children: Block[] };
export type Block =
  | { type: "heading"; level: number; text: Inline[] }
  | { type: "paragraph"; text: Inline[] }
  | { type: "rule" }
  | { type: "code"; lang: string; value: string }
  | { type: "list"; ordered: boolean; start?: number; items: ListItem[] }
  | { type: "quote"; children: Block[] }
  | { type: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const STUDY_COMMENT = /^\s*<!--\s*\/?study:[^>]*-->\s*$/;
const DELIMITER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function stripFrontMatter(lines: string[]): string[] {
  if (lines[0] !== "---") return lines;
  const end = lines.indexOf("---", 1);
  return end > 0 && lines.slice(1, end).every((l) => /^[A-Za-z_][\w-]*:/.test(l) || !l.trim()) ? lines.slice(end + 1) : lines;
}

function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && body[i + 1] === "|") {
      current += inCode ? "\\|" : "|";
      i++;
      continue;
    }
    if (c === "`") inCode = !inCode;
    if (c === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  cells.push(current.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : null;
}

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function parseBlocks(input: string[]): Block[] {
  const lines = input;
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || STUDY_COMMENT.test(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ type: "code", lang: fence[2] ?? "", value: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (RULE.test(line) && !ITEM.exec(line)?.[4]?.trim()) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(QUOTE.exec(lines[i++])![1]);
      blocks.push({ type: "quote", children: parseBlocks(body) });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && DELIMITER.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map(alignOf);
      if (align.length === head.length || lines[i + 1].includes("|")) {
        i += 2;
        const rows: Inline[][][] = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes("|") && !startsBlock(lines[i])) {
          const cells = splitRow(lines[i++]);
          rows.push(head.map((_, c) => parseInline(cells[c] ?? "")));
        }
        blocks.push({ type: "table", align: head.map((_, c) => align[c] ?? null), head: head.map(parseInline), rows });
        continue;
      }
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !STUDY_COMMENT.test(lines[i]) && (body.length === 0 || !startsBlock(lines[i]))) body.push(lines[i++].trim());
    blocks.push({ type: "paragraph", text: parseInline(body.join("\n")) });
  }
  return blocks;
}

function parseList(lines: string[], start: number): [Block, number] {
  const first = ITEM.exec(lines[start])!;
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = ITEM.exec(lines[i]);
    if (!m || m[1].length !== baseIndent || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = baseIndent + m[2].length + Math.max(1, Math.min(m[3].length, 4));
    let text = m[4];
    let checked: boolean | undefined;
    const box = /^\[([ xX])\]\s+(.*)$/.exec(text);
    if (box) {
      checked = box[1] !== " ";
      text = box[2];
    }
    const body = [text];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        const next = lines.slice(i + 1).find((x) => x.trim());
        if (next !== undefined && indentOf(next) >= contentIndent) {
          body.push("");
          i++;
          continue;
        }
        break;
      }
      const sub = ITEM.exec(l);
      if (indentOf(l) >= Math.min(contentIndent, baseIndent + 2)) {
        body.push(l.slice(Math.min(indentOf(l), contentIndent)));
        i++;
        continue;
      }
      if (sub || startsBlock(l)) break;
      body.push(l.trim()); // lazy continuation
      i++;
    }
    items.push({ ...(checked !== undefined ? { checked } : {}), children: parseBlocks(body) });
    while (i < lines.length && !lines[i].trim()) {
      const next = lines.slice(i).find((x) => x.trim());
      const nm = next !== undefined ? ITEM.exec(next) : null;
      if (nm && nm[1].length === baseIndent && /\d/.test(nm[2]) === ordered) i++;
      else break;
    }
  }
  const startNumber = ordered ? Number.parseInt(first[2], 10) : undefined;
  return [{ type: "list", ordered, ...(ordered && startNumber !== 1 ? { start: startNumber } : {}), items }, i];
}

export function parseMarkdown(source: string): Block[] {
  const lines = stripFrontMatter(source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"));
  return parseBlocks(lines);
}

// ---------- inline ----------

const ESCAPABLE = "\\`*_{}[]()#+-.!|~<>";

function pushText(out: Inline[], value: string): void {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

function findClosing(src: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > 0) i = end;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function parseLinkTarget(src: string, from: number): { href: string; end: number } | null {
  if (src[from] !== "(") return null;
  let i = from + 1;
  while (src[i] === " ") i++;
  let href: string;
  if (src[i] === "<") {
    const close = src.indexOf(">", i);
    if (close < 0) return null;
    href = src.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const startHref = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      } else if (c === " ") break;
    }
    href = src.slice(startHref, i);
  }
  while (src[i] === " ") i++;
  if (src[i] === '"' || src[i] === "'") {
    const q = src[i];
    const close = src.indexOf(q, i + 1);
    if (close < 0) return null;
    i = close + 1;
    while (src[i] === " ") i++;
  }
  if (src[i] !== ")") return null;
  return { href, end: i + 1 };
}

const WORD = /[\p{L}\p{N}]/u;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      pushText(out, src[i + 1]);
      i += 2;
      continue;
    }
    if (c === "`") {
      let ticks = 1;
      while (src[i + ticks] === "`") ticks++;
      const fence = "`".repeat(ticks);
      const end = src.indexOf(fence, i + ticks);
      if (end > 0) {
        let value = src.slice(i + ticks, end);
        if (/^ .* $/.test(value) && value.trim()) value = value.slice(1, -1);
        out.push({ type: "code", value });
        i = end + ticks;
        continue;
      }
      pushText(out, fence);
      i += ticks;
      continue;
    }
    if (c === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(src.slice(i));
      if (auto) {
        out.push({ type: "link", href: auto[1], children: [{ type: "text", value: auto[1] }] });
        i += auto[0].length;
        continue;
      }
    }
    if (c === "[") {
      const close = findClosing(src, i + 1, "[", "]");
      if (close > 0) {
        const target = parseLinkTarget(src, close + 1);
        if (target) {
          out.push({ type: "link", href: target.href.replace(/\\(.)/g, "$1"), children: parseInline(src.slice(i + 1, close)) });
          i = target.end;
          continue;
        }
      }
    }
    if (c === "~" && src[i + 1] === "~") {
      const end = src.indexOf("~~", i + 2);
      if (end > i + 2) {
        out.push({ type: "strike", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (c === "*" || c === "_") {
      const double = src[i + 1] === c;
      const marker = double ? c + c : c;
      const after = src[i + marker.length];
      const before = src[i - 1];
      // `_` inside words (a_b_c) is never emphasis; neither is a marker followed by space.
      const opens = after !== undefined && after !== " " && !(c === "_" && before !== undefined && WORD.test(before));
      let closed = -1;
      for (let search = i + marker.length; opens && search < src.length; ) {
        const end = src.indexOf(marker, search);
        if (end < 0) break;
        const next = src[end + marker.length];
        const closes =
          src[end - 1] !== " " &&
          end > i + marker.length &&
          !(c === "_" && next !== undefined && WORD.test(next)) &&
          (double || next !== c);
        if (closes) {
          closed = end;
          break;
        }
        search = end + marker.length;
      }
      if (closed >= 0) {
        out.push({ type: double ? "strong" : "em", children: parseInline(src.slice(i + marker.length, closed)) });
        i = closed + marker.length;
        continue;
      }
      pushText(out, marker);
      i += marker.length;
      continue;
    }
    pushText(out, c);
    i++;
  }
  return out;
}
