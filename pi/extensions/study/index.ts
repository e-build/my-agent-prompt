/**
 * study extension — 인터랙티브 학습 사전진단 브라우저 세션.
 *
 * - `prompts/` 디렉토리를 resources_discover로 노출 → `/study-init`, `/study-chapter`, `/study-review`.
 * - `study_diagnosis_open` tool: HTML 생성 + 로컬 서버 시작 + 브라우저 자동 open.
 * - 브라우저에서 제출하면 POST handler가 현재 Pi 세션으로 답안을 주입(pi.sendUserMessage).
 * - message_end에서 DIAGNOSIS_GRADE_JSON을 추출해 session에 저장.
 * - 브라우저는 /result를 polling해 채점 결과(정답/해설)를 자동 렌더링.
 *
 * Plannotator 패턴을 축소 적용: 로컬 HTTP server + self-contained browser UI + 명시적 제출.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type DiagnosisSession = {
	id: string;
	htmlPath: string;
	chapterSlug: string;
	chapterTitle: string;
	diagnosisMdPath: string | null;
	createdAt: number;
	status: "open" | "submitted" | "graded" | "acknowledged";
	submission: unknown;
	grade: unknown;
};

const GRADE_START = "<!--DIAGNOSIS_GRADE_JSON_START-->";
const GRADE_END = "<!--DIAGNOSIS_GRADE_JSON_END-->";
const MAX_PAYLOAD = 5 * 1024 * 1024;

export default function (pi: ExtensionAPI) {
	const sessions = new Map<string, DiagnosisSession>();
	let server: Server | null = null;
	let serverPort: number | null = null;

	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const templatePath = join(moduleDir, "assets", "diagnosis-template.html");
	const promptsDir = join(moduleDir, "prompts");

	// --- expose prompts/ so Pi registers /study-init, /study-chapter, /study-review ---
	pi.on("resources_discover", async () => ({
		promptPaths: [promptsDir],
	}));

	// ------------------------------------------------------------------
	// local HTTP server (lazy, session-scoped)
	// ------------------------------------------------------------------
	function startServer(): Promise<number> {
		if (server && serverPort) return Promise.resolve(serverPort);
		return new Promise((resolve, reject) => {
			const srv = createServer((req, res) => {
				handleRequest(req, res).catch((err: unknown) => {
					sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
				});
			});
			srv.on("error", reject);
			srv.listen(0, "127.0.0.1", () => {
				const addr = srv.address();
				if (addr && typeof addr === "object") {
					server = srv;
					serverPort = addr.port;
					pi.events.emit("study:server-started", { port: serverPort });
					resolve(serverPort);
				} else {
					reject(new Error("Failed to bind diagnosis server"));
				}
			});
		});
	}

	async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		// CORS preflight — same-origin normally, but allow fetch from file:// fallback.
		if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
			res.writeHead(204, corsHeaders());
			res.end();
			return;
		}

		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const method = (req.method ?? "GET").toUpperCase();

		// GET /diagnosis/:id → serve HTML with injected bridge endpoints
		const diagnosisMatch = url.pathname.match(/^\/diagnosis\/([^/]+)$/);
		if (diagnosisMatch && method === "GET") {
			const session = sessions.get(diagnosisMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown diagnosis session" });
			const base = `http://127.0.0.1:${serverPort ?? 0}`;
			const inject = `<script>window.DIAGNOSIS_ID=${JSON.stringify(session.id)};window.DIAGNOSIS_SUBMIT_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/submit`)};window.DIAGNOSIS_RESULT_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/result`)};window.DIAGNOSIS_ACK_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/ack`)};window.DIAGNOSIS_MODE="bridge";</script>`;
			let html = await readFile(session.htmlPath, "utf8");
			if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`);
			else html = inject + html;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() });
			res.end(html);
			return;
		}

		// GET /api/study-diagnosis/:id/result
		const resultMatch = url.pathname.match(/^\/api\/study-diagnosis\/([^/]+)\/result$/);
		if (resultMatch && method === "GET") {
			const session = sessions.get(resultMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown diagnosis session" });
			return sendJson(res, 200, { status: session.status, grade: session.grade });
		}

		// POST /api/study-diagnosis/:id/submit
		const submitMatch = url.pathname.match(/^\/api\/study-diagnosis\/([^/]+)\/submit$/);
		if (submitMatch && method === "POST") {
			const session = sessions.get(submitMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown diagnosis session" });
			const body = await readBody(req);
			let payload: unknown;
			try {
				payload = JSON.parse(body);
			} catch {
				return sendJson(res, 400, { error: "Invalid JSON payload" });
			}
			session.submission = payload;
			session.status = "submitted";
			deliverToAgent(session, payload);
			return sendJson(res, 200, { ok: true, status: "submitted", message: "Pi 세션으로 전송했습니다. 채점을 기다리세요." });
		}

		// POST /api/study-diagnosis/:id/ack  (learner reviewed results → hand off to next step)
		const ackMatch = url.pathname.match(/^\/api\/study-diagnosis\/([^/]+)\/ack$/);
		if (ackMatch && method === "POST") {
			const session = sessions.get(ackMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown diagnosis session" });
			const body = await readBody(req);
			let payload: unknown = {};
			if (body.trim()) {
				try {
					payload = JSON.parse(body);
				} catch {
					return sendJson(res, 400, { error: "Invalid JSON payload" });
				}
			}
			session.status = "acknowledged";
			deliverReviewToAgent(session, payload);
			return sendJson(res, 200, { ok: true, status: "acknowledged", message: "Pi 세션으로 리뷰 완료 신호를 보냈습니다." });
		}

		sendJson(res, 404, { error: "Not found", path: url.pathname });
	}

	function deliverToAgent(session: DiagnosisSession, payload: unknown) {
		const prompt = buildGradingPrompt(session, payload);
		try {
			pi.sendUserMessage(prompt);
			return;
		} catch {
			// agent may be streaming — queue as follow-up
		}
		try {
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		} catch (err) {
			console.warn("[study] failed to deliver diagnosis submission:", err);
		}
	}

	function buildGradingPrompt(session: DiagnosisSession, payload: unknown): string {
		const answers = JSON.stringify(extractAnswers(payload), null, 2);
		const lines = [
			"# DIAGNOSIS_SUBMISSION_RECEIVED",
			"",
			`- diagnosisId: ${session.id}`,
			`- chapterSlug: ${session.chapterSlug}`,
			`- chapterTitle: ${session.chapterTitle}`,
		];
		if (session.diagnosisMdPath) lines.push(`- diagnosisMdPath: ${session.diagnosisMdPath}`);
		lines.push(
			"",
			"학습자가 브라우저 사전진단에서 답안을 제출했습니다. 아래를 수행하세요.",
			"",
			"1. 객관식/복수선택/주관식/서술형/코드·SQL 문항을 rubric과 비교해 채점.",
			"2. 문항별 score, status(correct|partial|wrong|unanswered), correctAnswer, explanation, advice 산출.",
			"3. totalScore, maxScore, level(slow|normal|fast), summary, weaknesses, recommendation 산출.",
			session.diagnosisMdPath
				? `4. \`${session.diagnosisMdPath}\` 하단에 사전진단 결과(점수/약점/권장 학습 깊이)를 기록.`
				: "4. 사전진단 결과를 기록.",
			"5. 응답 끝에 반드시 아래 마커로 DIAGNOSIS_GRADE_JSON을 포함. diagnosisId 필드는 반드시 채울 것:",
			"",
			GRADE_START,
			"```json",
			JSON.stringify(
				{
					kind: "study-diagnosis-grade",
					diagnosisId: session.id,
					totalScore: 0,
					maxScore: 0,
					level: "normal",
					summary: "",
					weaknesses: [],
					recommendation: "",
					results: [],
				},
				null,
				2,
			),
			"```",
			GRADE_END,
			"",
			"6. 채점과 diagnosis.md 기록까지만 하고 멈추세요. 개념 학습으로 자동으로 넘어가지 마세요 — 학습자가 브라우저에서 결과를 충분히 확인한 뒤 DIAGNOSIS_RESULTS_REVIEWED 신호가 올 때까지 대기합니다.",
			"",
			"학습자 답안:",
			"```json",
			answers,
			"```",
		);
		return lines.join("\n");
	}

	function extractAnswers(payload: unknown): unknown {
		if (payload && typeof payload === "object" && Array.isArray((payload as any).answers)) {
			return (payload as any).answers;
		}
		return payload;
	}

	function deliverReviewToAgent(session: DiagnosisSession, payload: unknown) {
		const prompt = buildReviewPrompt(session, payload);
		try {
			pi.sendUserMessage(prompt);
			return;
		} catch {
			// agent may be streaming — queue as follow-up
		}
		try {
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		} catch (err) {
			console.warn("[study] failed to deliver diagnosis review ack:", err);
		}
	}

	function buildReviewPrompt(session: DiagnosisSession, payload: unknown): string {
		const grade = (payload && typeof payload === "object" ? payload : {}) as {
			score?: number;
			maxScore?: number;
			level?: string;
			weaknesses?: string[];
		};
		const weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
		const lines = [
			"# DIAGNOSIS_RESULTS_REVIEWED",
			"",
			`- diagnosisId: ${session.id}`,
			`- chapterSlug: ${session.chapterSlug}`,
			`- chapterTitle: ${session.chapterTitle}`,
			`- 총점: ${grade.score ?? "?"}/${grade.maxScore ?? "?"}`,
		];
		if (grade.level) lines.push(`- level: ${grade.level}`);
		if (weaknesses.length) lines.push(`- 취약 분야: ${weaknesses.join(", ")}`);
		if (session.diagnosisMdPath) lines.push(`- diagnosisMdPath: ${session.diagnosisMdPath}`);
		lines.push(
			"",
			"학습자가 브라우저에서 진단 결과(점수·정답·해설·보완 포인트)를 모두 확인했습니다.",
			"이제 diagnosis.md의 결과를 바탕으로, 취약 분야를 우선 커버하는 개념 학습을 시작하세요.",
		);
		return lines.join("\n");
	}

	// ------------------------------------------------------------------
	// tool: study_diagnosis_open
	// ------------------------------------------------------------------
	pi.registerTool({
		name: "study_diagnosis_open",
		label: "Study Diagnosis Open",
		description:
			"인터랙티브 사전진단 HTML을 생성하고 로컬 서버를 띄운 뒤 브라우저로 자동 엽니다. 학습자가 브라우저에서 제출하면 현재 Pi 세션으로 답안이 전송되어 자동 채점되고, 채점 결과(정답/해설)가 같은 브라우저에 표시됩니다. /study-chapter diagnosis 단계에서 HTML을 만든 뒤 반드시 이 도구를 호출하세요. 사용자가 직접 파일을 열게 두지 마세요.",
		promptSnippet: "Open interactive diagnosis HTML in browser; bridge submissions and grading to the Pi session",
		promptGuidelines: [
			"study_diagnosis_open을 /study-chapter diagnosis 단계에서 questionsJson을 만든 직후 호출하세요. 사용자에게 '브라우저로 직접 여세요'라고 안내하지 말고 이 도구로 자동으로 여세요.",
		],
		parameters: Type.Object({
			chapterSlug: Type.String({ description: "챕터 디렉토리 slug. 예: ch-01-index-basics. {chapterSlug}/diagnosis.html이 생성됩니다." }),
			chapterTitle: Type.String({ description: "챕터 제목. HTML 헤더/개요에 표시." }),
			phase: Type.Optional(Type.String({ description: "Phase 라벨. 예: Phase 1 / diagnosis. 생략하면 'diagnosis'." })),
			questionsJson: Type.String({ description: "DiagnosisQuestionSet JSON 문자열. 템플릿의 {{QUESTIONS_JSON}}에 주입됩니다." }),
			diagnosisMdPath: Type.Optional(Type.String({ description: "채점 결과를 기록할 diagnosis.md 상대경로. 생략하면 {chapterSlug}/diagnosis.md" })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const slug = params.chapterSlug;
			const htmlPath = resolve(cwd, slug, "diagnosis.html");
			const diagnosisMdPath = params.diagnosisMdPath ?? join(slug, "diagnosis.md");

			let template: string;
			try {
				template = await readFile(templatePath, "utf8");
			} catch (err) {
				throw new Error(`진단 템플릿을 찾을 수 없습니다: ${templatePath} (${err instanceof Error ? err.message : err})`);
			}

			const phase = params.phase ?? "diagnosis";

			// Validate the question payload before writing the artifact.
			let parsedQuestions: unknown;
			try {
				parsedQuestions = JSON.parse(params.questionsJson);
			} catch (err) {
				throw new Error(`questionsJson이 올바른 JSON이 아닙니다: ${err instanceof Error ? err.message : err}`);
			}
			validateQuestionComposition(parsedQuestions);

			const html = template
				.replace(/{{CHAPTER_SLUG}}/g, escapeForHtml(slug))
				.replace(/{{CHAPTER_TITLE}}/g, escapeForHtml(params.chapterTitle))
				.replace(/{{PHASE}}/g, escapeForHtml(phase))
				// QUESTIONS_JSON must be replaced only in the data script tag.
				// Do not use /g: template JS may mention the placeholder as a literal guard.
				.replace("{{QUESTIONS_JSON}}", params.questionsJson);

			await mkdir(dirname(htmlPath), { recursive: true });
			await writeFile(htmlPath, html, "utf8");

			const port = await startServer();
			const id = randomUUID().replace(/-/g, "").slice(0, 12);
			const session: DiagnosisSession = {
				id,
				htmlPath,
				chapterSlug: slug,
				chapterTitle: params.chapterTitle,
				diagnosisMdPath,
				createdAt: Date.now(),
				status: "open",
				submission: null,
				grade: null,
			};
			sessions.set(id, session);

			const browserUrl = `http://127.0.0.1:${port}/diagnosis/${id}`;
			openBrowser(browserUrl);

			if (signal?.aborted) {
				return { content: [{ type: "text", text: "취소됨" }] };
			}

			return {
				content: [
					{
						type: "text",
						text: [
							`✅ 사전진단 브라우저 세션을 열었습니다.`,
							`URL: ${browserUrl}`,
							`생성 파일: ${htmlPath}`,
							`결과 기록: ${diagnosisMdPath}`,
							``,
							`학습자는 브라우저에서 답안을 작성한 뒤 "AI에게 제출"을 누르면 됩니다. 답안은 이 Pi 세션으로 자동 전송되어 채점되고, 채점 결과(정답/해설)가 같은 브라우저에 표시됩니다.`,
						].join("\n"),
					},
				],
				details: { url: browserUrl, id, htmlPath, diagnosisMdPath, port },
			};
		},
	});

	// ------------------------------------------------------------------
	// grade extraction from assistant messages
	// ------------------------------------------------------------------
	pi.on("message_end", async (event) => {
		const message = (event as any)?.message;
		if (!message || message.role !== "assistant") return;
		const text = extractAssistantText(message.content);
		if (!text || !text.includes(GRADE_START)) return;
		const grade = extractGrade(text);
		if (!grade) return;
		assignGrade(grade);
	});

	function extractAssistantText(content: unknown): string {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.map((block: any) => (block?.type === "text" ? (block.text ?? "") : ""))
			.join("\n");
	}

	function extractGrade(text: string): unknown | null {
		const startIdx = text.indexOf(GRADE_START);
		if (startIdx < 0) return null;
		const endIdx = text.indexOf(GRADE_END, startIdx + GRADE_START.length);
		if (endIdx < 0) return null;
		const segment = text.slice(startIdx + GRADE_START.length, endIdx);
		const fence = segment.match(/```(?:json)?\s*([\s\S]*?)```/);
		const candidate = (fence ? fence[1] : segment).trim();
		try {
			return JSON.parse(candidate);
		} catch {
			return null;
		}
	}

	function assignGrade(grade: unknown) {
		if (!grade || typeof grade !== "object") return;
		const id = (grade as any).diagnosisId;
		if (typeof id === "string" && sessions.has(id)) {
			const session = sessions.get(id)!;
			session.grade = grade;
			session.status = "graded";
			return;
		}
		// fallback: most recent submitted session still waiting for a grade
		const candidates = [...sessions.values()]
			.filter((s) => s.status === "submitted" && !s.grade)
			.sort((a, b) => b.createdAt - a.createdAt);
		const target = candidates[0];
		if (target) {
			target.grade = grade;
			target.status = "graded";
		}
	}

	// ------------------------------------------------------------------
	// cleanup
	// ------------------------------------------------------------------
	pi.on("session_shutdown", async () => {
		try {
			server?.close();
		} catch {
			// ignore
		}
		server = null;
		serverPort = null;
		sessions.clear();
	});

	// ------------------------------------------------------------------
	// helpers
	// ------------------------------------------------------------------
	function corsHeaders(): Record<string, string> {
		return {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};
	}

	function sendJson(res: ServerResponse, status: number, body: unknown) {
		res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders() });
		res.end(JSON.stringify(body));
	}

	function readBody(req: IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let data = "";
			req.on("data", (chunk) => {
				data += chunk;
				if (data.length > MAX_PAYLOAD) reject(new Error("payload too large"));
			});
			req.on("end", () => resolve(data));
			req.on("error", reject);
		});
	}

	function openBrowser(url: string) {
		let cmd: string;
		let args: string[];
		if (process.platform === "darwin") {
			cmd = "open";
			args = [url];
		} else if (process.platform === "win32") {
			cmd = "cmd";
			args = ["/c", "start", "", url];
		} else {
			cmd = "xdg-open";
			args = [url];
		}
		try {
			const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
			child.on("error", () => {
				/* best-effort */
			});
			child.unref();
		} catch {
			/* best-effort */
		}
	}
}

