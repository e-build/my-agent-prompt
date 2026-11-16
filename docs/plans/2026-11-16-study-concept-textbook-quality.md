# Study 개념 학습 교재 품질 고도화 Implementation Plan

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** 개념 학습 중 교재를 book 페이지에 바로 쓰고(깊이 있는 섹션 구성 + diagram-design SVG), 챕터 README는 학습 지도와 `교과서 페이지` 링크만 갖게 한다.

**Architecture:** 챕터 README의 `## 교과서 페이지` 섹션이 이번 챕터에서 쓴 book 페이지를 가리킨다. 개념 완료·챕터 완료 검사는 이 링크가 가리키는 book 페이지 본문을 근거로 삼고, 예전 `## 개념 학습 노트`도 계속 인정한다. 교재 품질 규칙은 `instructions/concept.md`와 `instructions/book.md`가 정본이며, 코드에는 막지 않는 구조 경고만 둔다.

**Tech Stack:** TypeScript, Node.js `node:test`, Pi extension API, Markdown, diagram-design skill(외부).

**설계:** `docs/plans/2026-11-16-study-concept-textbook-quality-design.md` (확정 v2)

**테스트 실행(모든 Task 공통):** `runtime/pi/extensions/study`에서

```bash
NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts'
```

기준선: 414 tests, 408 pass, 0 fail, 6 skipped(Pi 호스트 필요).

---

### Task 1: 챕터 README의 교과서 페이지 링크 읽기

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `runtime/pi/extensions/study/src/session/chapter-textbook.ts`
- Test: `runtime/pi/extensions/study/tests/session/chapter-textbook.test.ts`

**Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkedTextbookPages } from "../../src/session/chapter-textbook.ts";

const page = (body: string) => `---\nconcept: cn-aaaa1111\n---\n<!-- study:book region=head hash=000000000000 -->\nh\n<!-- /study:book -->\n\n<!-- study:book region=main hash=000000000000 -->\n${body}\n<!-- /study:book -->\n\n<!-- study:book region=foot hash=000000000000 -->\nf\n<!-- /study:book -->\n\n## 메모\n`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "chapter-textbook-"));
  await mkdir(join(root, "book", "자바", "스레드"), { recursive: true });
  await mkdir(join(root, "study-a", "ch-01-x"), { recursive: true });
  await writeFile(join(root, "book", "자바", "스레드", "README.md"), page("본문"));
  return { root, readme: join(root, "study-a", "ch-01-x", "README.md") };
}

test("reads book pages linked under '## 교과서 페이지' with their body state", async () => {
  const { root, readme } = await fixture();
  const content = "# ch\n\n## 교과서 페이지\n\n- [스레드](../../book/%EC%9E%90%EB%B0%94/%EC%8A%A4%EB%A0%88%EB%93%9C/README.md)\n- [없음](../../book/없음/README.md)\n- [웹](https://ex.com)\n\n## 다음\n- [밖](../../book/자바/스레드/README.md)\n";
  const pages = await linkedTextbookPages(readme, content);
  assert.deepEqual(pages.map((p) => [p.path, p.exists, p.hasBody]), [
    [join(root, "book", "자바", "스레드", "README.md"), true, true],
    [join(root, "book", "없음", "README.md"), false, false],
  ]);
  assert.equal(pages[0].body, "본문");
});

test("an empty main region is not a body; no section means no pages", async () => {
  const { root, readme } = await fixture();
  await writeFile(join(root, "book", "자바", "스레드", "README.md"), page("(아직 본문이 없습니다)"));
  const [only] = await linkedTextbookPages(readme, "## 교과서 페이지\n\n- [스레드](../../book/자바/스레드/README.md)\n");
  assert.equal(only.hasBody, false);
  assert.deepEqual(await linkedTextbookPages(readme, "# ch\n\n## 학습 목표\n"), []);
});
```

**Step 2: Run test to verify it fails**

Run: `NODE_PATH="$(npm root -g)" node --test tests/session/chapter-textbook.test.ts`
Expected: FAIL — `Cannot find module '../../src/session/chapter-textbook.ts'`

**Step 3: Write minimal implementation**

```ts
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { parsePage } from "../book/book-page.ts";
import { collectLinks, parseMarkdown } from "../book/md-parse.ts";

