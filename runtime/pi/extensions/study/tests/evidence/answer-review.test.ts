import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAnswerReview } from "../../src/evidence/answer-review.ts";

test("the answer review shows each question with the learner's own words before the answer", () => {
  const text = formatAnswerReview([
    { scored: true, prompt: "id NOT IN (2, NULL)의 결과 행 수는?", response: "2행 - 1,3이 출력된다. 확신도 10", confidence: 1, result: "incorrect", answer: "0행" },
    { scored: false, prompt: "예측해 보세요", options: [{ id: "A", text: "1" }, { id: "B", text: "2" }], response: "B", result: "unverified", answer: null },
    { scored: true, prompt: "건너뛴 질문", response: null, result: null, answer: "X" },
  ]);
  assert.match(text, /^## 답 대조/);
  assert.match(text, /### Q1\n\n- 질문: id NOT IN \(2, NULL\)의 결과 행 수는\?\n- 내 답: 2행 - 1,3이 출력된다\. 확신도 10\n- 확신도: 10\/10\n- 판정: 틀림\n- 정답: 0행/);
  assert.match(text, /### Q2\n\n- 질문: 예측해 보세요 \(A\) 1 \/ \(B\) 2\n- 내 답: B\n- 판정: 비채점\n/);
  assert.doesNotMatch(text.split("### Q2")[1].split("### Q3")[0], /정답/);
  assert.match(text, /### Q3\n\n- 질문: 건너뛴 질문\n- 내 답: \(응답 없음\)\n- 정답: X/);
  assert.match(text, /해설은 문항마다 위 '내 답'/);
});

test("multi-line answers stay readable as quoted blocks", () => {
  const text = formatAnswerReview([{ scored: true, prompt: "p", response: "첫 줄\n둘째 줄", result: "partial", answer: "a" }]);
  assert.match(text, /- 내 답:\n  > 첫 줄\n  > 둘째 줄\n- 판정: 부분 정답/);
});
