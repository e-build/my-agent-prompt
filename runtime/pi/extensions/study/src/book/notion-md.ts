/**
 * Notion-flavored Markdown (as returned by the Notion MCP `fetch`) → the plain
 * markdown subset the book renderer understands. Pure and line-oriented:
 * code (fenced and inline) is copied verbatim; Notion container tags are
 * unwrapped; media are collected so the caller can download them; nothing
 * Notion-specific may leak as a raw tag.
 */
export type NotionConvertOptions = {
  /** Local path for a downloaded image; `i` is the image's order in the page. */
  imagePath?: (ref: string, i: number) => string;
  /** Link target for another converted Notion page (32-hex id), or null when it is not part of the export. */
  pageLink?: (id: string) => string | null;
  /** Title for a mentioned page without a label. */
  pageTitle?: (id: string) => string | null;
};
export type NotionConvertResult = {
  markdown: string;
  images: Array<{ ref: string; path: string }>;
  childPages: string[];
  databases: Array<{ title: string; dataSource: string }>;
  warnings: string[];
};

const NOTION_PAGE = /^https:\/\/app\.notion\.com\/p\/(?:[^/]+\/)?(?:[^/?#]*-)?([0-9a-f]{32})/;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"') : null;
}

function pageId(url: string | null): string | null {
  return url ? (NOTION_PAGE.exec(url)?.[1] ?? null) : null;
}

/** Split into code and non-code runs so tag rewriting never touches code. */
function splitCode(src: string): Array<{ code: boolean; text: string }> {
  const parts: Array<{ code: boolean; text: string }> = [];
  const lines = src.split("\n");
  let buf: string[] = [];
  let i = 0;
  const flush = () => {
    if (buf.length) parts.push({ code: false, text: buf.join("\n") });
    buf = [];
  };
  while (i < lines.length) {
    const open = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!open) {
      buf.push(lines[i++]);
      continue;
    }
    flush();
    const fence = open[2];
    const body = [lines[i++]];
    while (i < lines.length && !new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
    if (i < lines.length) body.push(lines[i++]);
    parts.push({ code: true, text: body.join("\n") });
  }
  flush();
  return parts;
}

class Converter {
  images: NotionConvertResult["images"] = [];
  childPages: string[] = [];
  databases: NotionConvertResult["databases"] = [];
  warnings: string[] = [];
  private options: NotionConvertOptions;
  constructor(options: NotionConvertOptions) {
    this.options = options;
  }

  link(url: string): string {
    const id = pageId(url);
    return (id && this.options.pageLink?.(id)) || url;
  }

  /** Inline tags only; inline code spans are protected. */
  inline(text: string): string {
    const codes: string[] = [];
    let s = text.replace(/<code>([\s\S]*?)<\/code>|`[^`\n]+`/g, (m, inner) => {
      codes.push(inner !== undefined ? "`" + inner.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") + "`" : m);
      return `\u0000${codes.length - 1}\u0000`;
    });
    s = s
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<b>(\s*)([\s\S]*?)(\s*)<\/b>/g, (_m, a, t, b) => (t ? `${a}**${t}**${b}` : `${a}${b}`))
      .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
      .replace(/<i>(\s*)([\s\S]*?)(\s*)<\/i>/g, (_m, a, t, b) => (t ? `${a}*${t}*${b}` : `${a}${b}`))
      .replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
      .replace(/<s>([\s\S]*?)<\/s>/g, "~~$1~~")
      .replace(/<\/?u>/g, "")
      .replace(/<span\b[^>]*>|<\/span>/g, "")
      .replace(/<mention\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mention>)/g, (_m, attrs, label) => {
        const url = attr(attrs, "url");
        const id = pageId(url);
        const name = (label && label.trim()) || (id && this.options.pageTitle?.(id)) || url || "링크";
        return url ? `[${name}](${this.link(url)})` : name;
      })
      .replace(/<date\b([^>]*)\/>/g, (_m, attrs) => [attr(attrs, "start"), attr(attrs, "end")].filter(Boolean).join(" ~ "))
      .replace(/<link-preview\b([^>]*)\/>/g, (_m, attrs) => {
        const url = attr(attrs, "source") ?? attr(attrs, "url") ?? "";
        return url ? `[${url}](${url})` : "";
      });
    return s.replace(/\u0000(\d+)\u0000/g, (_m, n) => codes[Number(n)]);
  }

  /** One block-level pass over a non-code run. */
  blocks(text: string): string {
    let s = text;
    // Notion-only markers.
    s = s.replace(/^\s*<table-of-contents\b[^>]*\/>\s*$/gm, "");
    s = s.replace(/^\s*<p\s*\/>\s*$/gm, "");
    s = s.replace(/<unknown\b([^>]*)\/>/g, (_m, attrs) => {
      this.warnings.push(`알 수 없는 노션 블록(${attr(attrs, "alt") ?? "?"})`);
      return "";
    });
    s = s.replace(/<database\b([^>]*)>([\s\S]*?)<\/database>/g, (_m, attrs, title) => {
      const dataSource = attr(attrs, "data-source-url") ?? attr(attrs, "url") ?? "";
      const name = title.trim() || "제목 없음";
      this.databases.push({ title: name, dataSource });
      return `> 노션 데이터베이스: ${name} (${dataSource})`;
    });
    s = s.replace(/<synced-block(?:-reference)?\b[^>]*>\n?([\s\S]*?)\n?<\/synced-block(?:-reference)?>/g, "$1");
    // Media.
    s = s.replace(/<image\b([^>]*?)(?:\/>|>([\s\S]*?)<\/image>)/g, (_m, attrs, caption) => {
      const ref = attr(attrs, "source") ?? "";
      const alt = (caption ?? "").trim().replace(/[\[\]]/g, "");
      if (/^notion-file-block:\/\//.test(ref) || /^attachment:/.test(ref)) {
        const path = this.options.imagePath?.(ref, this.images.length) ?? ref;
        this.images.push({ ref, path });
        return `![${alt}](${path})`;
      }
      return `![${alt}](${ref})`;
    });
    s = s.replace(/<(bookmark|embed|video|audio|file|pdf)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g, (_m, kind, attrs, caption) => {
      const url = attr(attrs, "source") ?? attr(attrs, "url");
      if (!url) {
        this.warnings.push(`주소 없는 ${kind} 블록`);
        return "";
      }
      const label = (caption ?? "").trim() || url;
      return `[${label}](${url})`;
    });
    s = s.replace(/<page\b([^>]*)>\n?([\s\S]*?)\n?<\/page>/g, (_m, attrs, title) => {
      const url = attr(attrs, "url") ?? "";
      const id = pageId(url);
      if (id) this.childPages.push(id);
      const name = this.inline(title.trim()).replace(/\*\*|\*/g, "") || "제목 없음";
      return `- [${name}](${this.link(url)})`;
    });
    // Tables → pipe tables.
    s = s.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/g, (_m, attrs, body) => this.table(attrs, body));
    // One-line containers: `<p>text</p>`, `<li></li>`, `<column …></column>`.
    s = s.replace(/^(\s*)<(p|li|column)\b[^>]*>([^\n<]*)<\/\2>\s*$/gm, (_m, indent, _tag, inner) => (inner.trim() ? `${indent}${inner.trim()}` : ""));
    // Containers: toggles, callouts, quotes, columns, html headings, paragraphs, lists.
    s = this.containers(s);
    return s;
  }

  table(attrs: string, body: string): string {
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
      [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
        this.inline(c[1].trim()).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
      ),
    );
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
    const header = attr(attrs, "header-row") === "true" ? pad(rows.shift()!) : Array(width).fill("");
    const line = (r: string[]) => `| ${r.join(" | ")} |`;
    return [line(header), `|${Array(width).fill("---").join("|")}|`, ...rows.map((r) => line(pad(r)))].join("\n");
  }

  containers(text: string): string {
    const lines = text.split("\n");
    const out: string[] = [];
    type Frame = { kind: string; prefix: string; first: boolean; indent: string; extra?: string };
    const stack: Frame[] = [];
    const emit = (line: string) => {
      const frame = stack[stack.length - 1];
      if (!frame) return out.push(line);
      if (frame.kind === "toggle-title" || frame.kind === "heading") {
        if (frame.first && line.trim()) {
          out.push(frame.extra === "heading" ? `${frame.prefix}${line.trim()}` : `${frame.indent}**${line.trim()}**`);
          frame.first = false;
          return;
        }
      }
      if (frame.kind === "quote") {
        if (!line.trim()) return out.push(">");
        const body = line.slice(Math.min(frame.indent.length, line.length - line.trimStart().length)).trimEnd();
        const quoted = `> ${frame.first && frame.extra ? `${frame.extra} ` : ""}${body}`;
        frame.first = false;
        return out.push(quoted);
      }
      if (frame.kind === "li") {
        if (frame.first && line.trim()) {
          out.push(`${frame.indent}${frame.prefix}${line.trim()}`);
          frame.first = false;
          return;
        }
        return out.push(line.trim() ? `${frame.indent}  ${line.trim()}` : "");
      }
      out.push(line);
    };
    for (const raw of lines) {
      const line = raw;
      const t = line.trim();
      let m: RegExpExecArray | null;
      if ((m = /^<toggle\b([^>]*)>$/.exec(t))) {
        const level = attr(m[1], "heading");
        stack.push(level ? { kind: "heading", prefix: `${"#".repeat(Number(level.slice(1)))} `, first: true, indent: "", extra: "heading" } : { kind: "toggle-title", prefix: "", first: true, indent: line.slice(0, line.length - line.trimStart().length) });
        continue;
      }
      if (/^<\/toggle>$/.test(t)) {
        stack.pop();
        continue;
      }
      const lead = line.slice(0, line.length - line.trimStart().length);
      if ((m = /^<callout\b([^>]*)>$/.exec(t))) {
        stack.push({ kind: "quote", prefix: "", first: true, indent: lead, extra: attr(m[1], "icon") ?? "" });
        continue;
      }
      if (/^<quote\b[^>]*>$/.test(t)) {
        stack.push({ kind: "quote", prefix: "", first: true, indent: lead });
        continue;
      }
      if (/^<\/(callout|quote)>$/.test(t)) {
        stack.pop();
        out.push("");
        continue;
      }
      if ((m = /^<h([1-4])\b[^>]*>$/.exec(t))) {
        stack.push({ kind: "heading", prefix: `${"#".repeat(Number(m[1]))} `, first: true, indent: "", extra: "heading" });
        continue;
      }
      if (/^<\/h[1-4]>$/.test(t)) {
        stack.pop();
        continue;
      }
      if (/^<(columns|column\b[^>]*|p\b[^>]*|ul|ol\b[^>]*)>$/.test(t) || /^<\/(columns|column|p|ul|ol)>$/.test(t)) {
        if (/^<(ol\b[^>]*)>$/.test(t)) stack.push({ kind: "ol", prefix: "", first: true, indent: "", extra: "0" });
        else if (t === "<ul>") stack.push({ kind: "ul", prefix: "", first: true, indent: "" });
        else if (/^<\/(ul|ol)>$/.test(t)) stack.pop();
        else if (/^<\/(column|p)>$/.test(t) || t === "</columns>") out.push("");
        continue;
      }
      if (/^<li\b[^>]*>$/.test(t)) {
        const parent = stack[stack.length - 1];
        const depth = stack.filter((f) => f.kind === "ul" || f.kind === "ol").length - 1;
        let marker = "- ";
        if (parent?.kind === "ol") {
          parent.extra = String(Number(parent.extra) + 1);
          marker = `${parent.extra}. `;
        }
        stack.push({ kind: "li", prefix: marker, first: true, indent: "  ".repeat(Math.max(0, depth)) });
        continue;
      }
      if (t === "</li>") {
        stack.pop();
        continue;
      }
      emit(line);
    }
    return out.join("\n");
  }
}

export function notionToMarkdown(source: string, options: NotionConvertOptions = {}): NotionConvertResult {
  const converter = new Converter(options);
  const body = splitCode(source)
    .map((part) => {
      if (part.code) return part.text;
      // Inline first so `<br />` inside callouts/cells turns into newlines before container handling.
      return converter.blocks(converter.inline(part.text));
    })
    .join("\n");
  const markdown = body
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { markdown, images: converter.images, childPages: converter.childPages, databases: converter.databases, warnings: converter.warnings };
}