function validateQuestionComposition(payload: unknown): void {
	if (!payload || typeof payload !== "object" || !Array.isArray((payload as any).questions)) {
		throw new Error("questionsJson.questions 배열이 필요합니다.");
	}

	const questions = (payload as any).questions as Array<{ type?: string }>;
	const total = questions.length;
	if (total < 10) {
		throw new Error(`사전진단은 최소 10문항이어야 합니다. 현재 ${total}문항입니다.`);
	}

	const objective = questions.filter((q) => q.type === "single-choice" || q.type === "multiple-choice").length;
	const shortAnswer = questions.filter((q) => q.type === "short-answer" || q.type === "code" || q.type === "sql").length;
	const essay = questions.filter((q) => q.type === "essay").length;

	const expectedObjective = Math.round(total * 0.7);
	const expectedShortAnswer = Math.round(total * 0.2);
	const expectedEssay = total - expectedObjective - expectedShortAnswer;
	const tolerance = total === 10 ? 0 : 1;
	const within = (actual: number, expected: number) => Math.abs(actual - expected) <= tolerance;

	if (!within(objective, expectedObjective) || !within(shortAnswer, expectedShortAnswer) || !within(essay, expectedEssay)) {
		throw new Error(
			`사전진단 문항 비중은 객관식 약 70%, 주관식 약 20%, 서술형 약 10%여야 합니다. ` +
				`현재: 총 ${total}문항 / 객관식 ${objective} / 주관식 ${shortAnswer} / 서술형 ${essay}. ` +
				`권장: 객관식 ${expectedObjective} / 주관식 ${expectedShortAnswer} / 서술형 ${expectedEssay}.`,
		);
	}
}

function escapeForHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
