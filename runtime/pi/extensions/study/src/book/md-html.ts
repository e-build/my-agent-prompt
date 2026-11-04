import { escapeHtml, highlight } from "./highlight.ts";
import { parseMarkdown, type Block, type Inline } from "./md-parse.ts";

export type TocEntry = { level: number; id: string; text: string };
export type RenderOptions = {
  /** Map an allowed href (relative, #anchor, http(s), mailto) to its final form. */
  rewriteLink?: (href: string) => string;
};
export type Rendered = { html: string; toc: TocEntry[]; mermaid: number; title: string | null };

const SAFE = /^(https?:|mailto:|#|\.{0,2}\/|[^:/?#]+(?:[/?#]|$))/i;

/** GitHub-compatible anchor: lower case, keep letters/digits/`-`/`_`, spaces → `-`. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function plain(nodes: Inline[]): string {
  return nodes.map((n) => ("value" in n ? n.value : plain(n.children))).join("");
}

class Renderer {
  toc: TocEntry[] = [];
  mermaid = 0;
  private slugs = new Map<string, number>();
  private options: RenderOptions;
  constructor(options: RenderOptions) {
    this.options = options;
  }

  inline(nodes: Inline[]): string {
    return nodes
      .map((n) => {
        switch (n.type) {
          case "text":
            return escapeHtml(n.value);
          case "code":
            return `<code>${escapeHtml(n.value)}</code>`;
          case "strong":
            return `<strong>${this.inline(n.children)}</strong>`;
          case "em":
            return `<em>${this.inline(n.children)}</em>`;
          case "strike":
            return `<del>${this.inline(n.children)}</del>`;
          case "link": {
            const label = this.inline(n.children);
            if (!SAFE.test(n.href) || /^\s*(javascript|data|vbscript):/i.test(n.href)) return label;
            const href = this.options.rewriteLink ? this.options.rewriteLink(n.href) : n.href;
            const external = /^https?:/i.test(href) ? ' rel="noopener noreferrer"' : "";
            return `<a href="${escapeHtml(href)}"${external}>${label}</a>`;
          }
        }
      })
      .join("");
  }

  slug(text: string): string {
    const base = headingSlug(text);
    const seen = this.slugs.get(base) ?? 0;
    this.slugs.set(base, seen + 1);
    return seen ? `${base}-${seen}` : base;
  }

  block(b: Block): string {
    switch (b.type) {
      case "heading": {
        const text = plain(b.text);
        const id = this.slug(text);
        this.toc.push({ level: b.level, id, text });
        return `<h${b.level} id="${escapeHtml(id)}">${this.inline(b.text)}</h${b.level}>`;
      }
      case "paragraph":
        return `<p>${this.inline(b.text)}</p>`;
      case "rule":
        return "<hr>";
      case "code":
        if (b.lang.toLowerCase() === "mermaid") {
          this.mermaid++;
          return `<pre class="mermaid">${escapeHtml(b.value)}</pre>`;
        }
        return `<pre><code${b.lang ? ` class="language-${escapeHtml(b.lang)}"` : ""}>${highlight(b.value, b.lang)}</code></pre>`;
      case "quote":
        return `<blockquote>${b.children.map((c) => this.block(c)).join("")}</blockquote>`;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        const start = b.ordered && b.start !== undefined ? ` start="${b.start}"` : "";
        const items = b.items
          .map((item) => {
            const body = item.children.map((c) => this.block(c)).join("");
            if (item.checked === undefined) return `<li>${body}</li>`;
            return `<li class="task"><input type="checkbox" disabled${item.checked ? " checked" : ""}> ${body}</li>`;
          })
          .join("");
        return `<${tag}${start}>${items}</${tag}>`;
      }
      case "table": {
        const style = (c: number) => (b.align[c] ? ` style="text-align:${b.align[c]}"` : "");
        const head = b.head.map((cell, c) => `<th${style(c)}>${this.inline(cell)}</th>`).join("");
        const rows = b.rows.map((row) => `<tr>${row.map((cell, c) => `<td${style(c)}>${this.inline(cell)}</td>`).join("")}</tr>`).join("");
        return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
      }
    }
  }
}

export function renderMarkdown(source: string, options: RenderOptions = {}): Rendered {
  const renderer = new Renderer(options);
  const html = parseMarkdown(source).map((b) => renderer.block(b)).join("\n");
  const title = renderer.toc.find((t) => t.level === 1)?.text ?? null;
  return { html, toc: renderer.toc, mermaid: renderer.mermaid, title };
}
