import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const prompt = () => readFile(new URL("./prompts/study-review.md", import.meta.url), "utf8");

test("review instructions choose the input modality each round without requiring oral completion", async () => {
  const text = await prompt();
  assert.match(text, /매 회차.*STT.*텍스트/);
  assert.match(text, /중간 전환/);
  assert.match(text, /self-lecture.*구두/);
  assert.match(text, /텍스트.*구두.*완료.*기록하지/);
});

test("review instructions repeat stable concepts and distinguish delayed recall from correction", async () => {
  const text = await prompt();
  assert.match(text, /독립 지연 회상/);
  assert.match(text, /교정 직후/);
  assert.match(text, /기준 질문.*반복.*허용/);
  assert.match(text, /STRONG.*이번.*보충/);
  assert.doesNotMatch(text, /같은 문제를 반복하지|문제를 외우면 복습 효과가 사라/);
});

test("schedule is canonical and neither exact intervals nor future mastery is invented", async () => {
  const text = await prompt();
  assert.match(text, /간격.*기준일.*시간대/);
  assert.match(text, /자동.*날짜.*금지/);
  assert.match(text, /sessions\/r/);
  assert.match(text, /## 고정 회차/);
  assert.match(text, /장기 기억.*인증.*아님/);
  assert.doesNotMatch(text, /3일 \/ 1주 \/ 2주/);
});

test("active instructions no longer require a pack or a mandatory five-step pipeline", async () => {
  const files = ["instructions/review.md", "instructions/test.md", "instructions/legacy-study-chapter.md", "prompts/study-init.md"];
  for (const name of files) {
    const text = await readFile(new URL(name, import.meta.url), "utf8");
    assert.doesNotMatch(text, /study_pack_refresh|blank-recall → gap-fill → self-lecture → analogy-lock → schedule/, name);
    assert.match(text, /review\/README\.md|고정 회차/, name);
  }
});
