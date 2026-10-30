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
import { createAssessmentOpenGuard } from "./src/session/assessment-open-guard.ts";
import { registerLearningRouteTools } from "./src/session/learning-route-tools.ts";
import { diagnosisPrepareOptions } from "./src/session/dialogue-store.ts";
import { createBrowserServer } from "./src/bridge/browser-server.ts";
import { createStudyRoutes } from "./src/bridge/study-routes.ts";
import { createGradeHandler } from "./src/assessment/grade-handler.ts";
import { openBrowser } from "./src/bridge/open-browser.ts";
import { registerAssessmentTools } from "./src/assessment/assessment-tools.ts";
import { registerCurriculumTool } from "./src/curriculum/curriculum-tool.ts";
import { registerLabTools } from "./src/lab/lab-tools.ts";
import { registerReviewTools } from "./src/review/review-tools.ts";
import { registerPreflightTool } from "./src/lab/preflight-tool.ts";
import { registerWorkspaceCommand } from "./src/workspace/workspace-command.ts";
import { registerKnowledgeTools } from "./src/knowledge/knowledge-tools.ts";
import { registerTextbookTools } from "./src/knowledge/textbook-tools.ts";
import { registerQuestionTools } from "./src/evidence/question-tools.ts";
import { reviewMergeChanges } from "./src/review/review-merge.ts";
import { reviewAnswerOptions } from "./src/review/review-store.ts";
import { registerReviewNextTool } from "./src/review/review-next-tool.ts";
import { createKnowledgeMapStore } from "./src/bridge/knowledge-routes.ts";
import { registerMapCommand } from "./src/knowledge/map-command.ts";
import { createStudyWidget } from "./src/session/study-widget.ts";

export default function (pi: ExtensionAPI) {
  const sessionStore = createStudySessions();
  const { sessions, testSessions, curriculumSessions } = sessionStore;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const promptsDir = join(moduleDir, "prompts");
  const knowledgeMaps = createKnowledgeMapStore();
  const widget = createStudyWidget();

  const routes = createStudyRoutes({
    pi,
    ...sessionStore,
    updateProjectPhase,
    getPort: () => server.port,
    knowledgeMaps,
  });
  const server = createBrowserServer(routes, (port) =>
    pi.events.emit("study:server-started", { port }),
  );
  const handleGrade = createGradeHandler({ pi, sessions, testSessions, updateProjectPhase });

  // Completion exams stay in the browser; diagnosis is conversational.
  const guard = createAssessmentOpenGuard({
    send: (message) => pi.sendUserMessage(message, { deliverAs: "followUp" }),
    hasOpenSession: (target) =>
      hasAssessmentSession<{ chapterSlug: string; status: string }>(
        [...testSessions.values()],
        target.chapterSlug,
      ),
  });

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

  registerStudyChapterCommand(pi, (target: StudyChapterTarget) => {
    guard.setTarget(target);
    widget.setTarget(target);
  });
  pi.on("tool_execution_end", (event) => guard.onToolEnd(event.toolName));
  pi.on("session_start", (_event, ctx) => {
    widget.setTarget(null);
    if (ctx) void widget.refresh(ctx);
  });
  pi.on("turn_end", (_event, ctx) => {
    guard.onTurnEnd();
    if (ctx) void widget.refresh(ctx);
  });

  registerWorkspaceCommand(pi);
  registerKnowledgeTools(pi, (root) => ({ extraChanges: (record) => reviewMergeChanges(root, record) }));
  registerTextbookTools(pi);
  registerQuestionTools(pi, { prepareOptions: diagnosisPrepareOptions, answerOptions: reviewAnswerOptions });
  registerLearningRouteTools(pi);
  registerLabTools(pi, updateProjectPhase);
  registerReviewTools(pi);
  registerReviewNextTool(pi);
  registerMapCommand(pi, { store: knowledgeMaps, startServer: server.start, openBrowser });
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
    onAssessmentOpened: () => guard.markOpened(),
    updateProjectPhase,
  });

  pi.on("message_end", (event) => handleGrade(event.message));
  pi.on("session_shutdown", async (_event, ctx) => {
    guard.clear();
    if (ctx) widget.dispose(ctx);
    knowledgeMaps.clear();
    await server.close();
    sessions.clear();
    testSessions.clear();
    curriculumSessions.clear();
  });
}
