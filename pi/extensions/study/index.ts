/**
 * study extension — 인터랙티브 학습 assessment 브라우저 세션.
 *
 * - `prompts/` 디렉토리를 resources_discover로 노출 → `/study-init`, `/study-review`.
 * - `/study-chapter`는 registered command로 상태 기반 다음 phase를 실행.
 * - `study_diagnosis_open` / `study_test_open`: 공통 assessment HTML 생성 + 브라우저 자동 open.
 * - 브라우저 제출을 현재 Pi 세션으로 전달하고 assistant grade marker를 정확한 session에 연결.
 * - 브라우저는 /result를 polling해 정답/해설과 diagnosis/test별 다음 행동을 렌더링.
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
import {
	canAcknowledge,
	canSubmit,
	DIAGNOSIS_GRADE_END,
	DIAGNOSIS_GRADE_START,
	extractMarkedJson,
	resolvePassed,
	resolveTestNextAction,
	TEST_GRADE_END,
	TEST_GRADE_START,
	validateAssessmentQuestionSet,
	type AssessmentQuestionSet,
	type AssessmentStatus,
	type TestQuestionSet,
} from "./assessment-core.ts";
import { persistDiagnosisRecord, persistTestRecord, validateDiagnosisGrade, validateTestGrade } from "./assessment-grade.ts";
import { findStudyProjectRoot, registerStudyChapterCommand, type StudyChapterTarget } from "./study-command.ts";
import { loadStudyState, saveStudyState, updatePhaseState, type StudyPhase } from "./study-state.ts";
import { manifestFromCurriculum, saveProjectManifest } from "./project-manifest.ts";
import { runStudyPreflight } from "./preflight.ts";
import { loadLabManifest, saveLabManifest, updateLabStep, verifyLabStep } from "./lab-core.ts";
import { projectPath } from "./project-path.ts";

type DiagnosisSession = {
	id: string;
	htmlPath: string;
	projectRoot: string;
	chapterSlug: string;
	chapterTitle: string;
	diagnosisMdPath: string | null;
	questionSet: AssessmentQuestionSet;
	createdAt: number;
	status: AssessmentStatus;
	submission: unknown;
	grade: unknown;
};

type TestSession = {
	id: string;
	htmlPath: string;
	projectRoot: string;
	chapterSlug: string;
	chapterTitle: string;
	testMdPath: string;
	questionSet: TestQuestionSet;
	passScore: number;
	attempt: number;
	createdAt: number;
	status: AssessmentStatus;
	submission: unknown;
	grade: unknown;
};

type CurriculumSession = {
	id: string;
	htmlPath: string;
	projectSlug: string;
	topic: string;
	createdAt: number;
	status: "open" | "reviewed" | "revision_requested";
};

const MAX_PAYLOAD = 5 * 1024 * 1024;

export default function (pi: ExtensionAPI) {
	const sessions = new Map<string, DiagnosisSession>();
	const testSessions = new Map<string, TestSession>();
	const curriculumSessions = new Map<string, CurriculumSession>();
	let server: Server | null = null;
	let serverPort: number | null = null;
	let activeChapterTarget: StudyChapterTarget | null = null;
	let assessmentOpenObserved = false;
	let correctiveFollowUpSent = false;

	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const templatePath = join(moduleDir, "assets", "assessment-template.html");
	const curriculumTemplatePath = join(moduleDir, "assets", "curriculum-template.html");
	const promptsDir = join(moduleDir, "prompts");

	// /study-init and /study-review remain prompt resources. /study-chapter is promoted
	// from the old prompt to a registered command with structured state resolution.
	pi.on("resources_discover", async () => ({
		promptPaths: [promptsDir],
	}));

	registerStudyChapterCommand(pi, (target) => {
		activeChapterTarget = target;
		assessmentOpenObserved = false;
		correctiveFollowUpSent = false;
	});

	pi.on("tool_execution_end", (event) => {
		const toolName = (event as any)?.toolName ?? (event as any)?.name;
		if (toolName === "study_diagnosis_open" || toolName === "study_test_open") assessmentOpenObserved = true;
	});

	pi.on("turn_end", () => {
		if (!activeChapterTarget || correctiveFollowUpSent || assessmentOpenObserved) return;
		if (activeChapterTarget.phase !== "diagnosis" && activeChapterTarget.phase !== "test") return;
		correctiveFollowUpSent = true;
		const tool = activeChapterTarget.phase === "diagnosis" ? "study_diagnosis_open" : "study_test_open";
		pi.sendUserMessage(
			`# STUDY_ASSESSMENT_OPEN_REQUIRED\n\n- chapterSlug: ${activeChapterTarget.chapterSlug}\n- phase: ${activeChapterTarget.phase}\n\n이 단계는 브라우저 assessment가 필수입니다. 문항 JSON을 구성한 뒤 반드시 ${tool}을 호출하세요. markdown 직접 답안 방식으로 진행하지 마세요.`,
			{ deliverAs: "followUp" },
		);
	});

	async function updateProjectPhase(
		projectRoot: string,
		chapterSlug: string,
		phase: StudyPhase,
		status: Parameters<typeof updatePhaseState>[3]["status"],
		patch: Omit<Parameters<typeof updatePhaseState>[3], "status"> = {},
	): Promise<void> {
		try {
			const state = await loadStudyState(projectRoot);
			updatePhaseState(state, chapterSlug, phase, { status, ...patch });
			await saveStudyState(projectRoot, state);
		} catch (error) {
			console.warn("[study] failed to persist phase state:", error);
		}
	}

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
			const inject = `<script>window.ASSESSMENT_ID=${JSON.stringify(session.id)};window.ASSESSMENT_SUBMIT_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/submit`)};window.ASSESSMENT_RESULT_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/result`)};window.ASSESSMENT_ACK_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/ack`)};window.DIAGNOSIS_ID=window.ASSESSMENT_ID;window.DIAGNOSIS_MODE="bridge";</script>`;
			let html = await readFile(session.htmlPath, "utf8");
			if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`);
			else html = inject + html;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() });
			res.end(html);
			return;
		}

		// GET /test/:id → serve HTML with injected bridge endpoints
		const testMatch = url.pathname.match(/^\/test\/([^/]+)$/);
		if (testMatch && method === "GET") {
			const session = testSessions.get(testMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown test session" });
			const base = `http://127.0.0.1:${serverPort ?? 0}`;
			const inject = `<script>window.ASSESSMENT_ID=${JSON.stringify(session.id)};window.ASSESSMENT_SUBMIT_URL=${JSON.stringify(`${base}/api/study-test/${session.id}/submit`)};window.ASSESSMENT_RESULT_URL=${JSON.stringify(`${base}/api/study-test/${session.id}/result`)};window.ASSESSMENT_ACK_URL=${JSON.stringify(`${base}/api/study-test/${session.id}/ack`)};window.TEST_ID=window.ASSESSMENT_ID;window.TEST_MODE="bridge";</script>`;
			let html = await readFile(session.htmlPath, "utf8");
			if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`);
			else html = inject + html;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() });
			res.end(html);
			return;
		}

		// GET /curriculum/:id → serve HTML with injected bridge endpoints
		const curriculumMatch = url.pathname.match(/^\/curriculum\/([^/]+)$/);
		if (curriculumMatch && method === "GET") {
			const session = curriculumSessions.get(curriculumMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown curriculum session" });
			const base = `http://127.0.0.1:${serverPort ?? 0}`;
			const inject = `<script>window.CURRICULUM_ID=${JSON.stringify(session.id)};window.CURRICULUM_ACK_URL=${JSON.stringify(`${base}/api/study-curriculum/${session.id}/ack`)};window.CURRICULUM_REVISION_URL=${JSON.stringify(`${base}/api/study-curriculum/${session.id}/revision`)};window.CURRICULUM_MODE="bridge";</script>`;
			let html = await readFile(session.htmlPath, "utf8");
			if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`);
			else html = inject + html;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() });
			res.end(html);
			return;
		}

		// POST /api/study-curriculum/:id/ack
		const curriculumAckMatch = url.pathname.match(/^\/api\/study-curriculum\/([^/]+)\/ack$/);
		if (curriculumAckMatch && method === "POST") {
			const session = curriculumSessions.get(curriculumAckMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown curriculum session" });
			const body = await readBody(req);
			let payload: unknown = {};
			if (body.trim()) {
				try {
					payload = JSON.parse(body);
				} catch {
					return sendJson(res, 400, { error: "Invalid JSON payload" });
				}
			}
			session.status = "reviewed";
			deliverCurriculumReviewedToAgent(session, payload);
			return sendJson(res, 200, { ok: true, status: "reviewed", message: "Pi 세션으로 커리큘럼 확인 신호를 보냈습니다." });
		}

		// POST /api/study-curriculum/:id/revision
		const curriculumRevisionMatch = url.pathname.match(/^\/api\/study-curriculum\/([^/]+)\/revision$/);
		if (curriculumRevisionMatch && method === "POST") {
			const session = curriculumSessions.get(curriculumRevisionMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown curriculum session" });
			const body = await readBody(req);
			let payload: unknown;
			try {
				payload = body.trim() ? JSON.parse(body) : {};
			} catch {
				return sendJson(res, 400, { error: "Invalid JSON payload" });
			}
			session.status = "revision_requested";
			deliverCurriculumRevisionToAgent(session, payload);
			return sendJson(res, 200, { ok: true, status: "revision_requested", message: "Pi 세션으로 방향 조정 요청을 보냈습니다." });
		}

		// GET /api/study-test/:id/result
		const testResultMatch = url.pathname.match(/^\/api\/study-test\/([^/]+)\/result$/);
		if (testResultMatch && method === "GET") {
			const session = testSessions.get(testResultMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown test session" });
			return sendJson(res, 200, { status: session.status, grade: session.grade });
		}

		// POST /api/study-test/:id/submit
		const testSubmitMatch = url.pathname.match(/^\/api\/study-test\/([^/]+)\/submit$/);
		if (testSubmitMatch && method === "POST") {
			const session = testSessions.get(testSubmitMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown test session" });
			if (!canSubmit(session.status)) return sendJson(res, 409, { ok: false, status: session.status, error: "Test already submitted" });
			const body = await readBody(req);
			let payload: unknown;
			try { payload = JSON.parse(body); } catch { return sendJson(res, 400, { error: "Invalid JSON payload" }); }
			session.submission = payload;
			session.status = "submitted";
			await updateProjectPhase(session.projectRoot, session.chapterSlug, "test", "awaiting_grade", { attempt: session.attempt, sessionId: session.id });
			deliverTestToAgent(session, payload);
			return sendJson(res, 200, { ok: true, status: "submitted", message: "Pi 세션으로 전송했습니다. 채점을 기다리세요." });
		}

		// POST /api/study-test/:id/ack
		const testAckMatch = url.pathname.match(/^\/api\/study-test\/([^/]+)\/ack$/);
		if (testAckMatch && method === "POST") {
			const session = testSessions.get(testAckMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown test session" });
			if (!canAcknowledge(session.status)) return sendJson(res, 409, { ok: false, status: session.status, error: "Test results already acknowledged or not graded" });
			const body = await readBody(req);
			let payload: unknown = {};
			if (body.trim()) {
				try { payload = JSON.parse(body); } catch { return sendJson(res, 400, { error: "Invalid JSON payload" }); }
			}
			session.status = "acknowledged";
			const grade = session.grade as any;
			await updateProjectPhase(
				session.projectRoot,
				session.chapterSlug,
				"test",
				grade?.passed ? "completed" : "relearn_required",
				{ attempt: session.attempt, score: Number(grade?.totalScore ?? 0), maxScore: Number(grade?.maxScore ?? session.questionSet.totalPoints), sessionId: session.id },
			);
			deliverTestReviewToAgent(session, payload);
			return sendJson(res, 200, { ok: true, status: "acknowledged", message: "Pi 세션으로 테스트 결과 확인 신호를 보냈습니다." });
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
			if (!canSubmit(session.status)) return sendJson(res, 409, { ok: false, status: session.status, error: "Diagnosis already submitted" });
			const body = await readBody(req);
			let payload: unknown;
			try {
				payload = JSON.parse(body);
			} catch {
				return sendJson(res, 400, { error: "Invalid JSON payload" });
			}
			session.submission = payload;
			session.status = "submitted";
			await updateProjectPhase(session.projectRoot, session.chapterSlug, "diagnosis", "awaiting_grade", { sessionId: session.id });
			deliverToAgent(session, payload);
			return sendJson(res, 200, { ok: true, status: "submitted", message: "Pi 세션으로 전송했습니다. 채점을 기다리세요." });
		}

		// POST /api/study-diagnosis/:id/ack  (learner reviewed results → hand off to next step)
		const ackMatch = url.pathname.match(/^\/api\/study-diagnosis\/([^/]+)\/ack$/);
		if (ackMatch && method === "POST") {
			const session = sessions.get(ackMatch[1]);
			if (!session) return sendJson(res, 404, { error: "Unknown diagnosis session" });
			if (!canAcknowledge(session.status)) return sendJson(res, 409, { ok: false, status: session.status, error: "Diagnosis results already acknowledged or not graded" });
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
			const grade = session.grade as any;
			await updateProjectPhase(session.projectRoot, session.chapterSlug, "diagnosis", "completed", {
				score: Number(grade?.totalScore ?? 0),
				maxScore: Number(grade?.maxScore ?? session.questionSet.totalPoints),
				sessionId: session.id,
			});
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
			"3. totalScore, maxScore, level(slow|normal|fast), summary, weaknesses, recommendation 산출. 약점은 fact_gap/concept_gap/transfer_gap/execution_gap/ambiguous_question 관점으로 중립적으로 설명하고, 학습자를 복사·불성실로 단정하지 마세요.",
			"4. 파일은 직접 수정하지 마세요. extension이 검증된 grade를 diagnosis.md와 .study/assessments에 자동 기록합니다.",
			"5. 응답 끝에 반드시 아래 마커로 DIAGNOSIS_GRADE_JSON을 포함. diagnosisId 필드는 반드시 채울 것:",
			"",
			DIAGNOSIS_GRADE_START,
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
			DIAGNOSIS_GRADE_END,
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

	function deliverTestToAgent(session: TestSession, payload: unknown) {
		const prompt = buildTestGradingPrompt(session, payload);
		try { pi.sendUserMessage(prompt); return; } catch { /* queue as follow-up */ }
		try { pi.sendUserMessage(prompt, { deliverAs: "followUp" }); } catch (err) { console.warn("[study] failed to deliver test submission:", err); }
	}

	function buildTestGradingPrompt(session: TestSession, payload: unknown): string {
		const answers = JSON.stringify(extractAnswers(payload), null, 2);
		return [
			"# TEST_SUBMISSION_RECEIVED",
			"",
			`- testId: ${session.id}`,
			`- chapterSlug: ${session.chapterSlug}`,
			`- chapterTitle: ${session.chapterTitle}`,
			`- attempt: ${session.attempt}`,
			`- passScore: ${session.passScore}`,
			`- testMdPath: ${session.testMdPath}`,
			"",
			"학습자가 브라우저 테스트에서 답안을 제출했습니다.",
			"1. rubric과 챕터 concept/lab 범위를 기준으로 문항별 score/status/correctAnswer/explanation/advice를 산출하세요.",
			"2. totalScore, maxScore, passScore, passed, summary, weaknesses, recommendation을 산출하세요. 약점은 fact_gap/concept_gap/transfer_gap/execution_gap/ambiguous_question 관점으로 중립적으로 설명하고, 학습자를 복사·불성실로 단정하지 마세요.",
			"3. 파일은 직접 수정하지 마세요. extension이 검증된 attempt를 test.md와 .study/assessments에 자동 누적합니다.",
			"4. 응답 끝에 반드시 아래 TEST_GRADE_JSON을 포함하고 testId/attempt를 그대로 유지하세요.",
			"",
			TEST_GRADE_START,
			"```json",
			JSON.stringify({ kind: "study-test-grade", testId: session.id, attempt: session.attempt, totalScore: 0, maxScore: 100, passScore: session.passScore, passed: false, summary: "", weaknesses: [], recommendation: "", results: [] }, null, 2),
			"```",
			TEST_GRADE_END,
			"",
			"5. 채점과 test.md 기록까지만 하고 멈추세요. 학습자가 브라우저에서 결과를 확인하고 TEST_RESULTS_REVIEWED를 보낼 때까지 다음 단계로 넘어가지 마세요.",
			"",
			"학습자 답안:",
			"```json",
			answers,
			"```",
		].join("\n");
	}

	function deliverTestReviewToAgent(session: TestSession, payload: unknown) {
		const data = (payload && typeof payload === "object" ? payload : {}) as { score?: number; maxScore?: number; passScore?: number; passed?: boolean; weaknesses?: string[]; nextAction?: string; learningPreference?: "ready_to_continue" | "explain_first" | "practice_more" | "feels_guessed" };
		const stored = (session.grade && typeof session.grade === "object" ? session.grade : {}) as { totalScore?: number; maxScore?: number; passScore?: number; passed?: boolean; weaknesses?: string[] };
		const passed = resolvePassed({ totalScore: Number(stored.totalScore ?? data.score ?? 0), passScore: session.passScore, passed: typeof stored.passed === "boolean" ? stored.passed : undefined });
		const nextAction = resolveTestNextAction(passed);
		const weaknesses = Array.isArray(stored.weaknesses) ? stored.weaknesses : Array.isArray(data.weaknesses) ? data.weaknesses : [];
		const prompt = [
			"# TEST_RESULTS_REVIEWED",
			"",
			`- testId: ${session.id}`,
			`- chapterSlug: ${session.chapterSlug}`,
			`- chapterTitle: ${session.chapterTitle}`,
			`- attempt: ${session.attempt}`,
			`- 총점: ${stored.totalScore ?? data.score ?? "?"}/${stored.maxScore ?? data.maxScore ?? "?"}`,
			`- 통과 기준: ${session.passScore}`,
			`- passed: ${passed}`,
			`- nextAction: ${nextAction}`,
			`- learningPreference: ${data.learningPreference ?? "ready_to_continue"}`,
			...(weaknesses.length ? [`- 취약 분야: ${weaknesses.join(", ")}`] : []),
			`- testMdPath: ${session.testMdPath}`,
			"",
			data.learningPreference === "explain_first"
				? "학습자가 먼저 설명을 요청했습니다. 같은 답을 다시 요구하지 말고 오답/취약 개념을 직접 설명한 뒤 다음 행동으로 이어가세요."
				: passed
					? "학습자가 테스트 결과를 확인했습니다. 이 챕터 테스트를 통과했으므로 /study-review 흐름으로 복습을 시작하세요."
					: "학습자가 테스트 결과를 확인했습니다. 전체 개념이나 lab을 반복하지 말고 weaknesses와 오답 문항에 해당하는 가장 작은 개념만 재학습하세요. 재학습 후에는 같은 문제를 재사용하지 말고 attempt를 1 올린 새 변형 TestQuestionSet을 만들어 study_test_open으로 다시 여세요.",
		].join("\n");
		try { pi.sendUserMessage(prompt); return; } catch { /* queue as follow-up */ }
		try { pi.sendUserMessage(prompt, { deliverAs: "followUp" }); } catch (err) { console.warn("[study] failed to deliver test review ack:", err); }
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

	function buildCurriculumReviewedPrompt(session: CurriculumSession, payload: unknown): string {
		const data = (payload && typeof payload === "object" ? payload : {}) as { nextChapter?: string; comment?: string };
		const lines = [
			"# CURRICULUM_REVIEWED",
			"",
			`- curriculumId: ${session.id}`,
			`- projectSlug: ${session.projectSlug}`,
			`- topic: ${session.topic}`,
			`- nextChapter: ${data.nextChapter ?? "ch-01"}`,
		];
		if (data.comment) lines.push(`- comment: ${data.comment}`);
		lines.push(
			"",
			"학습자가 브라우저에서 전체 학습 목차와 방향을 확인했습니다.",
			"다음 단계로 ch-01 사전진단을 안내하세요.",
			"종료 안내는 3줄 구조로 작성하세요: 완료 / 다음 / 실행.",
		);
		return lines.join("\n");
	}

	function buildCurriculumRevisionPrompt(session: CurriculumSession, payload: unknown): string {
		const data = (payload && typeof payload === "object" ? payload : {}) as { comment?: string; selectedChapters?: string[] };
		const lines = [
			"# CURRICULUM_REVISION_REQUESTED",
			"",
			`- curriculumId: ${session.id}`,
			`- projectSlug: ${session.projectSlug}`,
			`- topic: ${session.topic}`,
		];
		if (Array.isArray(data.selectedChapters) && data.selectedChapters.length) lines.push(`- selectedChapters: ${data.selectedChapters.join(", ")}`);
		lines.push(
			"",
			"학습자가 브라우저에서 커리큘럼 방향 조정을 요청했습니다.",
			"요청 내용을 반영해 README/챕터 README/SETUP/AGENTS.md 중 필요한 파일만 수정하세요.",
			"수정 후 다시 study_curriculum_open을 호출해 학습자가 브라우저에서 재확인하게 하세요.",
			"",
			"요청 내용:",
			data.comment?.trim() || "(내용 없음)",
		);
		return lines.join("\n");
	}

	function deliverCurriculumReviewedToAgent(session: CurriculumSession, payload: unknown) {
		const prompt = buildCurriculumReviewedPrompt(session, payload);
		try {
			pi.sendUserMessage(prompt);
			return;
		} catch {
			// agent may be streaming — queue as follow-up
		}
		try {
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		} catch (err) {
			console.warn("[study] failed to deliver curriculum reviewed signal:", err);
		}
	}

	function deliverCurriculumRevisionToAgent(session: CurriculumSession, payload: unknown) {
		const prompt = buildCurriculumRevisionPrompt(session, payload);
		try {
			pi.sendUserMessage(prompt);
			return;
		} catch {
			// agent may be streaming — queue as follow-up
		}
		try {
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		} catch (err) {
			console.warn("[study] failed to deliver curriculum revision request:", err);
		}
	}

	function buildReviewPrompt(session: DiagnosisSession, payload: unknown): string {
		const grade = (payload && typeof payload === "object" ? payload : {}) as {
			score?: number;
			maxScore?: number;
			level?: string;
			learningPreference?: "ready_to_continue" | "explain_first" | "practice_more" | "feels_guessed";
			weaknesses?: string[];
			learnerPinpoints?: Array<{
				id?: string;
				status?: string;
				score?: number;
				maxScore?: number;
				prompt?: string;
				comment?: string;
			}>;
		};
		const weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
		const learnerPinpoints = Array.isArray(grade.learnerPinpoints) ? grade.learnerPinpoints : [];
		const lines = [
			"# DIAGNOSIS_RESULTS_REVIEWED",
			"",
			`- diagnosisId: ${session.id}`,
			`- chapterSlug: ${session.chapterSlug}`,
			`- chapterTitle: ${session.chapterTitle}`,
			`- 총점: ${grade.score ?? "?"}/${grade.maxScore ?? "?"}`,
		];
		if (grade.level) lines.push(`- level: ${grade.level}`);
		if (grade.learningPreference) lines.push(`- learningPreference: ${grade.learningPreference}`);
		if (weaknesses.length) lines.push(`- 취약 분야: ${weaknesses.join(", ")}`);
		if (learnerPinpoints.length) {
			lines.push("- 학습자가 강조한 pinpoint:");
			for (const item of learnerPinpoints) {
				const label = item.id ?? "unknown";
				const score = item.score != null && item.maxScore != null ? ` (${item.score}/${item.maxScore}, ${item.status ?? "checked"})` : "";
				const comment = item.comment ? ` — ${item.comment}` : "";
				lines.push(`  - ${label}${score}: ${item.prompt ?? ""}${comment}`);
			}
		}
		if (session.diagnosisMdPath) lines.push(`- diagnosisMdPath: ${session.diagnosisMdPath}`);
		lines.push(
			"",
			"학습자가 브라우저에서 진단 결과(점수·정답·해설·보완 포인트)를 모두 확인했습니다.",
			grade.learningPreference === "explain_first"
				? "학습자가 먼저 설명을 요청했습니다. 같은 회상 질문을 다시 요구하지 말고 쉬운 설명→예시→중간 상태→원리 순서로 설명하세요. 이해 확인은 이후 변형 문제에서 하세요."
				: "이제 diagnosis.md의 결과와 챕터 README의 학습 목표를 기준으로 개념 학습을 시작하세요.",
			"학습자가 강조한 pinpoint는 학습 범위 변경이나 우선순위 override가 아니라 비중 조절 신호입니다. 전체 개념 흐름은 유지하고, pinpoint와 연결된 개념의 설명 밀도·예시·확인 질문만 조금 늘립니다.",
		);
		return lines.join("\n");
	}

	// ------------------------------------------------------------------
	// tools: study_lab_verify / study_lab_step_update
	// ------------------------------------------------------------------
	pi.registerTool({
		name: "study_lab_verify",
		label: "Study Lab Verify",
		description: "lab/manifest.json의 현재 step에 지정된 파일, 산출물, 검증 명령, 실제 테스트 수를 확인합니다.",
		promptSnippet: "Verify a structured lab step using its manifest evidence",
		parameters: Type.Object({
			chapterSlug: Type.String({ description: "챕터 slug" }),
			stepId: Type.String({ description: "lab manifest step id" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const projectRoot = await findStudyProjectRoot(ctx?.cwd ?? process.cwd());
			const result = await verifyLabStep(projectRoot, params.chapterSlug, params.stepId, async (command, args, cwd) => {
				const executed = await pi.exec(command, args, { cwd });
				return { code: executed.code ?? 1, stdout: executed.stdout ?? "", stderr: executed.stderr ?? "" };
			});
			if (result.passed) {
				const manifest = await loadLabManifest(projectRoot, params.chapterSlug);
				updateLabStep(manifest, params.stepId, manifest.steps.find((step) => step.id === params.stepId)?.status === "skipped_understood" ? "skipped_understood" : "completed");
				await saveLabManifest(projectRoot, manifest);
				const finished = manifest.steps.every((step) => step.status === "completed" || step.status === "skipped_understood");
				await updateProjectPhase(projectRoot, params.chapterSlug, "lab", finished ? "completed" : "in_progress", { evidence: [join(params.chapterSlug, "lab", "manifest.json")] });
			}
			return { content: [{ type: "text", text: result.passed ? `✅ lab step 검증 통과: ${params.stepId}` : `❌ lab step 검증 실패: ${result.messages.join("; ")}` }], details: result };
		},
	});

	pi.registerTool({
		name: "study_lab_step_update",
		label: "Study Lab Step Update",
		description: "lab step을 in_progress 또는 skipped_understood로 갱신합니다. 스킵은 근거가 필수입니다.",
		promptSnippet: "Update a lab step status, including evidence-backed understood skips",
		parameters: Type.Object({
			chapterSlug: Type.String(),
			stepId: Type.String(),
			status: Type.Union([Type.Literal("in_progress"), Type.Literal("skipped_understood"), Type.Literal("blocked")]),
			reason: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const projectRoot = await findStudyProjectRoot(ctx?.cwd ?? process.cwd());
			const manifest = await loadLabManifest(projectRoot, params.chapterSlug);
			updateLabStep(manifest, params.stepId, params.status, params.reason);
			await saveLabManifest(projectRoot, manifest);
			await updateProjectPhase(projectRoot, params.chapterSlug, "lab", params.status === "blocked" ? "blocked" : "in_progress", { reason: params.reason });
			return { content: [{ type: "text", text: `lab step ${params.stepId} → ${params.status}` }], details: { chapterSlug: params.chapterSlug, stepId: params.stepId, status: params.status } };
		},
	});

	// ------------------------------------------------------------------
	// tool: study_preflight
	// ------------------------------------------------------------------
	pi.registerTool({
		name: "study_preflight",
		label: "Study Preflight",
		description: "학습 프로젝트 manifest를 기준으로 Java/Gradle/Docker/전용 서비스 포트를 검사합니다. lab 시작 전에 실행하세요.",
		promptSnippet: "Verify the study project's runtime, build tool, Docker, and dedicated services before lab",
		parameters: Type.Object({
			projectRoot: Type.Optional(Type.String({ description: "학습 프로젝트 루트. 생략하면 현재 cwd에서 찾습니다." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const projectRoot = params.projectRoot ? resolve(cwd, params.projectRoot) : await findStudyProjectRoot(cwd);
			const checks = await runStudyPreflight(projectRoot, async (command, args, commandCwd) => {
				const result = await pi.exec(command, args, { cwd: commandCwd });
				return { code: result.code ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
			});
			const lines = checks.map((check) => `[${check.status.toUpperCase()}] ${check.summary}${check.evidence ? `\n  evidence: ${check.evidence.trim()}` : ""}${check.remediation ? `\n  해결: ${check.remediation}` : ""}`);
			return { content: [{ type: "text", text: lines.join("\n") }], details: { projectRoot, checks, passed: !checks.some((check) => check.status === "fail") } };
		},
	});

	// ------------------------------------------------------------------
	// tool: study_curriculum_open
	// ------------------------------------------------------------------
	pi.registerTool({
		name: "study_curriculum_open",
		label: "Study Curriculum Open",
		description:
			"/study-init 이후 생성한 전체 학습 목차와 방향을 diagnosis UI와 같은 무드의 브라우저 미리보기로 열고, 학습자의 승인 또는 방향 조정 요청을 현재 Pi 세션으로 되돌려 보냅니다.",
		promptSnippet: "Open curriculum preview HTML in browser; bridge approval/revision back to the Pi session",
		promptGuidelines: [
			"/study-init에서 README/챕터 구조를 만든 뒤 study_curriculum_open을 호출해 전체 학습 방향을 브라우저에서 확인하게 하세요. 사용자가 직접 파일을 열게 하지 마세요.",
		],
		parameters: Type.Object({
			projectSlug: Type.String({ description: "학습 프로젝트 디렉토리 slug. 예: study-backend-caching. {projectSlug}/curriculum.html이 생성됩니다." }),
			topic: Type.String({ description: "학습 주제 전체. 예: 백엔드 애플리케이션에서의 캐싱" }),
			curriculumJson: Type.String({ description: "CurriculumPreview JSON 문자열. 템플릿의 {{CURRICULUM_JSON}}에 주입됩니다." }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const projectSlug = params.projectSlug;
			const htmlPath = resolve(cwd, projectSlug, "curriculum.html");

			let template: string;
			try {
				template = await readFile(curriculumTemplatePath, "utf8");
			} catch (err) {
				throw new Error(`커리큘럼 템플릿을 찾을 수 없습니다: ${curriculumTemplatePath} (${err instanceof Error ? err.message : err})`);
			}

			let curriculumPayload: unknown;
			try {
				curriculumPayload = JSON.parse(params.curriculumJson);
			} catch (err) {
				throw new Error(`curriculumJson이 올바른 JSON이 아닙니다: ${err instanceof Error ? err.message : err}`);
			}
			await saveProjectManifest(resolve(cwd, projectSlug), manifestFromCurriculum(curriculumPayload, projectSlug, params.topic));

			const html = template
				.replace(/{{PROJECT_SLUG}}/g, escapeForHtml(projectSlug))
				.replace(/{{TOPIC}}/g, escapeForHtml(params.topic))
				.replace("{{CURRICULUM_JSON}}", params.curriculumJson);

			await mkdir(dirname(htmlPath), { recursive: true });
			await writeFile(htmlPath, html, "utf8");

			const port = await startServer();
			const id = randomUUID().replace(/-/g, "").slice(0, 12);
			const session: CurriculumSession = {
				id,
				htmlPath,
				projectSlug,
				topic: params.topic,
				createdAt: Date.now(),
				status: "open",
			};
			curriculumSessions.set(id, session);

			const browserUrl = `http://127.0.0.1:${port}/curriculum/${id}`;
			openBrowser(browserUrl);

			if (signal?.aborted) return { content: [{ type: "text", text: "취소됨" }] };

			return {
				content: [
					{
						type: "text",
						text: [
							`✅ 학습 설계 미리보기 브라우저 세션을 열었습니다.`,
							`URL: ${browserUrl}`,
							`생성 파일: ${htmlPath}`,
							``,
							`학습자는 브라우저에서 전체 학습 목차와 방향을 확인한 뒤 "이 방향으로 시작" 또는 "방향 조정 요청"을 누르면 됩니다. 결과는 이 Pi 세션으로 자동 전송됩니다.`,
						].join("\n"),
					},
				],
				details: { url: browserUrl, id, htmlPath, port },
			};
		},
	});

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
			const projectRoot = await findStudyProjectRoot(cwd);
			const slug = params.chapterSlug;
			const htmlPath = projectPath(projectRoot, slug, "diagnosis.html");
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
			validateAssessmentQuestionSet(parsedQuestions, "diagnosis");

			const assessmentConfig = JSON.stringify({
				kind: "diagnosis",
				title: "사전진단",
				submissionKind: "study-diagnosis-submission",
				submissionHeading: "DIAGNOSIS_SUBMISSION",
				returnFormat: "DIAGNOSIS_GRADE_JSON",
				markerStart: DIAGNOSIS_GRADE_START,
				markerEnd: DIAGNOSIS_GRADE_END,
				continueLabel: "Pi에서 개념 학습 시작 →",
				continueMessage: "개념 학습은 Pi에서 이어집니다.",
			});
			const html = template
				.replace(/{{CHAPTER_SLUG}}/g, escapeForHtml(slug))
				.replace(/{{CHAPTER_TITLE}}/g, escapeForHtml(params.chapterTitle))
				.replace(/{{PHASE}}/g, escapeForHtml(phase))
				.replace(/{{ASSESSMENT_KIND}}/g, "diagnosis")
				.replace(/{{ASSESSMENT_TITLE}}/g, "사전진단")
				.replace("{{ASSESSMENT_CONFIG_JSON}}", assessmentConfig)
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
				projectRoot,
				chapterSlug: slug,
				chapterTitle: params.chapterTitle,
				diagnosisMdPath,
				questionSet: parsedQuestions as AssessmentQuestionSet,
				createdAt: Date.now(),
				status: "open",
				submission: null,
				grade: null,
			};
			sessions.set(id, session);
			assessmentOpenObserved = true;
			await updateProjectPhase(projectRoot, slug, "diagnosis", "awaiting_submission", { sessionId: id });

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
	// tool: study_test_open
	// ------------------------------------------------------------------
	pi.registerTool({
		name: "study_test_open",
		label: "Study Test Open",
		description: "lab 이후 학습 완료 테스트를 인터랙티브 HTML로 생성하고 브라우저에서 자동으로 엽니다. 제출 답안은 현재 Pi 세션으로 전달되고, 채점 결과와 통과/미달별 다음 행동이 같은 화면에 표시됩니다.",
		promptSnippet: "Open interactive chapter test in browser; bridge submission, grading, and score-based handoff",
		promptGuidelines: ["/study-chapter test 단계에서 TestQuestionSet JSON을 만든 직후 호출하세요. test.md 직접 편집을 학습자에게 요구하지 마세요."],
		parameters: Type.Object({
			chapterSlug: Type.String({ description: "챕터 디렉토리 slug. {chapterSlug}/test.html이 생성됩니다." }),
			chapterTitle: Type.String({ description: "챕터 제목" }),
			phase: Type.Optional(Type.String({ description: "Phase 라벨. 기본값 Phase 4 / test" })),
			questionsJson: Type.String({ description: "passScore와 attempt를 포함한 TestQuestionSet JSON 문자열" }),
			testMdPath: Type.Optional(Type.String({ description: "시도별 문제·답안·채점 결과를 기록할 test.md 경로" })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const projectRoot = await findStudyProjectRoot(cwd);
			const slug = params.chapterSlug;
			const htmlPath = projectPath(projectRoot, slug, "test.html");
			const testMdPath = params.testMdPath ?? join(slug, "test.md");
			let template: string;
			try { template = await readFile(templatePath, "utf8"); }
			catch (err) { throw new Error(`평가 템플릿을 찾을 수 없습니다: ${templatePath} (${err instanceof Error ? err.message : err})`); }
			let parsed: unknown;
			try { parsed = JSON.parse(params.questionsJson); }
			catch (err) { throw new Error(`questionsJson이 올바른 JSON이 아닙니다: ${err instanceof Error ? err.message : err}`); }
			validateAssessmentQuestionSet(parsed, "test");
			const testSet = parsed as TestQuestionSet;
			const phase = params.phase ?? testSet.phase ?? "Phase 4 / test";
			const config = JSON.stringify({
				kind: "test", title: "학습 완료 테스트", submissionKind: "study-test-submission", submissionHeading: "TEST_SUBMISSION",
				returnFormat: "TEST_GRADE_JSON", markerStart: TEST_GRADE_START, markerEnd: TEST_GRADE_END,
				continueLabel: "Pi에서 계속 →", continueMessage: "다음 학습 단계는 Pi에서 이어집니다.",
			});
			const html = template
				.replace(/{{CHAPTER_SLUG}}/g, escapeForHtml(slug))
				.replace(/{{CHAPTER_TITLE}}/g, escapeForHtml(params.chapterTitle))
				.replace(/{{PHASE}}/g, escapeForHtml(phase))
				.replace(/{{ASSESSMENT_KIND}}/g, "test")
				.replace(/{{ASSESSMENT_TITLE}}/g, "학습 완료 테스트")
				.replace("{{ASSESSMENT_CONFIG_JSON}}", config)
				.replace("{{QUESTIONS_JSON}}", params.questionsJson);
			await mkdir(dirname(htmlPath), { recursive: true });
			await writeFile(htmlPath, html, "utf8");
			const port = await startServer();
			const id = randomUUID().replace(/-/g, "").slice(0, 12);
			const session: TestSession = { id, htmlPath, projectRoot, chapterSlug: slug, chapterTitle: params.chapterTitle, testMdPath, questionSet: testSet, passScore: testSet.passScore, attempt: testSet.attempt, createdAt: Date.now(), status: "open", submission: null, grade: null };
			testSessions.set(id, session);
			assessmentOpenObserved = true;
			await updateProjectPhase(projectRoot, slug, "test", "awaiting_submission", { attempt: testSet.attempt, sessionId: id });
			const browserUrl = `http://127.0.0.1:${port}/test/${id}`;
			openBrowser(browserUrl);
			if (signal?.aborted) return { content: [{ type: "text", text: "취소됨" }] };
			return { content: [{ type: "text", text: [`✅ 학습 완료 테스트 브라우저 세션을 열었습니다.`, `URL: ${browserUrl}`, `생성 파일: ${htmlPath}`, `결과 기록: ${testMdPath}`, `시도: ${testSet.attempt}차 · 통과 기준: ${testSet.passScore}/${testSet.totalPoints}`, "", `학습자는 브라우저에서 답안을 제출하고 같은 화면에서 채점 결과를 확인한 뒤, 점수에 따라 복습 또는 부족한 개념 재학습으로 이동합니다.`].join("\n") }], details: { url: browserUrl, id, htmlPath, testMdPath, passScore: testSet.passScore, attempt: testSet.attempt, port } };
		},
	});

	// ------------------------------------------------------------------
	// grade extraction from assistant messages
	// ------------------------------------------------------------------
	pi.on("message_end", async (event) => {
		const message = (event as any)?.message;
		if (!message || message.role !== "assistant") return;
		const text = extractAssistantText(message.content);
		if (!text) return;
		if (text.includes(DIAGNOSIS_GRADE_START)) {
			const grade = extractMarkedJson(text, DIAGNOSIS_GRADE_START, DIAGNOSIS_GRADE_END);
			if (grade) await assignDiagnosisGrade(grade);
		}
		if (text.includes(TEST_GRADE_START)) {
			const grade = extractMarkedJson(text, TEST_GRADE_START, TEST_GRADE_END);
			if (grade) await assignTestGrade(grade);
		}
	});

	function extractAssistantText(content: unknown): string {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.map((block: any) => (block?.type === "text" ? (block.text ?? "") : ""))
			.join("\n");
	}

	async function assignDiagnosisGrade(grade: unknown) {
		if (!grade || typeof grade !== "object") return;
		const id = (grade as any).diagnosisId;
		if (typeof id !== "string") return;
		const session = sessions.get(id);
		if (!session || session.status !== "submitted") return;
		try {
			const validated = validateDiagnosisGrade(grade, session.id, session.questionSet);
			await persistDiagnosisRecord({ projectRoot: session.projectRoot, mdPath: session.diagnosisMdPath ?? join(session.chapterSlug, "diagnosis.md"), questionSet: session.questionSet, submission: session.submission, grade: validated });
			session.grade = validated;
			session.status = "graded";
			await updateProjectPhase(session.projectRoot, session.chapterSlug, "diagnosis", "awaiting_review", { score: validated.totalScore, maxScore: validated.maxScore, sessionId: session.id });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			pi.sendUserMessage(`# STUDY_GRADE_REPAIR_REQUIRED\n\n- kind: diagnosis\n- diagnosisId: ${session.id}\n\n채점 JSON 검증에 실패했습니다: ${message}\n원래 문항 배점과 모든 문항 ID를 기준으로 DIAGNOSIS_GRADE_JSON만 수정해 다시 응답하세요.`, { deliverAs: "followUp" });
		}
	}

	async function assignTestGrade(grade: unknown) {
		if (!grade || typeof grade !== "object") return;
		const id = (grade as any).testId;
		if (typeof id !== "string") return;
		const session = testSessions.get(id);
		if (!session || session.status !== "submitted") return;
		try {
			const validated = validateTestGrade(grade, session.id, session.questionSet);
			await persistTestRecord({ projectRoot: session.projectRoot, mdPath: session.testMdPath, questionSet: session.questionSet, submission: session.submission, grade: validated });
			session.grade = validated;
			session.status = "graded";
			await updateProjectPhase(session.projectRoot, session.chapterSlug, "test", "awaiting_review", { attempt: session.attempt, score: validated.totalScore, maxScore: validated.maxScore, sessionId: session.id });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			pi.sendUserMessage(`# STUDY_GRADE_REPAIR_REQUIRED\n\n- kind: test\n- testId: ${session.id}\n- attempt: ${session.attempt}\n\n채점 JSON 검증에 실패했습니다: ${message}\n원래 문항 배점과 모든 문항 ID를 기준으로 TEST_GRADE_JSON만 수정해 다시 응답하세요.`, { deliverAs: "followUp" });
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
		testSessions.clear();
		curriculumSessions.clear();
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

function escapeForHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
