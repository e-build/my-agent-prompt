import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { canSubmit, canAcknowledge } from "../assessment/assessment-core.ts";
import { markAssessmentAcknowledged } from "../assessment/assessment-grade.ts";
import { completeAcknowledgedTest } from "../assessment/test-completion.ts";
import { buildDiagnosisReviewPrompt } from "../session/diagnosis-review-prompt.ts";
import {
  buildGradingPrompt,
  buildTestGradingPrompt,
  buildTestReviewPrompt,
  buildCurriculumReviewedPrompt,
  buildCurriculumRevisionPrompt,
} from "./study-prompts.ts";
import { deliverToAgent } from "./agent-delivery.ts";
import { corsHeaders, sendJson, readBody } from "./browser-server.ts";
import type { StudySessions } from "../session/study-sessions.ts";
import type { UpdateProjectPhase } from "../session/phase-state.ts";
import { handleKnowledgeRoute, type KnowledgeMapStore } from "./knowledge-routes.ts";
import type { AutoRegistration } from "../workspace/auto-registration.ts";

type RouteDependencies = StudySessions & {
  pi: Pick<ExtensionAPI, "sendUserMessage">;
  updateProjectPhase: UpdateProjectPhase;
  getPort: () => number | null;
  knowledgeMaps?: KnowledgeMapStore;
  /** Approving a curriculum registers the project in its study root. */
  registerApprovedProject?: (projectRoot: string) => Promise<AutoRegistration>;
};

