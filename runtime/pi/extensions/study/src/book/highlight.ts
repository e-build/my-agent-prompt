/** Minimal token colouring: keywords, strings, comments, numbers. Output is fully escaped. */
type Lang = { keywords: Set<string>; line: string[]; block?: [string, string]; quotes: string; caseInsensitive?: boolean };

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const C_LIKE = "if else for while do switch case default break continue return new try catch finally throw class interface enum extends implements import package public private protected static final abstract void null true false this super";
const LANGS: Record<string, Lang> = {
  java: { keywords: words(`${C_LIKE} int long short byte char boolean float double var synchronized volatile throws instanceof record sealed permits yield`), line: ["//"], block: ["/*", "*/"], quotes: "\"'" },
  kotlin: { keywords: words(`${C_LIKE} fun val var object companion data sealed when is in as out suspend inline override open internal lateinit by init typealias`), line: ["//"], block: ["/*", "*/"], quotes: "\"'" },
  ts: { keywords: words(`${C_LIKE} const let var function async await type of in as from export undefined typeof`), line: ["//"], block: ["/*", "*/"], quotes: "\"'`" },
  sql: { keywords: words("select from where group by having order limit offset join left right inner outer full cross on as and or not null is in exists between like union all distinct insert into values update set delete create table index view with recursive lateral over partition rows range unbounded preceding following current row case when then else end count sum avg min max asc desc primary key foreign references"), line: ["--"], block: ["/*", "*/"], quotes: "'", caseInsensitive: true },
  sh: { keywords: words("if then else elif fi for while do done case esac in function return exit echo export local read cd ls cat grep set unset trap kill wait exec source"), line: ["#"], quotes: "\"'" },
  json: { keywords: words("true false null"), line: [], quotes: "\"" },
};
const ALIASES: Record<string, string> = { js: "ts", javascript: "ts", typescript: "ts", kt: "kotlin", bash: "sh", shell: "sh", zsh: "sh", console: "sh", mysql: "sql", postgresql: "sql", groovy: "java" };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const span = (cls: string, text: string) => `<span class="tok-${cls}">${escapeHtml(text)}</span>`;

export function highlight(code: string, langName: string): string {
  const lang = LANGS[ALIASES[langName.toLowerCase()] ?? langName.toLowerCase()];
  if (!lang) return escapeHtml(code);
  let out = "";
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    const line = lang.line.find((m) => rest.startsWith(m) && (m !== "#" || i === 0 || /\s/.test(code[i - 1])));
    if (line !== undefined) {
      const end = code.indexOf("\n", i);
      const stop = end < 0 ? code.length : end;
      out += span("com", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (lang.block && rest.startsWith(lang.block[0])) {
      const end = code.indexOf(lang.block[1], i + lang.block[0].length);
      const stop = end < 0 ? code.length : end + lang.block[1].length;
      out += span("com", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (lang.quotes.includes(code[i])) {
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
      out += span("str", code.slice(i, Math.min(j + 1, code.length)));
      i = Math.min(j + 1, code.length);
      continue;
    }
    const num = /^\d[\d_]*(\.\d+)?[lLfFdD]?\b/.exec(rest);
    if (num && (i === 0 || !/[\w$]/.test(code[i - 1]))) {
      out += span("num", num[0]);
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      const key = lang.caseInsensitive ? word[0].toLowerCase() : word[0];
      out += lang.keywords.has(key) ? span("kw", word[0]) : escapeHtml(word[0]);
      i += word[0].length;
      continue;
    }
    out += escapeHtml(code[i]);
    i++;
  }
  return out;
}
