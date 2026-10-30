import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { recordAnswer, type AnswerInput } from "./evidence-store.ts";
import { prepareQuestion, type PrepareOptions, type QuestionInput } from "./question-store.ts";
import { linkExistingRecord, type RecordLinkInput } from "./existing-record-links.ts";

function parse<T>(payloadJson: string): T {
  try {
    return JSON.parse(payloadJson) as T;
  } catch {
    throw new Error("payloadJson이 올바른 JSON이 아닙니다.");
  }
}

export type QuestionToolHooks = {
  /** Lets the dialogue state machine enforce limits and commit counters with the question. */
  prepareOptions?: (root: string, input: QuestionInput) => Promise<PrepareOptions>;
  answerOptions?: (root: string) => Promise<Parameters<typeof recordAnswer>[2]>;
};

export function registerQuestionTools(pi: ExtensionAPI, hooks: QuestionToolHooks = {}) {
  pi.registerTool({
    name: "study_question_prepare",
    label: "Study Question Prepare",
    description:
      "질문을 학습자에게 보여 주기 전에 비공개 채점 기준(정답·허용 대안·기준·조건)과 확인할 지식 버전을 먼저 저장하고, 공개 가능한 질문만 반환합니다. 비채점 질문(예측 등)은 scored=false로 명시합니다.",
    promptSnippet: "Precommit hidden answer criteria, then return only the public question",
    promptGuidelines: [
      "study_question_prepare가 반환한 공개 질문만 학습자에게 보여 주세요. 채점 기준을 답변 전에 말하지 마세요.",
      "같은 질문을 다시 준비할 때는 같은 requestId를 쓰고, 내용을 바꾸면 새 requestId를 쓰세요.",
    ],
    parameters: Type.Object({
      payloadJson: Type.String({
        description:
          "{requestId,purpose:'diagnosis'|'concept-check'|'prediction'|'review'|'lab'|'test',scored,prompt,options?,refs:[{id,version,revisionId}],chainRefs?,criteria?:{answer,acceptable,rubric,conditions},context?:{projectSlug,chapterSlug}}",
      }),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await requireWorkspace(ctx?.cwd ?? process.cwd(), params.workspaceRoot);
      const input = parse<QuestionInput>(params.payloadJson);
      const question = await prepareQuestion(workspace.root, input, (await hooks.prepareOptions?.(workspace.root, input)) ?? {});
      return { content: [{ type: "text", text: JSON.stringify(question, null, 2) }], details: question };
    },
  });

  pi.registerTool({
    name: "study_answer_record",
    label: "Study Answer Record",
    description:
      "학습자가 실제로 한 답(원 응답)과 위치, 도움 정도(independent|hinted|explained|unknown), 질문한 지식별 판정(demonstrated|partial|incorrect|unverified)을 추가 기록합니다. 최초 응답은 덮어쓰지 않으며 교정은 correctionOf로 새로 기록합니다.",
    promptSnippet: "Append the learner's actual answer with assistance level and per-proposition findings",
    promptGuidelines: [
      "study_answer_record에는 학습자가 실제로 쓴 답만 넣으세요. 교사 설명을 학습자 응답으로 기록하지 마세요.",
      "도움 여부를 모르면 assistance=unknown, 확인하지 못한 지식은 unverified로 기록하고 추측하지 마세요.",
    ],
    parameters: Type.Object({
      payloadJson: Type.String({
        description:
          "answer: {submissionId,questionId,response,responseAnchor,assistance,submittedAt,confidence?,findings:[{ref,result,reason}],chainFindings?,correctionOf?,note?}. link: {linkId,projectSlug,chapterSlug,kind:'lab'|'test'|'legacy-diagnosis',recordPath,anchor,assistance,refs,agentAuthored?}",
      }),
      kind: Type.Optional(Type.Union([Type.Literal("answer"), Type.Literal("link")], { description: "link: 기존 lab·시험 기록을 복사하지 않고 지식에 연결" })),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await requireWorkspace(ctx?.cwd ?? process.cwd(), params.workspaceRoot);
      if (params.kind === "link") {
        const link = await linkExistingRecord(workspace.root, parse<RecordLinkInput>(params.payloadJson));
        return { content: [{ type: "text", text: `연결함 ${link.kind} ${link.recordPath}#${link.anchor} (${link.assistance})` }], details: link };
      }
      const evidence = await recordAnswer(
        workspace.root,
        parse<AnswerInput>(params.payloadJson),
        (await hooks.answerOptions?.(workspace.root)) ?? {},
      );
      const summary = evidence.findings.map((f) => `${f.ref.id.slice(0, 10)}=${f.result}`).join(", ") || "판정 없음";
      return {
        content: [{ type: "text", text: `기록함 ${evidence.id} (${evidence.assistance}): ${summary}` }],
        details: evidence,
      };
    },
  });
}