export function createStudyRoutes({
  pi,
  sessions,
  testSessions,
  curriculumSessions,
  updateProjectPhase,
  getPort,
  knowledgeMaps,
  registerApprovedProject,
}: RouteDependencies) {
  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS preflight — same-origin normally, but allow fetch from file:// fallback.
    if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = (req.method ?? "GET").toUpperCase();
    if (knowledgeMaps && handleKnowledgeRoute(knowledgeMaps, req, res)) return;

    // GET /diagnosis/:id → serve HTML with injected bridge endpoints
    const diagnosisMatch = url.pathname.match(/^\/diagnosis\/([^/]+)$/);
    if (diagnosisMatch && method === "GET") {
      const session = sessions.get(diagnosisMatch[1]);
      if (!session) return sendJson(res, 404, { error: "Unknown diagnosis session" });
      const base = `http://127.0.0.1:${getPort() ?? 0}`;
      const inject = `<script>window.ASSESSMENT_ID=${JSON.stringify(session.id)};window.ASSESSMENT_SUBMIT_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/submit`)};window.ASSESSMENT_RESULT_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/result`)};window.ASSESSMENT_ACK_URL=${JSON.stringify(`${base}/api/study-diagnosis/${session.id}/ack`)};window.DIAGNOSIS_ID=window.ASSESSMENT_ID;window.DIAGNOSIS_MODE="bridge";</script>`;
      await serveHtml(res, session.htmlPath, inject);
      return;
    }

    // GET /test/:id → serve HTML with injected bridge endpoints
    const testMatch = url.pathname.match(/^\/test\/([^/]+)$/);
    if (testMatch && method === "GET") {
      const session = testSessions.get(testMatch[1]);
      if (!session) return sendJson(res, 404, { error: "Unknown test session" });
      const base = `http://127.0.0.1:${getPort() ?? 0}`;
      const inject = `<script>window.ASSESSMENT_ID=${JSON.stringify(session.id)};window.ASSESSMENT_SUBMIT_URL=${JSON.stringify(`${base}/api/study-test/${session.id}/submit`)};window.ASSESSMENT_RESULT_URL=${JSON.stringify(`${base}/api/study-test/${session.id}/result`)};window.ASSESSMENT_ACK_URL=${JSON.stringify(`${base}/api/study-test/${session.id}/ack`)};window.TEST_ID=window.ASSESSMENT_ID;window.TEST_MODE="bridge";</script>`;
      await serveHtml(res, session.htmlPath, inject);
      return;
    }

    // GET /curriculum/:id → serve HTML with injected bridge endpoints
    const curriculumMatch = url.pathname.match(/^\/curriculum\/([^/]+)$/);
    if (curriculumMatch && method === "GET") {
      const session = curriculumSessions.get(curriculumMatch[1]);
      if (!session) return sendJson(res, 404, { error: "Unknown curriculum session" });
      const base = `http://127.0.0.1:${getPort() ?? 0}`;
      const inject = `<script>window.CURRICULUM_ID=${JSON.stringify(session.id)};window.CURRICULUM_ACK_URL=${JSON.stringify(`${base}/api/study-curriculum/${session.id}/ack`)};window.CURRICULUM_REVISION_URL=${JSON.stringify(`${base}/api/study-curriculum/${session.id}/revision`)};window.CURRICULUM_MODE="bridge";</script>`;
      await serveHtml(res, session.htmlPath, inject);
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
      let registration: AutoRegistration | { error: string } | undefined;
      if (registerApprovedProject) {
        try {
          registration = await registerApprovedProject(session.projectRoot);
        } catch (error) {
          registration = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      deliverToAgent(
        pi,
        buildCurriculumReviewedPrompt(session, payload, registration),
        "curriculum reviewed signal",
      );
      return sendJson(res, 200, {
        ok: true,
        status: "reviewed",
        message: "Pi 세션으로 커리큘럼 확인 신호를 보냈습니다.",
      });
    }

    // POST /api/study-curriculum/:id/revision
    const curriculumRevisionMatch = url.pathname.match(
      /^\/api\/study-curriculum\/([^/]+)\/revision$/,
    );
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
      deliverToAgent(
        pi,
        buildCurriculumRevisionPrompt(session, payload),
        "curriculum revision request",
      );
      return sendJson(res, 200, {
        ok: true,
        status: "revision_requested",
        message: "Pi 세션으로 방향 조정 요청을 보냈습니다.",
      });
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
      if (!canSubmit(session.status))
        return sendJson(res, 409, {
          ok: false,
          status: session.status,
          error: "Test already submitted",
        });
      const body = await readBody(req);
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON payload" });
      }
      session.submission = payload;
      session.status = "submitted";
      await updateProjectPhase(session.projectRoot, session.chapterSlug, "test", "awaiting_grade", {
        attempt: session.attempt,
        sessionId: session.id,
      });
      deliverToAgent(pi, buildTestGradingPrompt(session, payload), "test submission");
      return sendJson(res, 200, {
        ok: true,
        status: "submitted",
        message: "Pi 세션으로 전송했습니다. 채점을 기다리세요.",
      });
    }

    // POST /api/study-test/:id/ack
    const testAckMatch = url.pathname.match(/^\/api\/study-test\/([^/]+)\/ack$/);
    if (testAckMatch && method === "POST") {
      const session = testSessions.get(testAckMatch[1]);
      if (!session) return sendJson(res, 404, { error: "Unknown test session" });
      if (!canAcknowledge(session.status))
        return sendJson(res, 409, {
          ok: false,
          status: session.status,
          error: "Test results already acknowledged or not graded",
        });
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
      await markAssessmentAcknowledged(session.projectRoot, session.id);
      const grade = session.grade;
      const passed = Boolean(grade?.passed);
      const completion = await completeAcknowledgedTest(
        session.projectRoot,
        session.chapterSlug,
        {
          id: session.id,
          attempt: session.attempt,
          score: Number(grade?.totalScore ?? 0),
          maxScore: Number(grade?.maxScore ?? session.questionSet.totalPoints),
        },
        passed,
      );
      if (completion.review)
        pi.sendUserMessage(
          `# STUDY_REVIEW_READY\n\n통합 복습 등록: 새 일정 ${completion.review.created.length}개, 기존 일정 유지 ${completion.review.existing.length}개 (기준일 ${completion.review.completedOn}, 첫 복습 다음 날).${completion.pagePath ? `\n안내 페이지: ${completion.pagePath}` : ""}\n오늘 모든 복습을 몰아서 하지 말고 예정일에 /study-review로 진행하세요.`,
          { deliverAs: "followUp" },
        );
      else if (completion.pagePath)
        pi.sendUserMessage(
          `# STUDY_REVIEW_READY\n\n복습 시작 페이지: ${completion.pagePath}\n일정이 미설정이면 간격·기준일·시간대를 먼저 확인하세요.`,
          { deliverAs: "followUp" },
        );
      if (completion.reviewWarning)
        pi.sendUserMessage(
          `# STUDY_REVIEW_LINK_PENDING\n\ntest는 completed입니다. 통합 복습 연결만 대기 중입니다: ${completion.reviewWarning}`,
          { deliverAs: "followUp" },
        );
      if (completion.evidenceError)
        pi.sendUserMessage(
          `# STUDY_EVIDENCE_REQUIRED\n\n테스트 점수는 통과했지만 학습 근거가 누락되어 test 상태는 blocked입니다. ${completion.evidenceError}`,
          { deliverAs: "followUp" },
        );
      if (completion.navigationWarning)
        pi.sendUserMessage(
          `# STUDY_REVIEW_PAGE_WARNING\n\ntest는 completed입니다. 안내 페이지 갱신만 실패했습니다: ${completion.navigationWarning}`,
          { deliverAs: "followUp" },
        );
      deliverToAgent(pi, buildTestReviewPrompt(session, payload), "test review ack");
      return sendJson(res, 200, {
        ok: true,
        status: "acknowledged",
        message: "Pi 세션으로 테스트 결과 확인 신호를 보냈습니다.",
      });
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
      if (!canSubmit(session.status))
        return sendJson(res, 409, {
          ok: false,
          status: session.status,
          error: "Diagnosis already submitted",
        });
      const body = await readBody(req);
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON payload" });
      }
      session.submission = payload;
      session.status = "submitted";
      await updateProjectPhase(
        session.projectRoot,
        session.chapterSlug,
        "diagnosis",
        "awaiting_grade",
        { sessionId: session.id },
      );
      deliverToAgent(pi, buildGradingPrompt(session, payload), "diagnosis submission");
      return sendJson(res, 200, {
        ok: true,
        status: "submitted",
        message: "Pi 세션으로 전송했습니다. 채점을 기다리세요.",
      });
    }

    // POST /api/study-diagnosis/:id/ack  (learner reviewed results → hand off to next step)
    const ackMatch = url.pathname.match(/^\/api\/study-diagnosis\/([^/]+)\/ack$/);
    if (ackMatch && method === "POST") {
      const session = sessions.get(ackMatch[1]);
      if (!session) return sendJson(res, 404, { error: "Unknown diagnosis session" });
      if (!canAcknowledge(session.status))
        return sendJson(res, 409, {
          ok: false,
          status: session.status,
          error: "Diagnosis results already acknowledged or not graded",
        });
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
      const grade = session.grade;
      await updateProjectPhase(session.projectRoot, session.chapterSlug, "diagnosis", "completed", {
        score: Number(grade?.totalScore ?? 0),
        maxScore: Number(grade?.maxScore ?? session.questionSet.totalPoints),
        sessionId: session.id,
      });
      deliverToAgent(
        pi,
        await buildDiagnosisReviewPrompt(session, payload),
        "diagnosis review ack",
      );
      return sendJson(res, 200, {
        ok: true,
        status: "acknowledged",
        message: "Pi 세션으로 리뷰 완료 신호를 보냈습니다.",
      });
    }

    sendJson(res, 404, { error: "Not found", path: url.pathname });
  }

  return handleRequest;
}

async function serveHtml(res: ServerResponse, path: string, inject: string): Promise<void> {
  let html = await readFile(path, "utf8");
  html = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => `${head}\n${inject}`)
    : inject + html;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() });
  res.end(html);
}