export const TEXTBOOK_SECTION = "교과서 페이지";
const EMPTY_MAIN = "(아직 본문이 없습니다)";

export type LinkedPage = { path: string; exists: boolean; hasBody: boolean; body: string };

function section(readme: string): string {
  return readme.match(new RegExp(`##\\s*${TEXTBOOK_SECTION}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`))?.[1] ?? "";
}

/** Book pages the chapter README links under `## 교과서 페이지` (local `book/…/README.md` links only). */
export async function linkedTextbookPages(readmePath: string, readme: string): Promise<LinkedPage[]> {
  const seen = new Set<string>();
  const pages: LinkedPage[] = [];
  for (const href of collectLinks(parseMarkdown(section(readme)))) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
    let decoded = href.split("#")[0];
    try { decoded = decodeURIComponent(decoded); } catch { /* keep raw */ }
    const path = resolve(dirname(readmePath), decoded);
    if (!path.endsWith(`${sep}README.md`) || !path.split(sep).includes("book") || seen.has(path)) continue;
    seen.add(path);
    let body = "";
    let exists = false;
    try {
      body = parsePage(await readFile(path, "utf8")).regions.main.body.trim();
      exists = true;
    } catch { /* missing or not a book page */ }
    pages.push({ path, exists, hasBody: exists && !!body && body !== EMPTY_MAIN, body });
  }
  return pages;
}
```

**Step 4: Run test to verify it passes**

Run: `NODE_PATH="$(npm root -g)" node --test tests/session/chapter-textbook.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add runtime/pi/extensions/study/src/session/chapter-textbook.ts runtime/pi/extensions/study/tests/session/chapter-textbook.test.ts
git commit -m "feat(study): read the book pages a chapter README links as its textbook"
```

---

### Task 2: 챕터 완료·상태 추정이 교과서 페이지를 근거로 인정

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `runtime/pi/extensions/study/src/session/chapter-evidence.ts:71-81` (`validateChapterEvidence`)
- Modify: `runtime/pi/extensions/study/src/session/study-state.ts:73-90` (`hasRealConcept`), `:137-148` (`migrateChapterState`)
- Test: `tests/session/chapter-evidence.test.ts`, `tests/session/study-state.test.ts`

**Step 1: Run existing tests** — `node --test tests/session/chapter-evidence.test.ts tests/session/study-state.test.ts` → 모두 PASS 확인.

**Step 2: Write the failing tests**

`chapter-evidence.test.ts`에 추가:

```ts
test("a README that links a book page with a body counts as the concept textbook", async () => {
  const { root, chapter } = await fixture();
  await mkdir(join(root, "book", "캐시"), { recursive: true });
  await writeFile(join(root, "book", "캐시", "README.md"), `---\nconcept: cn-aaaa1111\n---\n<!-- study:book region=head hash=000000000000 -->\nh\n<!-- /study:book -->\n\n<!-- study:book region=main hash=000000000000 -->\n캐시 본문\n<!-- /study:book -->\n\n<!-- study:book region=foot hash=000000000000 -->\nf\n<!-- /study:book -->\n`);
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 교과서 페이지\n\n- [캐시](../book/캐시/README.md)\n");
  await validate(root);
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 교과서 페이지\n\n- [없음](../book/없음/README.md)\n");
  await assert.rejects(() => validate(root), /교과서 페이지/);
});
```

`study-state.test.ts`에 추가: README가 본문 있는 book 페이지를 링크하면 `migrateChapterState(...).concept.status === "completed"`이고 evidence가 `README.md`.

**Step 3: Run to verify they fail** — 첫 테스트는 `개념 학습 노트` 오류로, 두 번째는 `not_started`로 FAIL.

**Step 4: Implement**

`chapter-evidence.ts`:

```ts
import { linkedTextbookPages } from "./chapter-textbook.ts";
// validateChapterEvidence 안, conceptBody 검사를 교체:
const pages = await linkedTextbookPages(readmePath, readme);
const conceptBody = conceptBodyFrom(readme);
const legacyOk = !!conceptBody && !/아직\s*개념\s*학습\s*전/.test(conceptBody);
if (pages.length) {
  const empty = pages.filter((p) => !p.hasBody).map((p) => p.path);
  if (empty.length) throw new Error(`교과서 페이지에 본문이 없습니다: ${empty.join(", ")}`);
} else if (!legacyOk) {
  throw new Error("챕터 README.md의 '교과서 페이지'에 본문이 있는 book 페이지 링크가 있어야 합니다(예전 방식: 개념 학습 노트).");
}
```

`study-state.ts`: `hasRealConcept`를 async로 바꾸고 `(readmePath, chapterReadme, legacyConcept)`를 받는다. 첫 줄에서 `const pages = await linkedTextbookPages(readmePath, chapterReadme); if (pages.length && pages.every((p) => p.hasBody)) return { completed: true, evidence: "README.md" };` 나머지는 그대로. `migrateChapterState`에서 `await hasRealConcept(join(dir, "README.md"), chapterReadme, concept)`.

**Step 5: Run tests** — 두 파일 PASS, 전체 테스트 0 fail.

**Step 6: Commit**

```bash
git commit -am "feat(study): accept linked book pages as the chapter's concept evidence"
```

---

### Task 3: 개념 학습 완료가 교과서 페이지를 검사하고 구조 경고를 준다

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `runtime/pi/extensions/study/src/session/concept-completion.ts`
- Modify: `runtime/pi/extensions/study/src/session/chapter-textbook.ts` (경고 함수 추가)
- Test: `tests/session/concept-completion.test.ts`, `tests/session/chapter-textbook.test.ts`

**동작**
- binding은 계속 필수(복습 일정의 근거)
- README에 `교과서 페이지` 링크가 있으면: README 관리 영역 검사(`refreshTextbook`)를 하지 않고, 링크된 페이지가 모두 있고 본문이 있는지 검사(없으면 에러). 그리고 페이지마다 구조 경고를 결과 `warnings`와 메시지에 붙인다
- 링크가 없으면: 지금 동작 그대로(예전 방식)

**Step 1: Write the failing tests**

`chapter-textbook.test.ts`:

```ts
import { textbookWarnings } from "../../src/session/chapter-textbook.ts";

