import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface Syntax {
	line: string;
	lineAfterSpace?: boolean;
	blocks: [open: string, close: string][];
	strings: string[];
	docstrings?: boolean;
}

interface Comment {
	line: number;
	text: string;
}

interface FileComments {
	path: string;
	comments: Comment[];
}

const C_STYLE: Syntax = { line: "//", blocks: [["/*", "*/"]], strings: ['"""', '"', "'", "`"] };
const HASH: Syntax = { line: "#", lineAfterSpace: true, blocks: [], strings: ['"', "'"] };
const PYTHON: Syntax = { ...HASH, strings: ['"""', "'''", '"', "'"], docstrings: true };
const SQL: Syntax = { line: "--", blocks: [["/*", "*/"]], strings: ["'", '"', "`"] };

const SYNTAX_BY_EXTENSION = new Map<string, Syntax>([
	...["ts", "tsx", "js", "jsx", "mjs", "cjs", "java", "kt", "kts", "groovy", "gradle", "scala"].map(
		(ext): [string, Syntax] => [ext, C_STYLE],
	),
	...["go", "rs", "swift", "dart", "c", "h", "cc", "cpp", "hpp", "cs"].map((ext): [string, Syntax] => [ext, C_STYLE]),
	...["rb", "sh", "bash", "zsh"].map((ext): [string, Syntax] => [ext, HASH]),
	["py", PYTHON],
	["sql", SQL],
]);

