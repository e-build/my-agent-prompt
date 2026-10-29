/** Study composition root: Pi lifecycle, session ownership and registrations. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withFileMutationQueue, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  registerStudyChapterCommand,
  type StudyChapterTarget,
} from "./src/session/study-command.ts";
import { registerStudyCheckpoint } from "./src/checkpoint/checkpoint-command.ts";
import { hasAssessmentSession } from "./src/session/session-core.ts";
import { createStudySessions } from "./src/session/study-sessions.ts";
import { updateProjectPhase } from "./src/session/phase-state.ts";
import { createBrowserServer } from "./src/bridge/browser-server.ts";
import { createStudyRoutes } from "./src/bridge/study-routes.ts";
import { createGradeHandler } from "./src/assessment/grade-handler.ts";
import { openBrowser } from "./src/bridge/open-browser.ts";
import { registerAssessmentTools } from "./src/assessment/assessment-tools.ts";
import { registerCurriculumTool } from "./src/curriculum/curriculum-tool.ts";
import { registerLabTools } from "./src/lab/lab-tools.ts";
import { registerReviewTools } from "./src/review/review-tools.ts";
import { registerPreflightTool } from "./src/lab/preflight-tool.ts";

export default function (pi: ExtensionAPI) {
  const sessionStore = createStudySessions();
  const { sessions, testSessions, curriculumSessions } = sessionStore;
  let activeChapterTarget: StudyChapterTarget | null = null;
  let assessmentOpenObserved = false;
  let correctiveFollowUpSent = false;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const promptsDir = join(moduleDir, "prompts");

  const routes = createStudyRoutes({
    pi,
    ...sessionStore,
    updateProjectPhase,
    getPort: () => server.port,
  });
  const server = createBrowserServer(routes, (port) =>
    pi.events.emit("study:server-started", { port }),
  );
  const handleGrade = createGradeHandler({ pi, sessions, testSessions, updateProjectPhase });

  // /study-init and /study-review remain prompt resources. /study-chapter is promoted
  // from the old prompt to a registered command with structured state resolution.
  pi.on("resources_discover", async () => ({
    promptPaths: [promptsDir],
  }));

  registerStudyCheckpoint(
    pi,
    Type.Object({
      requestId: Type.String({ description: "/study-checkpoint가 발급한 요청 ID" }),
      recordJson: Type.String({
        description:
          "summary, learningMode, topics[{topic,status,evidence,takeaway}], remaining, nextAction, executionEvidence를 포함한 JSON 문자열",
      }),
    }),
    withFileMutationQueue,
  );

  registerStudyChapterCommand(pi, (target) => {
    activeChapterTarget = target;
    assessmentOpenObserved = false;
    correctiveFollowUpSent = false;
  });

  pi.on("tool_execution_end", (event) => {
    const toolName = event.toolName;
    if (toolName === "study_diagnosis_open" || toolName === "study_test_open")
      assessmentOpenObserved = true;
  });

  pi.on("turn_end", () => {
    if (!activeChapterTarget || correctiveFollowUpSent) return;
    if (activeChapterTarget.phase !== "diagnosis" && activeChapterTarget.phase !== "test") return;
    const chapterSessions =
      activeChapterTarget.phase === "test" ? [...testSessions.values()] : [...sessions.values()];
    if (
      hasAssessmentSession<{ chapterSlug: string; status: string }>(
        chapterSessions,
        activeChapterTarget.chapterSlug,
      )
    ) {
      assessmentOpenObserved = true;
      return;
    }
    if (assessmentOpenObserved) return;
    correctiveFollowUpSent = true;
    const tool =
      activeChapterTarget.phase === "diagnosis" ? "study_diagnosis_open" : "study_test_open";
    pi.sendUserMessage(
      `# STUDY_ASSESSMENT_OPEN_REQUIRED\n\n- chapterSlug: ${activeChapterTarget.chapterSlug}\n- phase: ${activeChapterTarget.phase}\n\n이 단계는 브라우저 assessment가 필수입니다. 문항 JSON을 구성한 뒤 반드시 ${tool}을 호출하세요. markdown 직접 답안 방식으로 진행하지 마세요.`,
      { deliverAs: "followUp" },
    );
  });

  registerLabTools(pi, updateProjectPhase);
  registerReviewTools(pi);
  registerPreflightTool(pi);
  registerCurriculumTool(pi, {
    curriculumSessions,
    curriculumTemplatePath: join(moduleDir, "assets", "curriculum-template.html"),
    startServer: server.start,
    openBrowser,
  });
  registerAssessmentTools(pi, {
    sessions,
    testSessions,
    templatePath: join(moduleDir, "assets", "assessment-template.html"),
    startServer: server.start,
    openBrowser,
    onAssessmentOpened: () => {
      assessmentOpenObserved = true;
    },
    updateProjectPhase,
  });

  pi.on("message_end", (event) => handleGrade(event.message));
  pi.on("session_shutdown", async () => {
    await server.close();
    sessions.clear();
    testSessions.clear();
    curriculumSessions.clear();
  });
}
