import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ask, recordAnswers, send } from "./cards/card-actions.ts";
import { createChatChannel } from "./channel/chat-channel.ts";
import {
  resolveStudyContext,
  type ChannelFactory,
  type StudyContext,
} from "./channel/channel-context.ts";
import {
  approveProject,
  completePhase,
  finishPlacement,
  finishReview,
  finishTest,
  reviewNext,
  todayIn,
} from "./flow/flow-actions.ts";
import { findWorkspaceRoot } from "./review/workspace.ts";
import { PHASES, loadStudyState, nextPhase, type StudyPhase } from "./state/study-state.ts";

type MutationQueue = <T>(filePath: string, operation: () => Promise<T>) => Promise<T>;
const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

function parse<T>(json: string, field: string): T {
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`${field}가 올바른 JSON이 아닙니다.`);
  }
}

export function registerStudyTools(
  pi: ExtensionAPI,
  deps: { channelFor: ChannelFactory; queue: MutationQueue },
) {
  const context = (cwd: string | undefined, projectRoot?: string) =>
    resolveStudyContext(cwd ?? process.cwd(), projectRoot);
  const channels = (c: StudyContext) => ({ primary: deps.channelFor(c.channelId, c), fallback: createChatChannel() });
  const cardsFile = (c: StudyContext, scope: string) => `${c.projectRoot}/.study/cards/${scope}.jsonl`;
  const projectRootParam = Type.Optional(
    Type.String({ description: "학습 프로젝트 루트(절대 경로). 생략하면 현재 cwd에서 찾습니다." }),
  );

  pi.registerTool({
    name: "study_ask",
    label: "Study Ask",
    description:
      "비공개 채점 기준을 먼저 저장한 뒤 질문 카드를 설정된 학습 채널(chat 또는 plannotator)로 보냅니다. 배치 진단·개념 확인·시험·복습 질문에 씁니다.",
    promptSnippet: "Store hidden grading criteria first, then send a question card through the learning channel",
    promptGuidelines: [
      "study_ask는 채점 기준을 먼저 저장한 뒤 질문을 보냅니다. 채점 기준을 학습자의 답 전에 말하지 마세요.",
      "학습 질문·교재·결과는 study_ask/study_send로만 보내세요. plannotator_inbox 도구로 학습 카드를 직접 보내지 마세요.",
      "study_ask 결과가 chat이면 질문을 그대로 보여 주고, plannotator면 채팅에 질문을 다시 쓰지 말고 답장을 기다리세요.",
    ],
    parameters: Type.Object({
      projectRoot: projectRootParam,
      cardJson: Type.String({
        description:
          'question 카드: {"kind":"question","chapterSlug"?: "ch-01-x"(배치 진단이면 생략),"purpose":"placement|concept-check|test|review","askConfidence":bool,"items":[{"id","prompt","context"?,"choices"?,"multi"?,"maxScore"?(시험 필수)}],"id"?}',
      }),
      criteriaJson: Type.String({
        description: '문항별 비공개 기준: {"<itemId>":{"answer":"…","acceptable"?:["…"],"rubric":"…"}}',
      }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const c = await context(ctx?.cwd, params.projectRoot);
      const card = parse<Record<string, unknown>>(params.cardJson, "cardJson");
      const scope = (card.chapterSlug as string | undefined) ?? "placement";
      const result = await deps.queue(cardsFile(c, scope), () =>
        ask(c, { card, criteria: parse(params.criteriaJson, "criteriaJson") }, channels(c)),
      );
      return text(result.message);
    },
  });

  pi.registerTool({
    name: "study_send",
    label: "Study Send",
    description:
      "개념 파일(lesson)이나 안내·결과(notice)를 학습 채널로 보냅니다. lesson의 attachments는 프로젝트 기준 상대 경로입니다.",
    promptSnippet: "Send a lesson (concept file) or a notice through the learning channel",
    parameters: Type.Object({
      projectRoot: projectRootParam,
      cardJson: Type.String({
        description:
          'lesson: {"kind":"lesson","chapterSlug","title","summary","attachments":["ch-01-x/concepts/01-a.md"]} / notice: {"kind":"notice","chapterSlug"?,"title","body"}',
      }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const c = await context(ctx?.cwd, params.projectRoot);
      const card = parse<Record<string, unknown>>(params.cardJson, "cardJson");
      const scope = (card.chapterSlug as string | undefined) ?? "placement";
      const result = await deps.queue(cardsFile(c, scope), () => send(c, { card }, channels(c)));
      return text(`cardId: ${result.cardId}\n${result.message}`);
    },
  });

  pi.registerTool({
    name: "study_answer_record",
    label: "Study Answer Record",
    description:
      "학습자가 실제로 쓴 답을 카드 문항별로 기록합니다(원문·확신도·도움 정도·판정·점수). 최초 응답은 덮어쓰지 않고 교정은 correctionOf로 추가합니다.",
    promptSnippet: "Record the learner's actual answers per card item",
    promptGuidelines: [
      "study_answer_record에는 학습자가 실제로 쓴 답만 넣으세요. 교사 설명을 학습자 응답으로 기록하지 마세요.",
      "study_answer_record의 confidence에는 학습자가 말한 확신도(0~10)를 10으로 나눈 값만 넣으세요. 말하지 않았으면 비워 두고, 답의 말투로 추측하지 마세요.",
      "study_answer_record 전에 답장에 [cardId/itemId] 표시가 없으면 추측하지 말고 어느 문항인지 학습자에게 확인하세요.",
    ],
    parameters: Type.Object({
      projectRoot: projectRootParam,
      scope: Type.String({ description: "chapterSlug 또는 placement" }),
      answersJson: Type.String({
        description:
          '[{"cardId","itemId"(확신도는 "confidence"),"response","confidence"?(0~1),"assistance":"independent|hinted|explained|unknown","result":"demonstrated|partial|incorrect|unverified","score"?,"reason","correctionOf"?}]',
      }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const c = await context(ctx?.cwd, params.projectRoot);
      const answers = parse<unknown[]>(params.answersJson, "answersJson");
      if (!Array.isArray(answers)) throw new Error("answersJson은 배열이어야 합니다.");
      return text(
        await deps.queue(cardsFile(c, params.scope), () => recordAnswers(c, params.scope, answers as never)),
      );
    },
  });

  pi.registerTool({
    name: "study_placement_finish",
    label: "Study Placement Finish",
    description:
      "배치 진단을 끝내고 결과(종료 사유·시작점·집중·건너뜀·미확인·챕터별 출발점)를 project.json에 저장합니다. 질문은 상한 8개입니다.",
    promptSnippet: "Finish the one placement diagnosis and save each chapter's starting point",
    parameters: Type.Object({
      projectRoot: Type.String({ description: "학습 프로젝트 루트(절대 경로)" }),
      placementJson: Type.String({
        description:
          '{"reason":"route_decided|limit_reached|user_request","summary","startAt","focus":[],"skip":[{"what","reason"}],"unverified":[],"chapters":{"ch-01-x":{"startAt","skip":[],"focus":[],"unverified":[]}}}',
      }),
    }),
    async execute(_id, params) {
      return text(await finishPlacement(params.projectRoot, parse(params.placementJson, "placementJson")));
    },
  });

  pi.registerTool({
    name: "study_project_approve",
    label: "Study Project Approve",
    description:
      "학습자가 커리큘럼을 승인한 뒤 호출합니다. project.json을 쓰고 study 루트에 프로젝트를 등록하며 챕터 상태를 만듭니다.",
    promptSnippet: "Register an approved curriculum in the study root",
    parameters: Type.Object({
      projectRoot: Type.String({ description: "학습 프로젝트 루트(절대 경로)" }),
      projectSlug: Type.String(),
      topic: Type.String(),
      chaptersJson: Type.String({
        description: '{"ch-01-x":{"title","lab"?:{"mode":"cli|application|document|mixed","workspace"?,"package"?}}}',
      }),
      environmentJson: Type.Optional(Type.String({ description: "선택: language, buildTool, runtimeVersion, services 등" })),
    }),
    async execute(_id, params) {
      return text(
        await approveProject(params.projectRoot, {
          projectSlug: params.projectSlug,
          topic: params.topic,
          chapters: parse(params.chaptersJson, "chaptersJson"),
          ...(params.environmentJson ? { environment: parse(params.environmentJson, "environmentJson") } : {}),
        }),
      );
    },
  });

  pi.registerTool({
    name: "study_phase",
    label: "Study Phase",
    description:
      "챕터 단계 상태를 조회(get)하거나 개념·실습 단계를 끝냅니다(complete). 완료 조건(개념 파일·README 목록, lab step)을 검사합니다.",
    promptSnippet: "Get chapter phase state or complete the concept or lab phase after its checks pass",
    parameters: Type.Object({
      projectRoot: projectRootParam,
      action: Type.Union([Type.Literal("get"), Type.Literal("complete")]),
      chapterSlug: Type.String(),
      phase: Type.Optional(Type.Union(PHASES.map((p) => Type.Literal(p)))),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const c = await context(ctx?.cwd, params.projectRoot);
      if (params.action === "complete") {
        if (!params.phase) throw new Error("complete에는 phase가 필요합니다.");
        return text(await completePhase(c.projectRoot, params.chapterSlug, params.phase as StudyPhase));
      }
      const chapter = (await loadStudyState(c.projectRoot)).chapters[params.chapterSlug];
      if (!chapter) throw new Error(`챕터를 찾지 못했습니다: ${params.chapterSlug}`);
      return text(
        [
          ...PHASES.map((p) => `- ${p}: ${chapter[p].status}${chapter[p].attempt ? ` (attempt ${chapter[p].attempt})` : ""}`),
          `다음: ${nextPhase(chapter)}`,
        ].join("\n"),
      );
    },
  });

  pi.registerTool({
    name: "study_test_finish",
    label: "Study Test Finish",
    description:
      "기록된 문항 점수로 시험 통과 여부를 계산합니다. 통과하면 test를 완료하고 챕터 복습 일정을 등록합니다. 미통과면 약점 문항을 돌려줍니다.",
    promptSnippet: "Compute the test result from recorded scores and schedule review on a pass",
    parameters: Type.Object({
      projectRoot: projectRootParam,
      chapterSlug: Type.String(),
      cardId: Type.String(),
      passScore: Type.Number(),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const c = await context(ctx?.cwd, params.projectRoot);
      return text(await finishTest(c.projectRoot, params));
    },
  });

  pi.registerTool({
    name: "study_review_next",
    label: "Study Review Next",
    description:
      "study 루트의 오늘 할 챕터 복습(기한 경과 우선)과 각 챕터의 개념 파일·지난 시험 약점을 보여 줍니다. 정답은 포함하지 않습니다.",
    promptSnippet: "List today's due chapter reviews without answers",
    parameters: Type.Object({
      projectSlug: Type.Optional(Type.String()),
      chapterSlug: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await findWorkspaceRoot(ctx?.cwd ?? process.cwd());
      if (!workspace) throw new Error("등록된 study 루트가 없습니다.");
      return text(await reviewNext(workspace.root, todayIn(workspace.timezone), params));
    },
  });

  pi.registerTool({
    name: "study_review_finish",
    label: "Study Review Finish",
    description:
      "복습 카드의 응답으로 회차를 기록합니다. 모든 문항이 혼자 맞힌 답이면 다음 간격, 아니면 그 챕터만 처음 간격부터 다시 시작합니다.",
    promptSnippet: "Record a review round from the recorded answers of a review card",
    parameters: Type.Object({
      projectRoot: projectRootParam,
      chapterSlug: Type.String(),
      cardId: Type.String(),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const c = await context(ctx?.cwd, params.projectRoot);
      return text(await finishReview(c.projectRoot, params));
    },
  });
}
