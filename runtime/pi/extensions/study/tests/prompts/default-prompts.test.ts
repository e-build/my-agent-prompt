import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PROMPT_NAMES } from "../../src/prompts/prompt-loader.ts";

const read = (name: string) =>
  readFile(new URL(`../../prompts/${name}.md`, import.meta.url), "utf8");

test("every prompt name has a default file", async () => {
  for (const name of PROMPT_NAMES) assert.ok((await read(name)).trim().length > 0, name);
});

test("no default prompt mentions removed features", async () => {
  const removed =
    /study_book|study_knowledge|study_textbook_refresh|study_test_open|study_diagnosis_open|study_curriculum_open|study_question_prepare|study_learning_route|study_placement[^_]|book\/|diagnosis\.md|사전진단|교과서 페이지|브라우저/;
  for (const name of PROMPT_NAMES) assert.doesNotMatch(await read(name), removed, name);
});

test("phase prompts use the channel and flow tools", async () => {
  assert.match(await read("concept"), /study_send[\s\S]*study_phase/);
  assert.match(await read("lab"), /study_lab_verify[\s\S]*study_phase/);
  assert.match(await read("test"), /study_ask[\s\S]*study_answer_record[\s\S]*study_test_finish/);
  assert.match(await read("review"), /study_ask[\s\S]*study_review_finish/);
  assert.match(await read("init"), /study_placement_finish[\s\S]*study_project_approve/);
  assert.match(await read("checkpoint"), /study_checkpoint_publish/);
});

test("init takes the topic placeholder", async () => {
  assert.match(await read("init"), /\{\{topic\}\}/);
});

test("confidence is asked and never guessed where learners answer recall questions", async () => {
  for (const name of ["init", "concept", "review"])
    assert.match(await read(name), /확신도\(0~10\)/, name);
  assert.match(await read("init"), /추측하지 말고 비운다/);
});

test("the chapter README template has the concept file section the completion check reads", async () => {
  assert.match(await read("templates/chapter-readme"), /^## 개념 파일$/m);
  assert.doesNotMatch(await read("templates/chapter-readme"), /^## .*(완료 기준|통과 기준)/m);
});
