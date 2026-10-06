import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { prepareCheckpoint, publishCheckpoint, type CheckpointRequest } from "./checkpoint-core.ts";

type Dependencies = { prepare: typeof prepareCheckpoint; publish: typeof publishCheckpoint };
type MutationQueue = <T>(filePath: string, operation: () => Promise<T>) => Promise<T>;

function prompt(request: CheckpointRequest): string {
  return [
    "# STUDY_CHECKPOINT_REQUEST", "",
    `- requestId: ${request.id}`, `- projectRoot: ${request.projectRoot}`,
    `- chapterSlug: ${request.chapterSlug}`, `- phase: ${request.phase}`, `- checkpointPath: ${request.checkpointPath}`, "",
    "현재 대화(학습자의 메시지 주석 답변 포함), 기존 checkpoint, 챕터 README 및 진도 기록을 읽어 학습 내용을 갈무리하세요.",
    "새 퀴즈나 다음 학습을 시작하지 마세요. 교과서 본문을 checkpoint에 복사하거나 새 concept.md를 만들지 마세요.",
    "실제 답변과 보완을 기록하고, 관찰하지 않은 실행·성공·통과를 만들지 마세요. 상태별 근거를 분리하세요:",
    "- answer_verified: 학습자의 직접 답변으로 확인. 실행 검증과는 다름",
    "- self_reported: 설명 후 이해했다고 자기보고. 별도 적용 답변 확인은 아님",
    "- explained: 보완 설명 제공, 이해 확인 답변 없음",
    "- skipped: 학습자 요청으로 건너뜀. 검증 통과로 처리하지 않음",
    "- unverified: 미응답 또는 아직 확인 안 됨",
    "topics에는 주제·status·학습자 원 응답 또는 정확한 요지(evidence)·보완과 남은 한계(takeaway)를 넣으세요.",
    "summary, learningMode, remaining(남은 항목), nextAction(재개 지점), executionEvidence(실제 실행 근거 또는 실행 없음)를 채우세요.",
    "대화에 없는 답변·날짜·점수·미수행 실습을 추측하지 마세요. 불확실하면 unverified로 기록하세요.",
    "진행 방식과 설명·난도 선호, 미해소 gap과 질문 자체의 모호함, 건너뛴 이유를 보존하세요.",
    "기존 기록에만 있는 내용은 그 기록을 근거로 구분하고, 미확인 항목을 이해 완료로 바꾸지 마세요.",
    "phase·lab·test 완료 상태를 변경하지 마세요. README·state·다른 파일을 별도로 편집하지 마세요.",
    "정리한 구조화 객체를 JSON 문자열 recordJson으로 만들어 반드시 study_checkpoint_publish를 호출하세요.",
    "tool이 checkpoint만 저장·검증·커밋·푸시합니다. Bash로 git add/commit/push를 별도로 수행하지 마세요.",
    "푸시 실패면 저장·커밋·푸시를 구분해 보고하세요. 같은 requestId로 재시도 가능하며 새 snapshot을 중복 생성하지 않습니다.",
    "완료 후 파일 경로·커밋·푸시 결과·다음 재개 지점만 간단히 보고하세요.",
  ].join("\n");
}

export function registerStudyCheckpoint(
  pi: ExtensionAPI,
  parameters: any,
  mutationQueue: MutationQueue,
  dependencies: Dependencies = { prepare: prepareCheckpoint, publish: publishCheckpoint },
): void {
  let pending: { request: CheckpointRequest; sessionId: string } | undefined;
  pi.on("session_start", () => { pending = undefined; });
  pi.registerCommand("study-checkpoint", {
    description: "현재 학습 진도를 갈무리하고 checkpoint만 커밋·푸시",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("현재 agent 응답이 끝난 뒤 다시 실행하세요.", "warning");
        return;
      }
      try {
        if (pending?.request.savedDigest && !pending.request.commit) throw new Error("이전 checkpoint 저장 후 커밋에 실패했습니다. 이전 요청을 먼저 재시도하세요.");
        if (pending?.request.commit) throw new Error("이전 checkpoint 요청을 먼저 재시도하거나 /reload 후 Git 상태를 확인하세요.");
        const request = await dependencies.prepare(ctx.cwd, args);
        pending = { request, sessionId: ctx.sessionManager.getSessionId() };
        pi.sendUserMessage(prompt(request));
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
  pi.registerTool({
    name: "study_checkpoint_publish",
    label: "Study checkpoint",
    description: "/study-checkpoint가 승인한 현재 세션의 requestId에 한해 학습 기록을 검증·저장하고 해당 파일만 커밋·푸시합니다. 기록의 학습 이해도는 agent가 실제 대화 근거로 판단해야 합니다. phase 완료는 변경하지 않습니다.",
    parameters,
    async execute(_toolCallId, params: { requestId: string; recordJson: string }, signal, _onUpdate, ctx) {
      if (!pending || pending.request.id !== params.requestId) throw new Error("/study-checkpoint 명령으로 준비한 requestId가 필요합니다.");
      if (pending.sessionId !== ctx.sessionManager.getSessionId()) throw new Error("checkpoint 요청의 세션이 다릅니다.");
      if (signal?.aborted) throw new Error("checkpoint 작업이 취소됐습니다.");
      const record = JSON.parse(params.recordJson);
      const authorized = pending;
      const result = await mutationQueue(authorized.request.checkpointPath, async () => {
        if (pending !== authorized || signal?.aborted) throw new Error("checkpoint 요청이 변경되거나 취소됐습니다.");
        return dependencies.publish(authorized.request, record);
      });
      if (result.pushed) pending = undefined;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
        ...(result.error ? { isError: true } : {}),
      };
    },
  });
}
