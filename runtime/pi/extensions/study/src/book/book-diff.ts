import { escapeHtml } from "./highlight.ts";
import { CSP } from "./site-build.ts";

export type DiffOp = { kind: "same" | "add" | "del"; text: string };
export type ChangeFile = { path: string; before: string | null; after: string | null };
const CONTEXT = 3;

/** Line LCS diff. Pages are small (hundreds of lines), so O(n·m) is fine. */
export function lineDiff(before: string, after: string): DiffOp[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ kind: "del", text: a[i++] });
    else ops.push({ kind: "add", text: b[j++] });
  }
  while (i < a.length) ops.push({ kind: "del", text: a[i++] });
  while (j < b.length) ops.push({ kind: "add", text: b[j++] });
  return ops;
}

function renderOps(ops: DiffOp[]): string {
  const lines: string[] = [];
  const near = (k: number) => ops.slice(Math.max(0, k - CONTEXT), k + CONTEXT + 1).some((o) => o.kind !== "same");
  let skipped = 0;
  ops.forEach((op, k) => {
    if (op.kind === "same" && !near(k)) {
      skipped++;
      return;
    }
    if (skipped) lines.push(`<div class="gap">… 같은 줄 ${skipped}개 …</div>`);
    skipped = 0;
    const sign = op.kind === "add" ? "+" : op.kind === "del" ? "-" : " ";
    lines.push(`<div class="${op.kind}">${sign} ${escapeHtml(op.text)}</div>`);
  });
  if (skipped) lines.push(`<div class="gap">… 같은 줄 ${skipped}개 …</div>`);
  return lines.join("\n");
}

/** What a reader sees: no front matter, no managed-region markers. */
export function readableText(content: string): string {
  return content
    .replace(/^---\nconcept: [^\n]*\n---\n/, "")
    .split("\n")
    .filter((line) => !/^\s*<!--\s*\/?study:[^>]*-->\s*$/.test(line))
    .join("\n");
}

/** Standalone page (assets one level up) comparing book pages before/after a change. */
export function renderChangePage(change: { changeId: string; reason: string; at: string; files: ChangeFile[] }): string {
  const pages = change.files.filter((f) => f.path.startsWith("book/") && f.path.endsWith(".md"));
  const others = change.files.filter((f) => !pages.includes(f));
  const sections = pages.map((f) => {
    const label = f.before === null ? "새로 씀" : f.after === null ? "지움" : "고침";
    return `<h2>${escapeHtml(f.path)} <small>${label}</small></h2>\n<div class="diff">\n${renderOps(lineDiff(readableText(f.before ?? ""), readableText(f.after ?? "")).filter((o) => !(f.before === null && o.kind === "del" && o.text === "") && !(f.after === null && o.kind === "add" && o.text === "")))}\n</div>`;
  });
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>교과서 변경 ${escapeHtml(change.changeId)}</title>
<link rel="stylesheet" href="../_assets/book.css">
</head>
<body>
<header class="top"><a class="home" href="../index.html">내 교과서</a></header>
<main style="margin:0 auto;padding:24px 20px">
<h1>교과서 변경 ${escapeHtml(change.changeId)}</h1>
<p>${escapeHtml(change.at.slice(0, 16).replace("T", " "))} · ${escapeHtml(change.reason)}</p>
${sections.join("\n") || "<p>바뀐 페이지가 없습니다.</p>"}
${others.length ? `<h2>함께 바뀐 기록 파일</h2>\n<ul>${others.map((f) => `<li>${escapeHtml(f.path)}</li>`).join("")}</ul>` : ""}
</main>
</body>
</html>
`;
}
