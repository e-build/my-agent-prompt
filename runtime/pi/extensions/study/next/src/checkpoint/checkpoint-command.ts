import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { findWorkspaceRoot } from "../review/workspace.ts";
import { loadPrompt } from "../prompts/prompt-loader.ts";
import { findStudyProjectRoot } from "../state/project-root.ts";
import { chapterArgumentCompletions, readChapterCatalog } from "../ui/chapter-catalog.ts";
import { prepareCheckpoint, publishCheckpoint, type CheckpointRequest } from "./checkpoint-core.ts";

type Dependencies = { prepare: typeof prepareCheckpoint; publish: typeof publishCheckpoint };
type MutationQueue = <T>(filePath: string, operation: () => Promise<T>) => Promise<T>;

/** Code-owned header with the request id, then the (possibly user-overridden) checkpoint prompt. */
async function prompt(request: CheckpointRequest, defaults: string): Promise<string> {
  const workspace = await findWorkspaceRoot(request.projectRoot).catch(() => null);
  const body = await loadPrompt("checkpoint", {
    defaults,
    root: workspace?.root,
    project: request.projectRoot,
  });
  return [
    "# STUDY_CHECKPOINT_REQUEST",
    "",
    `- requestId: ${request.id}`,
    `- projectRoot: ${request.projectRoot}`,
    `- chapterSlug: ${request.chapterSlug}`,
    `- phase: ${request.phase}`,
    `- checkpointPath: ${request.checkpointPath}`,
    ...body.warnings.map((w) => `\n⚠️ ${w}`),
    "",
    body.text.trim(),
  ].join("\n");
}

export function registerStudyCheckpoint(
  pi: ExtensionAPI,
  parameters: any,
  mutationQueue: MutationQueue,
  options: { promptsDir: string } & Partial<Dependencies>,
): void {
  const prepare = options.prepare ?? prepareCheckpoint;
  const publish = options.publish ?? publishCheckpoint;
  let pending: { request: CheckpointRequest; sessionId: string } | undefined;
  let completionCwd = process.cwd();
  pi.on("session_start", (_event, ctx) => {
    pending = undefined;
    if (ctx?.cwd) completionCwd = ctx.cwd;
  });
  pi.registerCommand("study-checkpoint", {
    description: "현재 학습 진도를 갈무리하고 checkpoint만 커밋·푸시 (챕터 생략 시 현재 챕터)",
    getArgumentCompletions: async (prefix: string) => {
      if (/\s/.test(prefix)) return null;
      try {
        const catalog = await readChapterCatalog(await findStudyProjectRoot(completionCwd));
        return chapterArgumentCompletions(catalog, prefix)?.filter((item) => /^\d/.test(item.value)) ?? null;
      } catch {
        return null;
      }
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      completionCwd = ctx.cwd;
      if (!ctx.isIdle()) {
        ctx.ui.notify("현재 agent 응답이 끝난 뒤 다시 실행하세요.", "warning");
        return;
      }
      try {
        if (pending?.request.savedDigest && !pending.request.commit)
          throw new Error("이전 checkpoint 저장 후 커밋에 실패했습니다. 이전 요청을 먼저 재시도하세요.");
        if (pending?.request.commit)
          throw new Error("이전 checkpoint 요청을 먼저 재시도하거나 /reload 후 Git 상태를 확인하세요.");
        const request = await prepare(ctx.cwd, args);
        pending = { request, sessionId: ctx.sessionManager.getSessionId() };
        pi.sendUserMessage(await prompt(request, options.promptsDir));
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
  pi.registerTool({
    name: "study_checkpoint_publish",
    label: "Study checkpoint",
    description:
      "/study-checkpoint가 승인한 현재 세션의 requestId에 한해 학습 기록을 검증·저장하고 해당 파일만 커밋·푸시합니다. 기록의 학습 이해도는 agent가 실제 대화 근거로 판단해야 합니다. phase 완료는 변경하지 않습니다.",
    promptSnippet: "Save and push the checkpoint prepared by /study-checkpoint",
    parameters,
    async execute(_toolCallId, params: { requestId: string; recordJson: string }, signal, _onUpdate, ctx) {
      if (!pending || pending.request.id !== params.requestId)
        throw new Error("/study-checkpoint 명령으로 준비한 requestId가 필요합니다.");
      if (pending.sessionId !== ctx.sessionManager.getSessionId())
        throw new Error("checkpoint 요청의 세션이 다릅니다.");
      if (signal?.aborted) throw new Error("checkpoint 작업이 취소됐습니다.");
      const record = JSON.parse(params.recordJson);
      const authorized = pending;
      const result = await mutationQueue(authorized.request.checkpointPath, async () => {
        if (pending !== authorized || signal?.aborted)
          throw new Error("checkpoint 요청이 변경되거나 취소됐습니다.");
        return publish(authorized.request, record);
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