test("structure warnings name what a concept page is missing, never block", () => {
  assert.deepEqual(textbookWarnings("## 왜 필요한가\n\n글"), ["내부 동작 섹션이 없습니다", "SVG 그림이 없습니다", "출처(웹 링크)가 없습니다"]);
  assert.deepEqual(textbookWarnings("## 내부 동작\n\n![상태](../_media/cn-a/s.svg)\n\n## 출처\n\n- [JLS](https://docs.oracle.com/)"), []);
});
```

`concept-completion.test.ts`: book 페이지(본문 `## 왜 필요한가`)를 만들고 README에 `## 교과서 페이지` 링크, binding 저장 → `finishConcept` 성공, `result.warnings.length === 3`, `state.concept.evidence`에 그 book 페이지의 루트 기준 경로 포함. 링크된 페이지가 없으면 `/교과서 페이지/`로 reject.

**Step 2: Run to verify they fail.**

**Step 3: Implement**

`chapter-textbook.ts`:

```ts
export function textbookWarnings(body: string): string[] {
  const warnings: string[] = [];
  if (!/^#{2,4}\s*.*(내부 동작|어떻게 동작)/m.test(body)) warnings.push("내부 동작 섹션이 없습니다");
  if (!/!\[[^\]]*\]\([^)\s]+\.svg[)\s"]/.test(body)) warnings.push("SVG 그림이 없습니다");
  if (!/\]\(https?:\/\//.test(body)) warnings.push("출처(웹 링크)가 없습니다");
  return warnings;
}
```

`concept-completion.ts` (binding 확인 직후):

