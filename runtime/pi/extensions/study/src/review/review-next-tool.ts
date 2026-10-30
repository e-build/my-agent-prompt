import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { buildIntegratedReviewPage } from "./integrated-review-page.ts";
import { dueReviews } from "./review-query.ts";

export function registerReviewNextTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "study_review_next",
    label: "Study Review Next",
    description:
      "등록된 study 루트의 통합 복습에서 오늘 할 항목(기한 경과 우선)과 함께 물을 수 있는 묶음 후보를 읽기 전용으로 조회하고 루트 review/README.md 안내 페이지를 갱신합니다. 정답·명제 내용은 반환하지 않습니다. 하루 양 제한은 없습니다.",
    promptSnippet: "List due integrated reviews (overdue first) without answers",
    promptGuidelines: [
      "study_review_next 결과로 질문을 만들 때는 study_question_prepare(purpose=review)로 기준을 먼저 저장하고, 응답은 study_answer_record로 지식별로 판정하세요. 미래 회차는 미리 하지 마세요.",
    ],
    parameters: Type.Object({
      projectId: Type.Optional(Type.String()),
      chapterSlug: Type.Optional(Type.String()),
      includeFuture: Type.Optional(Type.Boolean()),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await requireWorkspace(ctx?.cwd ?? process.cwd(), params.workspaceRoot);
      const due = await dueReviews(workspace.root, params);
      let pageWarning: string | undefined;
      try {
        await buildIntegratedReviewPage(workspace.root);
      } catch (error) {
        pageWarning = error instanceof Error ? error.message : String(error);
      }
      const lines = due.items.length
        ? due.items.map((i) => `- ${i.name} (${i.knowledgeId}) ${i.dueDate} ${i.timing} ${i.round}/${i.totalRounds}`)
        : ["- 오늘 할 복습 없음"];
      return {
        content: [
          {
            type: "text",
            text: [`기준일 ${due.today}`, ...lines, pageWarning ? `⚠️ 안내 페이지 갱신 실패: ${pageWarning}` : ""].filter(Boolean).join("\n"),
          },
        ],
        details: { ...due, pageWarning },
      };
    },
  });
}
