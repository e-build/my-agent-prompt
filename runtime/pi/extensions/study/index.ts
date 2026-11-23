/** Study composition root: learning channel, commands, tools and session UI. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withFileMutationQueue, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { defaultChannelFactory } from "./src/channel/channel-context.ts";
import { spawnExec } from "./src/channel/spawn-exec.ts";
import { registerStudyCheckpoint } from "./src/checkpoint/checkpoint-command.ts";
import { registerLabTools } from "./src/lab/lab-tools.ts";
import { registerPreflightTool } from "./src/lab/preflight-tool.ts";
import { registerStudyCommands } from "./src/study-commands.ts";
import { registerStudyTools } from "./src/study-tools.ts";
import { createRoadmapPanel } from "./src/ui/roadmap-panel.ts";
import { createStudyWidget } from "./src/ui/study-widget.ts";

export default function (pi: ExtensionAPI) {
  const promptsDir = join(dirname(fileURLToPath(import.meta.url)), "prompts");
  const widget = createStudyWidget();
  const roadmap = createRoadmapPanel();
  let sessionId = "";

  pi.on("session_start", (_event, ctx) => {
    sessionId = ctx?.sessionManager?.getSessionId?.() ?? "";
    widget.setTarget(null);
    if (ctx) void widget.refresh(ctx);
  });
  pi.on("turn_end", (_event, ctx) => {
    if (ctx) void widget.refresh(ctx);
    void roadmap.refresh();
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx) widget.dispose(ctx);
  });

  registerStudyTools(pi, {
    channelFor: defaultChannelFactory({ exec: spawnExec, sessionId: () => sessionId }),
    queue: withFileMutationQueue,
  });
  registerStudyCommands(pi, {
    promptsDir,
    onTarget: (target) => widget.setTarget({ chapterSlug: target.chapterSlug, phase: target.phase }),
  });
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
    { promptsDir },
  );
  registerLabTools(pi);
  registerPreflightTool(pi);
  pi.registerCommand("study-map", {
    description: "현재 프로젝트 학습 로드맵을 오른쪽 패널로 켜기/끄기",
    handler: async (_args, ctx) => {
      try {
        await roadmap.toggle(ctx);
      } catch (error) {
        ctx.ui.notify(
          `로드맵을 열지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
      }
    },
  });
}