```ts
const readmeRel = `${project.path}/${chapterSlug}/README.md`;
const readmePath = join(root, ...readmeRel.split("/"));
const readme = (await readTextOptional(readmePath)) ?? "";
const pages = await linkedTextbookPages(readmePath, readme);
const warnings: string[] = [];
if (pages.length) {
  const empty = pages.filter((p) => !p.hasBody).map((p) => relative(root, p.path));
  if (empty.length) throw new Error(`교과서 페이지에 본문이 없습니다: ${empty.join(", ")}`);
  for (const p of pages) for (const w of textbookWarnings(p.body)) warnings.push(`${relative(root, p.path)}: ${w}`);
} else {
  /* 기존 refreshTextbook 검사 블록 그대로 */
}
```

evidence는 `[readmeRel(프로젝트 기준), binding, ...pages 루트 기준 경로]`. 반환 타입에 `warnings: string[]`. 메시지 끝에 `warnings.length ? \` 구조 경고 ${warnings.length}건(막지 않음): ${warnings.join("; ")}\` : ""`.

**Step 4: Run tests** — PASS, 전체 0 fail.

**Step 5: Commit**

```bash
git commit -am "feat(study): finish concept against linked book pages with non-blocking structure warnings"
```

---

### Task 4: 개념 학습 지침 재작성 (`instructions/concept.md`)

**TDD scenario:** Modifying tested code — 지침 내용 테스트 추가

**Files:**
- Modify: `runtime/pi/extensions/study/instructions/concept.md` (전체 재작성)
- Test: Create `runtime/pi/extensions/study/tests/session/concept-instructions.test.ts`

**Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPhaseInstructions } from "../../src/session/phase-instructions.ts";