const DIRECTIVES = [
	/^#!/,
	/^\/\/go:|\+build|nolint/,
	/^\/\/\/\s*<(reference|amd-)/,
	/eslint-|@ts-|prettier-ignore|biome-ignore|deno-lint-ignore|(istanbul|c8|v8) ignore/,
	/@(vitest|jest)-environment|@vite-ignore|webpack[A-Z]\w*:|sourceMappingURL/,
	/noinspection|@formatter:|ktlint-|NOSONAR|language=/,
	/clang-format|swiftlint:|shellcheck|rubocop:|frozen_string_literal/,
	/noqa|type:\s*ignore|pylint:|pyright:|mypy:|ruff:|isort:|fmt:\s*(off|on|skip)|-\*-\s*coding/,
	/SPDX-License-Identifier|copyright/i,
];
const GIVEN_WHEN_THEN = /^(\/\/|#)\s*(given|when|then)(\s*[&\/,]\s*(given|when|then))*$/i;
const BLOCK_DECORATION = /^[/*'"]+$/;
const MAX_LISTED = 40;

const rulesPath = join(dirname(fileURLToPath(import.meta.url)), "rules.md");

function stringEnd(source: string, start: number, quote: string): number {
	const multiline = quote.length > 1 || quote === "`";
	for (let i = start + quote.length; i < source.length; i++) {
		if (source[i] === "\\") i++;
		else if (source.startsWith(quote, i)) return i + quote.length;
		else if (source[i] === "\n" && !multiline) return i;
	}
	return source.length;
}

function findComments(source: string, syntax: Syntax): Comment[] {
	const comments: Comment[] = [];
	let line = 1;
	let i = 0;

	const take = (end: number, kind: "code" | "line" | "block") => {
		const lines = source.slice(i, end).split("\n");
		if (kind !== "code") {
			lines.forEach((raw, offset) => {
				const text = raw.trim();
				if (text && !(kind === "block" && BLOCK_DECORATION.test(text))) comments.push({ line: line + offset, text });
			});
		}
		line += lines.length - 1;
		i = end;
	};

	while (i < source.length) {
		const quote = syntax.strings.find((candidate) => source.startsWith(candidate, i));
		if (quote) {
			const startsStatement = source.slice(source.lastIndexOf("\n", i - 1) + 1, i).trim() === "";
			const isDocstring = syntax.docstrings === true && quote.length === 3 && startsStatement;
			take(stringEnd(source, i, quote), isDocstring ? "block" : "code");
			continue;
		}
		const block = syntax.blocks.find(([open]) => source.startsWith(open, i));
		if (block) {
			const close = source.indexOf(block[1], i + block[0].length);
			take(close < 0 ? source.length : close + block[1].length, "block");
			continue;
		}
		// `$#` and `${#items[@]}` in shell are not comments, so `#` only counts after whitespace.
		const afterSpace = i === 0 || /\s/.test(source[i - 1]);
		if (source.startsWith(syntax.line, i) && (!syntax.lineAfterSpace || afterSpace)) {
			const newline = source.indexOf("\n", i);
			take(newline < 0 ? source.length : newline, "line");
			continue;
		}
		// Skipping the escaped character keeps `/\/\//` regex literals from reading as `//`.
		if (source[i] === "\\" && source[i + 1] !== "\n") {
			i += 2;
			continue;
		}
		if (source[i] === "\n") line++;
		i++;
	}
	return comments;
}

function syntaxOf(file: string): Syntax | undefined {
	return SYNTAX_BY_EXTENSION.get(extname(file).slice(1).toLowerCase());
}

function commentsIn(file: string, syntax: Syntax): Comment[] {
	try {
		return findComments(readFileSync(file, "utf8"), syntax);
	} catch {
		return [];
	}
}

function resolveToolPath(path: string, cwd: string): string {
	const cleaned = path.replace(/^@/, "");
	if (cleaned === "~" || cleaned.startsWith("~/")) return join(homedir(), cleaned.slice(1));
	return resolve(cwd, cleaned);
}

function displayPath(file: string, cwd: string): string {
	const fromCwd = relative(cwd, file);
	return fromCwd.startsWith("..") ? file : fromCwd;
}

function buildRequest(files: FileComments[]): string {
	const total = files.reduce((sum, file) => sum + file.comments.length, 0);
	let left = MAX_LISTED;
	const listing: string[] = [];
	for (const file of files) {
		if (left === 0) break;
		const shown = file.comments.slice(0, left);
		left -= shown.length;
		listing.push([file.path, ...shown.map((comment) => `  ${comment.line}: ${comment.text}`)].join("\n"));
	}
	const omitted = total - (MAX_LISTED - left);

	return [
		`이번 작업에서 새로 쓰거나 고친 주석 ${total}개를 찾았다. 시스템 프롬프트의 <comment_rules>에 맞는지 확인하고 정리한다.`,
		[
			"- 규칙에 맞지 않는 주석만 지우거나 줄이고, 맞는 주석은 그대로 둔다.",
			"- 주석만 고친다. 그 밖의 코드는 바꾸지 않는다.",
			"- 직접 쓰지 않은 주석이나 주석이 아닌 줄은 그대로 둔다.",
			"- 고칠 것이 없으면 파일을 수정하지 말고 한 줄로 그렇다고 답한다.",
			"- 고쳤으면 바꾼 내용만 짧게 알린다. 앞서 한 보고는 반복하지 않는다.",
		].join("\n"),
		...listing,
		...(omitted > 0 ? [`그 외 ${omitted}개는 목록에서 생략했다. 위 파일들의 나머지 주석도 같은 기준으로 확인한다.`] : []),
	].join("\n\n");
}

export default function (pi: ExtensionAPI) {
	const baselines = new Map<string, Map<string, number>>();
	let askedThisRun = false;

	function addedComments(cwd: string): FileComments[] {
		const files: FileComments[] = [];
		for (const [file, baseline] of baselines) {
			const syntax = syntaxOf(file);
			if (!syntax) continue;
			const remaining = new Map(baseline);
			const usesGivenWhenThen = [...baseline.keys()].some((text) => GIVEN_WHEN_THEN.test(text));
			const comments = commentsIn(file, syntax).filter((comment) => {
				const unmatched = remaining.get(comment.text) ?? 0;
				if (unmatched > 0) {
					remaining.set(comment.text, unmatched - 1);
					return false;
				}
				if (usesGivenWhenThen && GIVEN_WHEN_THEN.test(comment.text)) return false;
				return !DIRECTIVES.some((directive) => directive.test(comment.text));
			});
			if (comments.length > 0) files.push({ path: displayPath(file, cwd), comments });
		}
		return files;
	}

	pi.on("before_agent_start", (event) => {
		askedThisRun = false;
		event.systemPromptOptions.sections.comment_rules = readFileSync(rulesPath, "utf8").trim();
	});

	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const path = (event.input as { path?: unknown }).path;
		if (typeof path !== "string") return;
		const file = resolveToolPath(path, ctx.cwd);
		const syntax = syntaxOf(file);
		if (!syntax || baselines.has(file)) return;

		const counts = new Map<string, number>();
		for (const comment of commentsIn(file, syntax)) counts.set(comment.text, (counts.get(comment.text) ?? 0) + 1);
		baselines.set(file, counts);
	});

	pi.on("agent_before_settle", (event, ctx) => {
		if (event.outcome !== "completed") return;
		const files = askedThisRun ? [] : addedComments(ctx.cwd);
		baselines.clear();
		if (files.length === 0) return;

		// One request per run: asking again after the cleanup pass could loop forever.
		askedThisRun = true;
		return {
			entries: [
				...event.entries,
				{ type: "custom_message", customType: "comment-cleanup", content: buildRequest(files), display: true },
			],
			continue: true,
		};
	});
}
