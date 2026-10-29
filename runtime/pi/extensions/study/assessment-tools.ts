import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  validateAssessmentQuestionSet,
  type AssessmentQuestionSet,
  type TestQuestionSet,
} from "./assessment-core.ts";
import { findStudyProjectRoot } from "./project-root.ts";
import { projectPath } from "./project-path.ts";
import { findLabRecordGaps } from "./chapter-evidence.ts";
import { findReusableTestSession } from "./session-core.ts";
import { renderAssessmentPage } from "./assessment-page.ts";
import type { DiagnosisSession, TestSession, StudySessions } from "./study-sessions.ts";
import type { UpdateProjectPhase } from "./phase-state.ts";

type AssessmentToolDependencies = Pick<StudySessions, "sessions" | "testSessions"> & {
  templatePath: string;
  startServer: () => Promise<number>;
  openBrowser: (url: string) => void;
  onAssessmentOpened: () => void;
  updateProjectPhase: UpdateProjectPhase;
};

export function registerAssessmentTools(
  pi: ExtensionAPI,
  {
    sessions,
    testSessions,
    templatePath,
    startServer,
    openBrowser,
    onAssessmentOpened,
    updateProjectPhase,
  }: AssessmentToolDependencies,
) {
  pi.registerTool({
    name: "study_diagnosis_open",
    label: "Study Diagnosis Open",
    description:
      "인터랙티브 사전진단 HTML을 생성하고 로컬 서버를 띄운 뒤 브라우저로 자동 엽니다. 학습자가 브라우저에서 제출하면 현재 Pi 세션으로 답안이 전송되어 자동 채점되고, 채점 결과(정답/해설)가 같은 브라우저에 표시됩니다. /study-chapter diagnosis 단계에서 HTML을 만든 뒤 반드시 이 도구를 호출하세요. 사용자가 직접 파일을 열게 두지 마세요.",
    promptSnippet:
      "Open interactive diagnosis HTML in browser; bridge submissions and grading to the Pi session",
    promptGuidelines: [
      "study_diagnosis_open을 /study-chapter diagnosis 단계에서 questionsJson을 만든 직후 호출하세요. 사용자에게 '브라우저로 직접 여세요'라고 안내하지 말고 이 도구로 자동으로 여세요.",
    ],
    parameters: Type.Object({
      chapterSlug: Type.String({
        description:
          "챕터 디렉토리 slug. 예: ch-01-index-basics. {chapterSlug}/diagnosis.html이 생성됩니다.",
      }),
      chapterTitle: Type.String({ description: "챕터 제목. HTML 헤더/개요에 표시." }),
      phase: Type.Optional(
        Type.String({ description: "Phase 라벨. 예: Phase 1 / diagnosis. 생략하면 'diagnosis'." }),
      ),
      questionsJson: Type.String({
        description: "DiagnosisQuestionSet JSON 문자열. 템플릿의 {{QUESTIONS_JSON}}에 주입됩니다.",
      }),
      diagnosisMdPath: Type.Optional(
        Type.String({
          description:
            "채점 결과를 기록할 diagnosis.md 상대경로. 생략하면 {chapterSlug}/diagnosis.md",
        }),
      ),
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
        throw new Error(
          `진단 템플릿을 찾을 수 없습니다: ${templatePath} (${err instanceof Error ? err.message : err})`,
        );
      }

      const phase = params.phase ?? "diagnosis";

      // Validate the question payload before writing the artifact.
      let parsedQuestions: unknown;
      try {
        parsedQuestions = JSON.parse(params.questionsJson);
      } catch (err) {
        throw new Error(
          `questionsJson이 올바른 JSON이 아닙니다: ${err instanceof Error ? err.message : err}`,
        );
      }
      validateAssessmentQuestionSet(parsedQuestions, "diagnosis");

      const html = renderAssessmentPage(template, {
        kind: "diagnosis",
        chapterSlug: slug,
        chapterTitle: params.chapterTitle,
        phase,
        questionsJson: params.questionsJson,
      });

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
      onAssessmentOpened();
      await updateProjectPhase(projectRoot, slug, "diagnosis", "awaiting_submission", {
        sessionId: id,
      });

      const browserUrl = `http://127.0.0.1:${port}/diagnosis/${id}`;
      openBrowser(browserUrl);

      if (signal?.aborted) {
        return { content: [{ type: "text", text: "취소됨" }], details: undefined };
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
    description:
      "lab 이후 학습 완료 테스트를 인터랙티브 HTML로 생성하고 브라우저에서 자동으로 엽니다. 제출 답안은 현재 Pi 세션으로 전달되고, 채점 결과와 통과/미달별 다음 행동이 같은 화면에 표시됩니다.",
    promptSnippet:
      "Open interactive chapter test in browser; bridge submission, grading, and score-based handoff",
    promptGuidelines: [
      "/study-chapter test 단계에서 TestQuestionSet JSON을 만든 직후 호출하세요. test.md 직접 편집을 학습자에게 요구하지 마세요.",
    ],
    parameters: Type.Object({
      chapterSlug: Type.String({
        description: "챕터 디렉토리 slug. {chapterSlug}/test-{id}.html이 생성됩니다.",
      }),
      chapterTitle: Type.String({ description: "챕터 제목" }),
      phase: Type.Optional(Type.String({ description: "Phase 라벨. 기본값 Phase 4 / test" })),
      questionsJson: Type.String({
        description: "passScore와 attempt를 포함한 TestQuestionSet JSON 문자열",
      }),
      testMdPath: Type.Optional(
        Type.String({ description: "시도별 문제·답안·채점 결과를 기록할 test.md 경로" }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd();
      const projectRoot = await findStudyProjectRoot(cwd);
      const slug = params.chapterSlug;
      const id = randomUUID().replace(/-/g, "").slice(0, 12);
      const htmlPath = projectPath(projectRoot, slug, `test-${id}.html`);
      const testMdPath = params.testMdPath ?? join(slug, "test.md");
      let template: string;
      try {
        template = await readFile(templatePath, "utf8");
      } catch (err) {
        throw new Error(
          `평가 템플릿을 찾을 수 없습니다: ${templatePath} (${err instanceof Error ? err.message : err})`,
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(params.questionsJson);
      } catch (err) {
        throw new Error(
          `questionsJson이 올바른 JSON이 아닙니다: ${err instanceof Error ? err.message : err}`,
        );
      }
      validateAssessmentQuestionSet(parsed, "test");
      const testSet = parsed as TestQuestionSet;
      const labGaps = await findLabRecordGaps(projectRoot, slug);
      if (labGaps) {
        const problems = [
          ...(labGaps.unfinishedSteps.length
            ? [`완료되지 않은 lab step: ${labGaps.unfinishedSteps.join(", ")}`]
            : []),
          ...(labGaps.missingResultSteps.length
            ? [`결과 기록이 없는 lab step: ${labGaps.missingResultSteps.join(", ")}`]
            : []),
          ...(labGaps.missingSkippedEvidence.length
            ? [`근거 기록이 없는 skipped lab step: ${labGaps.missingSkippedEvidence.join(", ")}`]
            : []),
        ];
        if (problems.length) {
          throw new Error(
            `시험을 열 수 없습니다 — lab 기록 미완료. ${problems.join(" / ")}. 누락된 step을 먼저 완료하거나 study_lab_verify로 결과를 기록한 뒤 다시 여세요.`,
          );
        }
      }
      const reusable = findReusableTestSession([...testSessions.values()], slug, testSet.attempt);
      if (reusable) {
        const port = await startServer();
        const browserUrl = `http://127.0.0.1:${port}/test/${reusable.id}`;
        openBrowser(browserUrl);
        onAssessmentOpened();
        if (signal?.aborted)
          return { content: [{ type: "text", text: "취소됨" }], details: undefined };
        return {
          content: [
            {
              type: "text",
              text: [
                `♻️ 이미 열려 있는 테스트 세션을 재사용합니다. 같은 시도(${reusable.attempt}차)의 세션이 열려 있어 새 세션을 만들지 않았습니다.`,
                `URL: ${browserUrl}`,
                `세션: ${reusable.id} (${reusable.status})`,
                `결과 기록: ${reusable.testMdPath}`,
                ``,
                `학습자가 기존 화면에서 답안을 제출하면 됩니다. 새 변형 문제가 필요하면 attempt를 1 올려서 다시 호출하세요.`,
              ].join("\n"),
            },
          ],
          details: {
            url: browserUrl,
            id: reusable.id,
            reused: true,
            htmlPath: reusable.htmlPath,
            testMdPath: reusable.testMdPath,
            passScore: reusable.passScore,
            attempt: reusable.attempt,
          },
        };
      }
      const phase = params.phase ?? testSet.phase ?? "Phase 4 / test";
      const html = renderAssessmentPage(template, {
        kind: "test",
        chapterSlug: slug,
        chapterTitle: params.chapterTitle,
        phase,
        questionsJson: params.questionsJson,
      });
      await mkdir(dirname(htmlPath), { recursive: true });
      await writeFile(htmlPath, html, "utf8");
      const port = await startServer();
      const session: TestSession = {
        id,
        htmlPath,
        projectRoot,
        chapterSlug: slug,
        chapterTitle: params.chapterTitle,
        testMdPath,
        questionSet: testSet,
        passScore: testSet.passScore,
        attempt: testSet.attempt,
        createdAt: Date.now(),
        status: "open",
        submission: null,
        grade: null,
      };
      testSessions.set(id, session);
      onAssessmentOpened();
      await updateProjectPhase(projectRoot, slug, "test", "awaiting_submission", {
        attempt: testSet.attempt,
        sessionId: id,
      });
      const browserUrl = `http://127.0.0.1:${port}/test/${id}`;
      openBrowser(browserUrl);
      if (signal?.aborted)
        return { content: [{ type: "text", text: "취소됨" }], details: undefined };
      return {
        content: [
          {
            type: "text",
            text: [
              `✅ 학습 완료 테스트 브라우저 세션을 열었습니다.`,
              `URL: ${browserUrl}`,
              `생성 파일: ${htmlPath}`,
              `결과 기록: ${testMdPath}`,
              `시도: ${testSet.attempt}차 · 통과 기준: ${testSet.passScore}/${testSet.totalPoints}`,
              "",
              `학습자는 브라우저에서 답안을 제출하고 같은 화면에서 채점 결과를 확인한 뒤, 점수에 따라 복습 또는 부족한 개념 재학습으로 이동합니다.`,
            ].join("\n"),
          },
        ],
        details: {
          url: browserUrl,
          id,
          htmlPath,
          testMdPath,
          passScore: testSet.passScore,
          attempt: testSet.attempt,
          port,
        },
      };
    },
  });
}
