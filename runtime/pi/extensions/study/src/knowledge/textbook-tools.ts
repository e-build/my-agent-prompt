import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { projectForPath, requireWorkspace } from "../workspace/workspace-root.ts";
import { updateBinding, type BindingUpdate } from "./chapter-bindings.ts";
import { refreshTextbook } from "./textbook-refresh.ts";

async function resolveProject(cwd: string, projectSlug?: string) {
  const workspace = await requireWorkspace(cwd);
  const slug = projectSlug ?? projectForPath(workspace, cwd)?.slug;
  if (!slug) throw new Error("프로젝트를 정할 수 없습니다. projectSlug를 지정하세요.");
  return { root: workspace.root, slug };
}

export function registerTextbookTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "study_textbook_refresh",
    label: "Study Textbook Refresh",
    description:
      "챕터 README의 자동 관리 영역(<!-- study:knowledge ... -->)만 최신 공통 지식으로 갱신합니다. 사용자가 직접 고친 영역은 덮어쓰지 않고 보류·차이를 보고하며, 영역 밖 본문은 바꾸지 않습니다. bindingJson을 주면 먼저 챕터-지식 연결을 저장합니다.",
    promptSnippet: "Refresh managed knowledge regions in a chapter textbook without overwriting user edits",
    parameters: Type.Object({
      chapterSlug: Type.String(),
      projectSlug: Type.Optional(Type.String()),
      apply: Type.Optional(Type.Boolean({ description: "false면 미리 보기만" })),
      regionIds: Type.Optional(Type.Array(Type.String())),
      insertMissingAfterHeading: Type.Optional(
        Type.String({ description: "아직 없는 영역을 넣을 제목 줄. 예: '## 개념 학습 노트'" }),
      ),
      bindingJson: Type.Optional(
        Type.String({
          description:
            "{expectedRevision,regions:[{regionId,refs:[{id,version,revisionId}]}],contexts?,prerequisites?,uncertain?}",
        }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { root, slug } = await resolveProject(ctx?.cwd ?? process.cwd(), params.projectSlug);
      if (params.bindingJson) {
        let update: BindingUpdate;
        try {
          update = JSON.parse(params.bindingJson);
        } catch {
          throw new Error("bindingJson이 올바른 JSON이 아닙니다.");
        }
        await updateBinding(root, slug, params.chapterSlug, update);
      }
      const result = await refreshTextbook(root, slug, params.chapterSlug, {
        apply: params.apply ?? true,
        regionIds: params.regionIds,
        insertMissingAfterHeading: params.insertMissingAfterHeading,
      });
      const lines = [
        `${result.path}: ${result.applied ? "갱신함" : "변경 없음 또는 미리 보기"}`,
        result.updated.length ? `- 갱신: ${result.updated.join(", ")}` : "",
        result.inserted.length ? `- 삽입: ${result.inserted.join(", ")}` : "",
        ...result.deferred.map((d) => `- 보류(직접 수정됨): ${d.regionId} — 새 설명 적용/수정본 유지/수정 내용을 공통 지식에 반영 중 선택 필요`),
        ...result.blocked.map((b) => `- 차단: ${b.regionId} — ${b.reason}`),
        result.missing.length ? `- 교재에 아직 없는 영역: ${result.missing.join(", ")}` : "",
      ].filter(Boolean);
      return { content: [{ type: "text", text: lines.join("\n") }], details: result };
    },
  });
}
