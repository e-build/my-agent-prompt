import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { join } from "node:path";
import { findStudyProjectRoot } from "../project/project-root.ts";
import {
  loadLabManifest,
  recordLabResult,
  saveLabManifest,
  updateLabStep,
  verifyLabStep,
} from "./lab-core.ts";
import type { UpdateProjectPhase } from "../session/phase-state.ts";
import { createCommandRunner } from "./command-runner.ts";

export function registerLabTools(pi: ExtensionAPI, updateProjectPhase: UpdateProjectPhase) {
  const runCommand = createCommandRunner(pi);
  pi.registerTool({
    name: "study_lab_verify",
    label: "Study Lab Verify",
    description:
      "lab/manifest.json의 현재 step에 지정된 파일, 산출물, 검증 명령, 실제 테스트 수를 확인합니다.",
    promptSnippet:
      "Verify a structured lab step, then append the learner's observation and takeaway with measured evidence to lab/results.md",
    promptGuidelines: [
      "study_lab_verify 호출 전 학습자가 직접 보고 설명한 observation과 takeaway를 받으세요. 자동 검증만으로 학습 내용을 추측하지 마세요.",
    ],
    parameters: Type.Object({
      chapterSlug: Type.String({ description: "챕터 slug" }),
      stepId: Type.String({ description: "lab manifest step id" }),
      observation: Type.String({
        description: "실습 중 실제로 관찰한 결과. 명령 출력/테스트/화면 증거 기반.",
      }),
      takeaway: Type.String({ description: "이 step에서 배운 개념 또는 자료구조 선택 이유." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = await findStudyProjectRoot(ctx?.cwd ?? process.cwd());
      const result = await verifyLabStep(
        projectRoot,
        params.chapterSlug,
        params.stepId,
        runCommand,
      );
      if (result.passed) {
        const manifest = await loadLabManifest(projectRoot, params.chapterSlug);
        await recordLabResult(projectRoot, manifest, params.stepId, {
          observation: params.observation,
          takeaway: params.takeaway,
          verification: result,
        });
        updateLabStep(
          manifest,
          params.stepId,
          manifest.steps.find((step) => step.id === params.stepId)?.status === "skipped_understood"
            ? "skipped_understood"
            : "completed",
        );
        await saveLabManifest(projectRoot, manifest);
        const finished = manifest.steps.every(
          (step) => step.status === "completed" || step.status === "skipped_understood",
        );
        await updateProjectPhase(
          projectRoot,
          params.chapterSlug,
          "lab",
          finished ? "completed" : "in_progress",
          { evidence: [join(params.chapterSlug, "lab", "manifest.json")] },
        );
      }
      return {
        content: [
          {
            type: "text",
            text: result.passed
              ? `✅ lab step 검증 및 결과 기록 통과: ${params.stepId} → ${params.chapterSlug}/lab/results.md`
              : `❌ lab step 검증 실패: ${result.messages.join("; ")}`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "study_lab_step_update",
    label: "Study Lab Step Update",
    description:
      "lab step을 in_progress 또는 skipped_understood로 갱신합니다. 스킵은 근거가 필수입니다.",
    promptSnippet: "Update a lab step status, including evidence-backed understood skips",
    parameters: Type.Object({
      chapterSlug: Type.String(),
      stepId: Type.String(),
      status: Type.Union([
        Type.Literal("in_progress"),
        Type.Literal("skipped_understood"),
        Type.Literal("blocked"),
      ]),
      reason: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = await findStudyProjectRoot(ctx?.cwd ?? process.cwd());
      const manifest = await loadLabManifest(projectRoot, params.chapterSlug);
      updateLabStep(manifest, params.stepId, params.status, params.reason);
      await saveLabManifest(projectRoot, manifest);
      await updateProjectPhase(
        projectRoot,
        params.chapterSlug,
        "lab",
        params.status === "blocked" ? "blocked" : "in_progress",
        { reason: params.reason },
      );
      return {
        content: [{ type: "text", text: `lab step ${params.stepId} → ${params.status}` }],
        details: { chapterSlug: params.chapterSlug, stepId: params.stepId, status: params.status },
      };
    },
  });
}
