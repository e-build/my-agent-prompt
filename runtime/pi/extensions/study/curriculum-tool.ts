import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolveCurriculumRoot, writeCurriculumArtifacts } from "./curriculum-core.ts";
import type { CurriculumSession, StudySessions } from "./study-sessions.ts";

type CurriculumToolDependencies = Pick<StudySessions, "curriculumSessions"> & {
  curriculumTemplatePath: string;
  startServer: () => Promise<number>;
  openBrowser: (url: string) => void;
};

export function registerCurriculumTool(
  pi: ExtensionAPI,
  {
    curriculumSessions,
    curriculumTemplatePath,
    startServer,
    openBrowser,
  }: CurriculumToolDependencies,
) {
  pi.registerTool({
    name: "study_curriculum_open",
    label: "Study Curriculum Open",
    description:
      "/study-init 이후 생성한 전체 학습 목차와 방향을 diagnosis UI와 같은 무드의 브라우저 미리보기로 열고, 학습자의 승인 또는 방향 조정 요청을 현재 Pi 세션으로 되돌려 보냅니다.",
    promptSnippet:
      "Open curriculum preview HTML in browser; bridge approval/revision back to the Pi session",
    promptGuidelines: [
      "/study-init에서 README/챕터 구조를 만든 뒤 study_curriculum_open을 호출해 전체 학습 방향을 브라우저에서 확인하게 하세요. 사용자가 직접 파일을 열게 하지 마세요.",
    ],
    parameters: Type.Object({
      projectSlug: Type.String({
        description: "학습 프로젝트 식별자. 예: study-backend-caching. 경로가 아니라 slug입니다.",
      }),
      projectRoot: Type.Optional(
        Type.String({
          description:
            "문서와 산출물을 저장할 프로젝트 루트. 절대 경로 권장. 생략하면 같은 slug의 기존 루트를 찾고, 프로젝트 밖에서는 cwd/projectSlug를 사용합니다.",
        }),
      ),
      topic: Type.String({ description: "학습 주제 전체. 예: 백엔드 애플리케이션에서의 캐싱" }),
      curriculumJson: Type.String({
        description: "CurriculumPreview JSON 문자열. 템플릿의 {{CURRICULUM_JSON}}에 주입됩니다.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd();
      const projectSlug = params.projectSlug;
      const projectRoot = await resolveCurriculumRoot(cwd, params);

      let template: string;
      try {
        template = await readFile(curriculumTemplatePath, "utf8");
      } catch (err) {
        throw new Error(
          `커리큘럼 템플릿을 찾을 수 없습니다: ${curriculumTemplatePath} (${err instanceof Error ? err.message : err})`,
        );
      }

      const { htmlPath } = await withFileMutationQueue(projectRoot, () =>
        writeCurriculumArtifacts(cwd, { ...params, projectRoot }, template),
      );

      const port = await startServer();
      const id = randomUUID().replace(/-/g, "").slice(0, 12);
      const session: CurriculumSession = {
        id,
        htmlPath,
        projectRoot,
        projectSlug,
        topic: params.topic,
        createdAt: Date.now(),
        status: "open",
      };
      curriculumSessions.set(id, session);

      const browserUrl = `http://127.0.0.1:${port}/curriculum/${id}`;
      openBrowser(browserUrl);

      if (signal?.aborted)
        return { content: [{ type: "text", text: "취소됨" }], details: undefined };

      return {
        content: [
          {
            type: "text",
            text: [
              `✅ 학습 설계 미리보기 브라우저 세션을 열었습니다.`,
              `URL: ${browserUrl}`,
              `프로젝트 루트: ${projectRoot}`,
              `생성 파일: ${htmlPath}`,
              ``,
              `학습자는 브라우저에서 전체 학습 목차와 방향을 확인한 뒤 "이 방향으로 시작" 또는 "방향 조정 요청"을 누르면 됩니다. 결과는 이 Pi 세션으로 자동 전송됩니다.`,
            ].join("\n"),
          },
        ],
        details: { url: browserUrl, id, htmlPath, projectRoot, port },
      };
    },
  });
}
