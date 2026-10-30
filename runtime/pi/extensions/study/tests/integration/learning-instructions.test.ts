import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name: string) => readFile(new URL(`../../${name}`, import.meta.url), "utf8");

test("diagnosis is a route-finding dialogue with an eight-question cap and precommitted keys", async () => {
  const text = await read("instructions/diagnosis.md");
  assert.match(text, /학습 경로/);
  assert.match(text, /최소 문항 수 없음/);
  assert.match(text, /상한 8문항/);
  assert.match(text, /재개해도 초기화되지 않는다/);
  assert.match(text, /study_question_prepare/);
  assert.match(text, /study_answer_record/);
  assert.match(text, /finish_diagnosis/);
  assert.match(text, /route_decided.*limit_reached.*user_request/);
  assert.match(text, /미확인/);
  assert.match(text, /새 진단에는 쓰지 않는다/);
  assert.doesNotMatch(text, /최소 10문항|study_diagnosis_open을 호출한다/);
});

test("the completion exam stays in the browser", async () => {
  const text = await read("instructions/test.md");
  assert.match(text, /study_test_open을 호출한다/);
  assert.match(text, /통합 복습 일정이 자동 등록/);
});

test("concept and lab instructions describe the new flow and assistance levels", async () => {
  const concept = await read("instructions/concept.md");
  assert.match(concept, /결과 예측/);
  assert.match(concept, /study_knowledge/);
  assert.match(concept, /study_textbook_refresh/);
  assert.match(concept, /finish_concept/);
  assert.match(concept, /학습자 답변을 지식으로 저장하지 않음/);
  const lab = await read("instructions/lab.md");
  assert.match(lab, /완성 예제 분석/);
  assert.match(lab, /작은 수정/);
  assert.match(lab, /독립 구현/);
  assert.match(lab, /독립 수행으로 기록하지 않는다/);
});

test("integrated review is finite, restarts on errors, has no daily cap and never mixes with the legacy schedule", async () => {
  for (const name of ["instructions/review.md", "prompts/study-review.md"]) {
    const text = await read(name);
    assert.match(text, /\+1 \/ \+3 \/ \+7 \/ \+14일/, name);
    assert.match(text, /하루 양 제한 없음/, name);
    assert.match(text, /힌트 후/, name);
    assert.match(text, /마지막 회차 후 종료/, name);
  }
  const prompt = await read("prompts/study-review.md");
  assert.match(prompt, /두 방식을 한 회차에 섞지 않음/);
  assert.match(prompt, /study_review_next/);
  assert.match(prompt, /unverified로 두고 날짜를 바꾸지 않음/);
  assert.match(prompt, /미래 회차는 미리 하지 않음/);
});

test("study-init no longer prescribes HTML diagnosis or the old review cadence", async () => {
  const text = await read("prompts/study-init.md");
  assert.match(text, /사전진단 — Pi 대화/);
  assert.match(text, /study_workspace/);
  assert.match(text, /자동 등록/);
  assert.doesNotMatch(text, /\/study-workspace/);
  assert.doesNotMatch(text, /최소 10문항|3일\/1주\/2주|blank-recall\.md/);
  assert.doesNotMatch(text, /diagnosis\.html      # study_diagnosis_open/);
});

test("the legacy chapter guide is marked as legacy-only", async () => {
  const text = await read("instructions/legacy-study-chapter.md");
  assert.match(text, /레거시 참고 문서/);
});
