import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DIAGNOSIS_GRADE_START,
  DIAGNOSIS_GRADE_END,
  TEST_GRADE_START,
  TEST_GRADE_END,
  extractMarkedJson,
} from "./assessment-core.ts";
import {
  validateDiagnosisGrade,
  validateTestGrade,
  persistDiagnosisRecord,
  persistTestRecord,
} from "./assessment-grade.ts";
import type { StudySessions } from "../session/study-sessions.ts";
import type { UpdateProjectPhase } from "../session/phase-state.ts";

export function createGradeHandler({
  pi,
  sessions,
  testSessions,
  updateProjectPhase,
}: Pick<StudySessions, "sessions" | "testSessions"> & {
  pi: Pick<ExtensionAPI, "sendUserMessage">;
  updateProjectPhase: UpdateProjectPhase;
}) {
  async function handleMessage(message: { role: string; content?: unknown }) {
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
  }

  function extractAssistantText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .map((block: unknown) => {
        if (!block || typeof block !== "object") return "";
        const value = block as Record<string, unknown>;
        return value.type === "text" && typeof value.text === "string" ? value.text : "";
      })
      .join("\n");
  }

  async function assignDiagnosisGrade(grade: unknown) {
    if (!grade || typeof grade !== "object") return;
    const id = (grade as Record<string, unknown>).diagnosisId;
    if (typeof id !== "string") return;
    const session = sessions.get(id);
    if (!session || session.status !== "submitted") return;
    try {
      const validated = validateDiagnosisGrade(grade, session.id, session.questionSet);
      await persistDiagnosisRecord({
        projectRoot: session.projectRoot,
        mdPath: session.diagnosisMdPath ?? join(session.chapterSlug, "diagnosis.md"),
        questionSet: session.questionSet,
        submission: session.submission,
        grade: validated,
      });
      session.grade = validated;
      session.status = "graded";
      await updateProjectPhase(
        session.projectRoot,
        session.chapterSlug,
        "diagnosis",
        "awaiting_review",
        { score: validated.totalScore, maxScore: validated.maxScore, sessionId: session.id },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pi.sendUserMessage(
        `# STUDY_GRADE_REPAIR_REQUIRED\n\n- kind: diagnosis\n- diagnosisId: ${session.id}\n\n채점 JSON 검증에 실패했습니다: ${message}\n원래 문항 배점과 모든 문항 ID를 기준으로 DIAGNOSIS_GRADE_JSON만 수정해 다시 응답하세요.`,
        { deliverAs: "followUp" },
      );
    }
  }

  async function assignTestGrade(grade: unknown) {
    if (!grade || typeof grade !== "object") return;
    const id = (grade as Record<string, unknown>).testId;
    if (typeof id !== "string") return;
    const session = testSessions.get(id);
    if (!session || session.status !== "submitted") return;
    try {
      const validated = validateTestGrade(grade, session.id, session.questionSet);
      await persistTestRecord({
        projectRoot: session.projectRoot,
        mdPath: session.testMdPath,
        questionSet: session.questionSet,
        submission: session.submission,
        grade: validated,
      });
      session.grade = validated;
      session.status = "graded";
      await updateProjectPhase(
        session.projectRoot,
        session.chapterSlug,
        "test",
        "awaiting_review",
        {
          attempt: session.attempt,
          score: validated.totalScore,
          maxScore: validated.maxScore,
          sessionId: session.id,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pi.sendUserMessage(
        `# STUDY_GRADE_REPAIR_REQUIRED\n\n- kind: test\n- testId: ${session.id}\n- attempt: ${session.attempt}\n\n채점 JSON 검증에 실패했습니다: ${message}\n원래 문항 배점과 모든 문항 ID를 기준으로 TEST_GRADE_JSON만 수정해 다시 응답하세요.`,
        { deliverAs: "followUp" },
      );
    }
  }

  return handleMessage;
}
