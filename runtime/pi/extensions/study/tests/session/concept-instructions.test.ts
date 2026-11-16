import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPhaseInstructions } from "../../src/session/phase-instructions.ts";

test("concept instructions teach from book pages with depth, SVG diagrams and evidence", async () => {
  const text = await loadPhaseInstructions("concept");
  for (const rule of [
    /study_book.*plan/,
    /write_page/,
    /## 교과서 페이지/,
    /내부 동작/,
    /왜 이렇게 설계/,
    /흔한 오해/,
    /## 풀이/,
    /diagram-design/,
    /export_svg\.py.*--system-fonts/,
    /self_check\.py --offline/,
    /book\/_media\/<개념 ID>/,
    /노드 9개/,
    /공식 문서/,
    /실제로 실행한/,
    /재구성/,
    /finish_concept/,
    /학습자의 답.*넣지 않/,
  ])
    assert.match(text, rule);
  assert.doesNotMatch(text, /개념 학습 노트`를 독립적인 교과서형 본문으로 갱신/);
});