test("concept instructions teach from book pages with depth, SVG diagrams and evidence", async () => {
  const text = await loadPhaseInstructions("concept");
  for (const rule of [/study_book.*plan/, /write_page/, /교과서 페이지/, /내부 동작/, /왜 이렇게 설계/, /흔한 오해/, /풀이/,
    /diagram-design/, /export_svg\.py.*--system-fonts/, /self_check\.py --offline/, /book\/_media/, /노드 9개/,
    /공식 문서/, /실행한/, /재구성/, /finish_concept/, /학습자.*답.*넣지 않/])
    assert.match(text, rule);
  assert.doesNotMatch(text, /개념 학습 노트`를 독립적인 교과서형 본문으로 갱신/);
});
```

**Step 2: Run** → FAIL.

**Step 3: Rewrite `concept.md`** — 아래 내용 그대로(설계 문서의 정본 요약).

```md
# Concept phase

교재를 먼저 쓰고 그 교재로 수업한다. 학습자가 읽는 글이 그대로 내 교과서(book/)가 된다.

## 흐름

1. `study_learning_route` get으로 진단의 시작점·집중 범위를 읽는다. 챕터 README의 학습 목표·범위만 다룬다.
2. `study_book` action=plan `{projectSlug, chapterSlug}`로 이 챕터 지식이 이미 속한 페이지(보강 대상)와 위계를 본다. 같은 개념 페이지가 있으면 보강하고, 없으면 하위 개념을 `create`한다. 최상위 영역은 만들지 않는다.
3. 개념 하나씩: 공식 문서 확인 → `study_book` apply `write_page`로 그 개념의 섹션을 쓴다 → 필요하면 예측 질문(scored=false) → 학습자가 읽는다 → 확인 질문 → 이해가 부족하면 그 섹션을 **재구성**한다(문장 덧붙이기 금지, 분량 증가를 해결책으로 삼지 않음).
4. 자료·교재에서 확인한 명제는 `study_knowledge` apply로 공통 지식에 반영하고(근거 부족은 uncertain), `study_book` `place`로 그 페이지에 넣는다. 챕터-지식 연결은 `study_textbook_refresh`의 bindingJson으로 저장한다(복습 일정의 근거). 같은 뜻·같은 조건만 기존 ID에 표현 추가, 모호하면 별도 항목.
5. 챕터 README에 `## 교과서 페이지` 섹션을 두고 이번에 쓴 book 페이지를 상대 링크로 남긴다. README에 개념 본문이나 지식 관리 영역을 넣지 않는다.
6. 아래 자가 점검을 마친 뒤 `study_learning_route` action=finish_concept. 반환된 구조 경고는 학습자에게 그대로 알리고, 필요하면 보강한다. 이번에 쓴 페이지와 undo용 changeId를 짧게 보고한다.

- 사용자가 설명을 요청하면 같은 회상 질문을 반복하지 말고 설명부터 한다. 확신도는 선택.
- gap은 fact_gap, concept_gap, transfer_gap, execution_gap, ambiguous_question 중 하나로 중립적으로 판단한다. transfer 실패를 복사·불성실로 단정하지 않는다.
- 학습자의 답·오답·확신도는 교재에 넣지 않는다. 오답에서 드러난 오해 **유형**만 "흔한 오해"의 재료로 쓴다.

## 페이지 구성 (개념 하나)

맞지 않는 섹션은 뺀다. 양식이 아니라 빠뜨리지 않기 위한 순서다.

1. **왜 필요한가** — 이 개념이 푸는 문제. 없으면 무엇이 깨지는지. 구체적 상황 하나로 시작
2. **핵심 한 문장** — 복습 때 이 문장만 읽어도 떠오르게
3. **최소 예시** — 가장 작은 코드·명령과 실제로 실행한 출력, 실행 환경 한 줄
4. **내부 동작** — 예시가 실행되는 동안의 전·중·후 상태, 누가 무엇을 바꾸는지. API 아래 한 단계(런타임·OS·자료구조)까지. 그림 1순위
5. **왜 이렇게 설계됐나** — 다른 선택지와 비용, 이 설계가 지키는 것
6. **성립 조건과 경계** — 언어·표준의 보장 / 특정 구현 / 이번 관찰을 구분
7. **흔한 오해** — 틀리기 쉬운 생각과 바른 설명
8. **비교** — 비슷한 개념과의 차이를 표 하나로. 다른 개념의 상세는 그 페이지 링크
9. **스스로 확인** — 예측·판단을 묻는 질문 2~3개. 답은 페이지 맨 끝 `## 풀이`
10. **출처** — 공식 문서 웹 링크

깊이 자가 점검:
- 동작을 설명하는 문장마다 "무엇이 그렇게 만드는가"에 답했는가
- 내부 동작에 전·중·후 상태가 있는가
- 본문만 읽고 예시 출력이 왜 그렇게 나오는지 설명할 수 있는가
- "~하면 된다" 규칙마다 그 규칙이 생긴 이유가 있는가

## 그림 (diagram-design SVG)

- 문단보다 그림이 나을 때만 그린다. 목록·속성 비교는 표. 그림 하나에 노드 9개 이하(넘으면 둘로), 밀도 4/10. 페이지당 핵심 그림 1~3개, "내부 동작"이 1순위
- 의미 패턴을 먼저 고른다: 상태와 전이 → state machine, 여러 주체의 순서 → sequence, 데이터·제어 흐름 → data flow/flowchart, 포함·계층 → layers/nested/tree, 시간 변화 → timeline/swimlane. 시퀀스의 참여자가 스레드·코드 계층·데이터 중 무엇인지, 화살표가 요청·반환·관찰 중 무엇인지 오해 없게 쓴다
- 과정: study 루트의 `.diagram-design` 프로필(`study-plain`)로 HTML을 만든다 → `python3 scripts/export_svg.py <html> <svg> --system-fonts` → `python3 scripts/self_check.py --offline <html>` 통과 → 원본 HTML과 SVG를 `book/_media/<개념 ID>/`에 둔다 → 본문에 상대 경로 `![그림이 말하는 내용 한 문장](…/_media/<개념 ID>/<이름>.svg)`
- 본문은 그림 없이도 읽히게 쓴다. 그림은 구조를 보여 주고 설명을 대신하지 않는다
- 기존 페이지의 Mermaid는 그대로 둔다. 새 그림은 SVG로 그린다

## 정확성

- 주요 주장(동작·보장·수치)은 공식 문서를 실제로 열어 확인하고 `출처`에 링크한다. 확인하지 못하면 "확인 필요"로 표시하고 단정하지 않는다
- 예시 출력은 실제로 실행한 결과만 쓴다. 실행할 수 없는 예시는 "실행하지 않은 예시"로 표시한다
- 교과서는 book/ 안에서 완결한다. 챕터 README·lab·sources 같은 book/ 밖 파일은 본문에서 링크하지 않는다(거부됨)
- 현재 챕터 범위만 쓴다. 후속 챕터 상세는 한 줄 연결. 프로젝트의 학습 용어를 일관되게 쓴다
- 사용자가 직접 고친 본문은 덮어쓰지 않는다. 거부되면 `adopt_page` 여부를 먼저 묻는다
```

**Step 4: Run** → PASS. `tests/session/diagnosis-review-prompt.test.ts`, `study-command.test.ts`가 concept 지침 문구를 검사하면 함께 확인하고 깨진 단언만 새 문구로 바꾼다.

**Step 5: Commit**

```bash
git commit -am "docs(study): teach concepts from book pages with depth, SVG diagrams and evidence"
```

---

### Task 5: 챕터 완료 재구성을 "보강"으로 (`instructions/book.md`)

**TDD scenario:** Modifying tested code — `tests/book/book-instructions.test.ts`

**Files:**
- Modify: `runtime/pi/extensions/study/instructions/book.md`
- Modify: `runtime/pi/extensions/study/src/book/book-query.ts:94-108` (재료에 링크된 교과서 페이지 추가)
- Modify: `runtime/pi/extensions/study/src/book/book-tools.ts:59` (재료 줄에 표시)
- Test: `tests/book/book-instructions.test.ts`, `tests/book/book-integrity.test.ts`(plan 테스트)

**Step 1: Failing tests**
- `book-instructions.test.ts` 규칙 목록에 `/교과서 페이지/`, `/페이지 구성|concept\.md/`, `/SVG/` 추가
- plan 테스트: 챕터 README에 `## 교과서 페이지` 링크가 있으면 `plan.materials.textbook`이 그 페이지의 루트 기준 경로 목록

**Step 2: Run** → FAIL.

**Step 3: Implement**
- `BookMaterials`에 `textbook: string[]` 추가. `chapterMaterials`에서 README를 읽어 `linkedTextbookPages`의 존재하는 페이지를 `relative(root, path)`로 담는다
- `book-tools.ts` 재료 줄: `` `교과서 페이지 ${plan.materials.textbook.join(", ") || "없음"}` ``
- `book.md` 변경:
  - 첫 문단: "개념 학습 때 이미 book 페이지에 교재를 썼다. 챕터 완료 때는 그 페이지를 **보강**한다. 예전 방식(README `개념 학습 노트`) 챕터만 README에서 뽑아 새로 쓴다."
  - 순서 2: 재료에 `교과서 페이지` 추가, 먼저 읽는다
  - 재구성 원칙의 "구조" 줄을 "페이지 구성·그림 규칙은 `instructions/concept.md`와 같다(내부 동작·SVG 그림·출처). 보강은 검증된 실습 출력과 시험 문제를 최소 예시·스스로 확인에 더하는 것이 중심"으로 교체

**Step 4: Run** → PASS, 전체 0 fail.

**Step 5: Commit**

```bash
git commit -am "feat(study): turn the chapter-end book step into reinforcing the concept pages"
```

---

### Task 6: 챕터 README 템플릿 (`prompts/study-init.md`)

**TDD scenario:** Trivial change — use judgment (프롬프트 문구)

**Files:**
- Modify: `runtime/pi/extensions/study/prompts/study-init.md:198-207`, `:352`, `:379`, `:437`, `:442`

**Step 1: 변경**
- 템플릿의 `## 개념 학습 노트` 블록을 다음으로 교체:

  ````md
  ## 교과서 페이지
  개념 학습 중 이 챕터에서 쓴 내 교과서(book/) 페이지 링크를 둔다. 시작 시에는 만들지 않는다.
  ````
- 규칙 줄(206): "`개념 학습 노트`는 … 교재 구조…" → "개념 본문은 챕터 README가 아니라 book 페이지에 쓴다(`instructions/concept.md`). README는 학습 지도와 `교과서 페이지` 링크만 갖는다."
- 352·379·437·442행의 `개념 학습 노트` 언급을 같은 뜻으로 고친다(README = 학습 지도 + 교과서 페이지 링크)

**Step 2: 확인**

Run: `grep -n "개념 학습 노트" runtime/pi/extensions/study/prompts/study-init.md`
Expected: 출력 없음. 전체 테스트 0 fail.

**Step 3: Commit**

```bash
git commit -am "docs(study): chapter README template links textbook pages instead of holding concept notes"
```

---

### Task 7: diagram-design `study-plain` 프로필과 study 루트 마커

**TDD scenario:** Trivial change — 외부 설정(저장소 밖). 대비 검사로 검증

**Files:**
- Create: `~/.diagram-design/profiles/default.md` (diagram-design `profiles.md`의 "Built-in default" 절차대로, 설치본 `references/style-guide.md` 원본 그대로)
- Create: `~/.diagram-design/profiles/study-plain.md`
- Create: `~/IdeaProjects/study/.diagram-design` — 내용 정확히 `profile: study-plain` 한 줄

**Step 1:** `references/profiles.md`의 save 절차를 따른다. `study-plain.md` = 헤더(`name: Study Plain`, `slug: study-plain`, `source-url: none`, `notes: 흰 배경·검정·회색, 색 강조 없음`) + 설치본 style-guide 본문에서 아래만 바꾼 것

| 역할 | light | dark |
|---|---|---|
| `paper` | `#ffffff` | `#ffffff` |
| `paper-2` | `#f5f5f5` | `#f5f5f5` |
| `ink` / `ink-strong` | `#111111` | `#111111` |
| `muted` | `#555555` | `#555555` |
| `soft` | `#666666` | `#666666` |
| `rule` / `rule-solid` | `rgba(0,0,0,0.12)` / `#cccccc` | 같음 |
| `accent` | `#111111` | `#111111` |
| `accent-tint` | `rgba(0,0,0,0.05)` | 같음 |
| `link` | `#555555` | `#555555` |
| Font source | `system` | |

(dark도 같은 값: 교과서 그림은 흰 카드로 고정)

**Step 2: 검증**

```bash
cd ~/.agents/skills/diagram-design/../..   # 클론 루트: ~/.local/share/agent-skills/sources/diagram-design
python3 scripts/verify-contrast.py --style-guide ~/.diagram-design/profiles/study-plain.md
```

Expected: exit 0. 실패하면 해당 토큰만 더 어둡게 조정하고 설계 문서 표를 갱신한다.

**Step 3:** 시험 그림 하나(state machine, 노드 3개)를 만들어 `export_svg.py --system-fonts`·`self_check.py --offline` 통과를 확인하고 지운다.

**Step 4: Commit** (study 저장소)

```bash
cd ~/IdeaProjects/study && git add .diagram-design && git commit -m "chore: use the study-plain diagram-design profile for textbook figures"
```

---

### Task 8: 문서 정리와 전체 검증

**TDD scenario:** Trivial change

**Files:**
- Modify: `runtime/pi/extensions/study/README.md` — 개념 학습 단락(165·196·241행 부근)과 "내 교과서" 절: 교재는 개념 학습 중 book 페이지에 쓰고 README는 `교과서 페이지` 링크, 완료 검사·구조 경고, 챕터 완료 = 보강, `study-plain` 프로필
- Modify: `docs/plans/2026-11-16-study-concept-textbook-quality-design.md` — 상태 줄을 "구현 완료"로

**Step 1:** 전체 테스트 → 0 fail (기준선 대비 새 테스트만 증가)
**Step 2:** `bash scripts/check-resources` → `All checks passed`
**Step 3:** `grep -rn "개념 학습 노트" runtime/pi/extensions/study/{instructions,prompts}` → `legacy-study-chapter.md`(레거시 지침)만 남는지 확인
**Step 4: Commit**

```bash
git commit -am "docs(study): document book-first concept textbooks"
```

---

## 범위 밖

- 기존 book 페이지 277개 재작성, 기존 Mermaid 변환
- 시범 적용 챕터(사용자 결정: 다음 학습 때 자연히 적용)
- 리뷰어 에이전트, 분량 기준
