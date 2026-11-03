# study 내 교과서 1단계(개념 모델과 book 저장) 구현 계획

> **Implement task-by-task with the test-driven-development skill.**
> 설계: [2026-11-03-study-my-textbook-design.md](2026-11-03-study-my-textbook-design.md) · 브랜치 `feat/study-my-textbook`

**Goal:** 개념 위계(`knowledge/concepts/cn-*.json`)와 개념별 교과서 페이지(`book/<경로>/README.md`)를 원자적으로 저장·변경·되돌리는 core와 `study_book` 도구, `/study-concepts` 명령, 무결성 검사를 추가한다.

**Architecture:** 새 기능 디렉터리 `src/book/`. 순수 규칙(`book-types`·`book-tree`·`book-page`·`book-render`)과 저장(`book-store`·`book-changes`)을 나누고, 모든 쓰기는 기존 `change-plan`(전후 내용·hash 비교·원자적 교체)을 거친다. 권한 주체(actor)는 호출 경로가 정한다: agent 도구는 `agent`, 사용자 명령은 `user`. 페이로드에서 받지 않는다.

**Tech Stack:** Node.js 22 TypeScript strip 실행(`node --test`), Pi extension API, typebox. 새 npm 의존성 없음.

**검증 상태:** 아래 코드는 extension 사본(`/tmp/study-plan-check`)에서 작성·실행해 확인했다. `tests/book/*` 12개 통과. 전체 389개 중 실패 1개는 사본 폴더 이름 때문에 `study/prompts` 경로 정규식이 맞지 않은 것이며, 실제 저장소 위치에서는 해당 없음.

**1단계 범위 밖(2단계 이후):** 시험 완료 follow-up, `instructions/book.md`, 대시보드(`book/README.md`), 명제 merge 시 `members` 동기화, 차이 링크 HTML, 렌더러와 `/study-book`.

## 공통 규칙

- 작업 위치: `runtime/pi/extensions/study`
- TS는 strip-only로 실행된다. **생성자 parameter property(`constructor(readonly x)`) 금지** — 사본 검증에서 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`로 실패함
- 포맷: `.prettierrc.json`(공백 2, 폭 100). 각 작업 커밋 전 `prettier --write`가 있으면 실행
- 개념 ID는 `cn-` 접두사(추론 사슬이 이미 `c-`를 씀)
- 쓰기 루트에 `book`을 추가한다. 프로젝트 경로가 `book/…`이면 기존 검증이 "공통 영역과 겹침"으로 거부한다(의도된 동작)

---
### Task 1: 쓰기 범위와 개념 타입

**TDD scenario:** 새 기능 — 전체 TDD 사이클. 기존 코드 1줄 변경 포함(먼저 기존 테스트 실행)

**Files:**
- Modify: `src/workspace/workspace-types.ts:6`
- Create: `src/book/book-types.ts`
- Create: `tests/book/book-fixture.ts`
- Test: `tests/book/book-page.test.ts` (이 작업에서는 이름 테스트만)

**Step 1: 기존 테스트 통과 확인**

Run: `node --test 'tests/**/*.test.ts' 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# fail 0`

**Step 2: 실패 테스트 작성** — `tests/book/book-fixture.ts`

```ts
import type { ConceptNode } from "../../src/book/book-types.ts";

export function conceptNode(overrides: Partial<ConceptNode> = {}): ConceptNode {
  return {
    schemaVersion: 1,
    id: "cn-area0001",
    version: 1,
    revisionId: "rev-1",
    parentRevisionIds: [],
    name: "동시성",
    parentId: null,
    owner: "user",
    order: 0,
    aliases: [],
    members: [],
    learnedIn: [],
    related: [],
    ...overrides,
  };
}
```

`tests/book/book-page.test.ts` 첫 내용:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConceptName, validateConceptNode } from "../../src/book/book-types.ts";
import { conceptNode } from "./book-fixture.ts";

test("concept names are NFC directory names without path characters", () => {
  assert.equal(normalizeConceptName("인터럽트".normalize("NFD")), "인터럽트");
  for (const bad of ["a/b", "..", ".hidden", "README.md", "", "x".repeat(61), "a:b"])
    assert.throws(() => normalizeConceptName(bad));
  assert.throws(() => validateConceptNode(conceptNode({ owner: "agent", parentId: null })), /사용자 소유/);
  assert.throws(() => validateConceptNode({ ...conceptNode(), extra: 1 } as any), /알 수 없는/);
});
```

**Step 3: 실패 확인**

Run: `node --test tests/book/book-page.test.ts`
Expected: FAIL — `Cannot find module …/src/book/book-types.ts`

**Step 4: 구현** — `src/book/book-types.ts`

```ts
/** Concept tree contracts for the textbook (book). Page bodies live in book/<path>/README.md. */
export type ConceptOwner = "user" | "agent";
export type LearnedIn = { projectId: string; chapterSlug: string; completedOn: string };

export type ConceptNode = {
  schemaVersion: 1;
  /** `cn-<uuid>`: stable across rename/move. */
  id: string;
  version: number;
  revisionId: string;
  parentRevisionIds: string[];
  name: string;
  /** null: top-level area (user-owned). */
  parentId: string | null;
  owner: ConceptOwner;
  order: number;
  aliases: string[];
  /** Knowledge ids that belong to this page. A proposition belongs to one page only. */
  members: string[];
  learnedIn: LearnedIn[];
  related: string[];
  retired?: { into?: string; at: string };
};

export const CONCEPT_ID = /^cn-[a-z0-9-]{4,64}$/;
const FORBIDDEN_NAME = /[\/\\:*?"<>|\u0000-\u001f]/;
const CHAPTER = /^ch-\d+-[a-z0-9-]+$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{2,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NODE_FIELDS = new Set([
  "schemaVersion", "id", "version", "revisionId", "parentRevisionIds", "name", "parentId",
  "owner", "order", "aliases", "members", "learnedIn", "related", "retired",
]);

export function validateConceptId(id: unknown): string {
  if (typeof id !== "string" || !CONCEPT_ID.test(id)) throw new Error(`개념 ID가 올바르지 않습니다: ${id}`);
  return id;
}

/** Names double as directory names: NFC (macOS stores NFD), no path characters. */
export function normalizeConceptName(name: unknown): string {
  if (typeof name !== "string") throw new Error("개념 이름이 필요합니다.");
  const value = name.normalize("NFC").trim();
  if (!value || value.length > 60) throw new Error("개념 이름은 1~60자여야 합니다.");
  if (FORBIDDEN_NAME.test(value) || value.startsWith(".") || value === "README.md")
    throw new Error(`개념 이름에 쓸 수 없는 문자가 있습니다: ${value}`);
  return value;
}

export function validateLearnedIn(value: LearnedIn): LearnedIn {
  if (!value || typeof value.projectId !== "string" || !PROJECT_ID.test(value.projectId))
    throw new Error(`projectId가 올바르지 않습니다: ${value?.projectId}`);
  if (typeof value.chapterSlug !== "string" || !CHAPTER.test(value.chapterSlug))
    throw new Error(`챕터 slug가 올바르지 않습니다: ${value.chapterSlug}`);
  if (typeof value.completedOn !== "string" || !DATE.test(value.completedOn))
    throw new Error(`completedOn은 YYYY-MM-DD여야 합니다: ${value.completedOn}`);
  return { projectId: value.projectId, chapterSlug: value.chapterSlug, completedOn: value.completedOn };
}

function ids(value: unknown, field: string, pattern: RegExp): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} 목록이 필요합니다.`);
  for (const id of value) if (typeof id !== "string" || !pattern.test(id)) throw new Error(`${field}의 ID가 올바르지 않습니다: ${id}`);
  if (new Set(value).size !== value.length) throw new Error(`${field}에 중복 ID가 있습니다.`);
  return value;
}

export function validateConceptNode(value: ConceptNode): ConceptNode {
  if (!value || typeof value !== "object") throw new Error("개념 노드가 올바르지 않습니다.");
  for (const key of Object.keys(value)) if (!NODE_FIELDS.has(key)) throw new Error(`알 수 없는 개념 필드입니다: ${key}`);
  if (value.schemaVersion !== 1) throw new Error("개념 schemaVersion은 1이어야 합니다.");
  validateConceptId(value.id);
  if (!Number.isInteger(value.version) || value.version < 1) throw new Error(`${value.id}: version이 올바르지 않습니다.`);
  if (typeof value.revisionId !== "string" || !value.revisionId) throw new Error(`${value.id}: revisionId가 필요합니다.`);
  if (value.name !== normalizeConceptName(value.name)) throw new Error(`${value.id}: 이름이 정규화되지 않았습니다.`);
  if (value.parentId !== null) validateConceptId(value.parentId);
  if (value.owner !== "user" && value.owner !== "agent") throw new Error(`${value.id}: owner가 올바르지 않습니다.`);
  if (value.parentId === null && value.owner !== "user") throw new Error(`${value.id}: 최상위 영역은 사용자 소유여야 합니다.`);
  if (!Number.isInteger(value.order)) throw new Error(`${value.id}: order가 올바르지 않습니다.`);
  if (!Array.isArray(value.aliases) || value.aliases.some((a) => typeof a !== "string")) throw new Error(`${value.id}: aliases가 올바르지 않습니다.`);
  ids(value.members, "members", /^k-[a-z0-9-]{4,64}$/);
  ids(value.related, "related", CONCEPT_ID);
  if (!Array.isArray(value.learnedIn)) throw new Error(`${value.id}: learnedIn 목록이 필요합니다.`);
  value.learnedIn.forEach(validateLearnedIn);
  if (value.retired && value.retired.into !== undefined) validateConceptId(value.retired.into);
  return value;
}
```

`src/workspace/workspace-types.ts:6`:

```ts
export const COMMON_WRITE_ROOTS = [".study", "knowledge", "review", "book"] as const;
```

**Step 5: 통과 확인**

Run: `node --test tests/book/book-page.test.ts && node --test tests/workspace/*.test.ts 2>&1 | grep -E '^# (pass|fail)'`
Expected: PASS, `# fail 0`

**Step 6: Commit**

```bash
git add src/book/book-types.ts src/workspace/workspace-types.ts tests/book/
git commit -m "feat(study): add concept node contract and book write root"
```

---
### Task 2: 개념 위계 규칙과 페이지 관리 영역

**TDD scenario:** 새 기능 — 전체 TDD 사이클

**Files:**
- Create: `src/book/book-tree.ts`, `src/book/book-page.ts`
- Test: `tests/book/book-page.test.ts` (전체로 교체)

**Step 1: 실패 테스트 작성** — `tests/book/book-page.test.ts` 전체

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBodySafe, parsePage, renderPage } from "../../src/book/book-page.ts";
import { normalizeConceptName, validateConceptNode } from "../../src/book/book-types.ts";
import { assertTree, pagePaths, relativeLink } from "../../src/book/book-tree.ts";
import { conceptNode } from "./book-fixture.ts";

test("page round-trips three managed regions and keeps notes byte-identical", () => {
  const content = renderPage({
    conceptId: "cn-aaaa1111",
    regions: { head: { body: "# 인터럽트" }, main: { body: "본문" }, foot: { body: "## 배운 곳" } },
    notes: "## 메모\n\n내 메모 — 그대로\n",
  });
  const page = parsePage(content);
  assert.equal(page.conceptId, "cn-aaaa1111");
  assert.equal(page.regions.main.body, "본문");
  assert.equal(page.regions.main.edited, false);
  assert.equal(page.notes, "## 메모\n\n내 메모 — 그대로\n");
  const edited = parsePage(content.replace("본문", "내가 고친 본문"));
  assert.equal(edited.regions.main.edited, true);
  assert.equal(edited.regions.head.edited, false);
});

test("page parsing refuses broken markers and bodies that smuggle markers", () => {
  assert.throws(() => parsePage("# no frontmatter\n"), /머리말/);
  const content = renderPage({ conceptId: "cn-aaaa1111", regions: { head: { body: "h" }, main: { body: "m" }, foot: { body: "f" } }, notes: "" });
  assert.throws(() => parsePage(content.replace("<!-- /study:book -->\n\n<!-- study:book region=main", "\n\n<!-- study:book region=main")), /닫히지|중복|손상/);
  assert.throws(() => parsePage(`${content}\n<!-- study:book region=main hash=000000000000 -->\n`), /중복|손상/);
  assert.throws(() => assertBodySafe("x <!-- /study:book --> y"), /관리 영역/);
});

test("concept names are NFC directory names without path characters", () => {
  assert.equal(normalizeConceptName("인터럽트".normalize("NFD")), "인터럽트");
  for (const bad of ["a/b", "..", ".hidden", "README.md", "", "x".repeat(61), "a:b"])
    assert.throws(() => normalizeConceptName(bad));
  assert.throws(() => validateConceptNode(conceptNode({ owner: "agent", parentId: null })), /사용자 소유/);
  assert.throws(() => validateConceptNode({ ...conceptNode(), extra: 1 } as any), /알 수 없는/);
});

test("tree rules: parents exist, no cycles, case-insensitive unique siblings, one page per proposition", () => {
  const area = conceptNode({ id: "cn-area0001", name: "동시성" });
  const a = conceptNode({ id: "cn-aaaa0001", name: "Thread", parentId: area.id, owner: "agent", members: ["k-1111aaaa"] });
  assertTree([area, a]);
  assert.throws(() => assertTree([a]), /상위 개념이 없습니다/);
  assert.throws(() => assertTree([area, a, conceptNode({ id: "cn-aaaa0002", name: "thread", parentId: area.id, owner: "agent" })]), /같은 이름/);
  assert.throws(() => assertTree([area, a, conceptNode({ id: "cn-aaaa0003", name: "B", parentId: area.id, owner: "agent", members: ["k-1111aaaa"] })]), /두 페이지/);
  const x = conceptNode({ id: "cn-xxxx0001", name: "X", parentId: "cn-yyyy0001", owner: "agent" });
  const y = conceptNode({ id: "cn-yyyy0001", name: "Y", parentId: "cn-xxxx0001", owner: "agent" });
  assert.throws(() => assertTree([x, y]), /순환/);
  assert.equal(pagePaths([area, a]).get(a.id), "book/동시성/Thread/README.md");
  assert.equal(relativeLink("book/동시성/Thread/README.md", "study-alpha/ch-01-intro/README.md"), "../../../study-alpha/ch-01-intro/README.md");
  assert.equal(relativeLink("book/a b/README.md", "book/README.md"), "../README.md");
});
```

**Step 2: 실패 확인**

Run: `node --test tests/book/book-page.test.ts`
Expected: FAIL — `book-page.ts`·`book-tree.ts` 모듈 없음

**Step 3: 구현** — `src/book/book-tree.ts`

```ts
import { posix } from "node:path";
import type { ConceptNode } from "./book-types.ts";

export const BOOK_DIR = "book";

/** Pure tree rules: parents exist, no cycles, unique sibling names, one page per proposition. */
export function assertTree(nodes: ConceptNode[]): void {
  const active = new Map(nodes.filter((n) => !n.retired).map((n) => [n.id, n]));
  const siblings = new Set<string>();
  const memberOf = new Map<string, string>();
  for (const node of active.values()) {
    if (node.parentId !== null && !active.has(node.parentId))
      throw new Error(`상위 개념이 없습니다: ${node.name} → ${node.parentId}`);
    const seen = new Set<string>([node.id]);
    for (let p = node.parentId; p !== null; p = active.get(p)!.parentId) {
      if (seen.has(p)) throw new Error(`개념 위계가 순환합니다: ${node.name}`);
      seen.add(p);
    }
    // macOS file systems are case-insensitive: compare lower-cased names.
    const key = `${node.parentId}\u0000${node.name.toLowerCase()}`;
    if (siblings.has(key)) throw new Error(`같은 상위 개념 아래에 같은 이름이 있습니다: ${node.name}`);
    siblings.add(key);
    for (const member of node.members) {
      const other = memberOf.get(member);
      if (other && other !== node.id)
        throw new Error(`지식 ${member}이(가) 두 페이지에 속합니다: ${active.get(other)!.name}, ${node.name}`);
      memberOf.set(member, node.id);
    }
  }
}

export function activeById(nodes: ConceptNode[]): Map<string, ConceptNode> {
  return new Map(nodes.filter((n) => !n.retired).map((n) => [n.id, n]));
}

/** Root → parent (exclusive of the node). */
export function ancestorsOf(byId: Map<string, ConceptNode>, node: ConceptNode): ConceptNode[] {
  const chain: ConceptNode[] = [];
  for (let p = node.parentId; p !== null; p = byId.get(p)!.parentId) chain.unshift(byId.get(p)!);
  return chain;
}

export function childrenOf(byId: Map<string, ConceptNode>, id: string | null): ConceptNode[] {
  return [...byId.values()]
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"));
}

export function pagePath(byId: Map<string, ConceptNode>, node: ConceptNode): string {
  return [BOOK_DIR, ...ancestorsOf(byId, node).map((n) => n.name), node.name, "README.md"].join("/");
}

export function pagePaths(nodes: ConceptNode[]): Map<string, string> {
  const byId = activeById(nodes);
  return new Map([...byId.values()].map((n) => [n.id, pagePath(byId, n)]));
}

/** Markdown link target from one root-relative file to another. */
export function relativeLink(fromFile: string, toFile: string): string {
  return posix.relative(posix.dirname(fromFile), toFile).split("/").map(encodeURIComponent).join("/");
}
```

`src/book/book-page.ts`:

```ts
import { sha256 } from "../workspace/atomic-file.ts";

/**
 * A book page = frontmatter + three managed regions + free notes.
 * head (breadcrumb, title, children) and foot (배운 곳) are generated;
 * main is the agent's rewritten body. Anything after the last region is the
 * learner's notes and is never rewritten.
 */
export type RegionId = "head" | "main" | "foot";
export const REGION_IDS: RegionId[] = ["head", "main", "foot"];
export type PageRegion = { body: string; hash: string; edited: boolean };
export type ParsedPage = { conceptId: string; regions: Record<RegionId, PageRegion>; notes: string };

const FRONTMATTER = /^---\nconcept: (cn-[a-z0-9-]{4,64})\n---\n/;
const OPEN = /<!-- study:book region=(head|main|foot) hash=([0-9a-f]{12}) -->\n/g;
const CLOSE = "<!-- /study:book -->";
const MARKER = /<!--\s*\/?study:book/;
export const DEFAULT_NOTES = "## 메모\n";

export function bodyHash(body: string): string {
  return sha256(body).slice(0, 12);
}

export function assertBodySafe(body: string): string {
  if (typeof body !== "string") throw new Error("페이지 본문은 문자열이어야 합니다.");
  if (body.length > 60_000) throw new Error("페이지 본문이 60000자를 넘습니다.");
  if (MARKER.test(body) || /^---\nconcept:/.test(body)) throw new Error("본문에 관리 영역 표시를 넣을 수 없습니다.");
  return body.trim();
}

export function region(id: RegionId, body: string, hash = bodyHash(body)): string {
  return `<!-- study:book region=${id} hash=${hash} -->\n${body}\n${CLOSE}`;
}

export function renderPage(page: { conceptId: string; regions: Record<RegionId, { body: string; hash?: string }>; notes: string }): string {
  const parts = REGION_IDS.map((id) => region(id, page.regions[id].body, page.regions[id].hash));
  const notes = page.notes.trim() ? page.notes.replace(/^\n+/, "") : DEFAULT_NOTES;
  return `---\nconcept: ${page.conceptId}\n---\n${parts.join("\n\n")}\n\n${notes.endsWith("\n") ? notes : `${notes}\n`}`;
}

export function parsePage(content: string): ParsedPage {
  const front = FRONTMATTER.exec(content);
  if (!front) throw new Error("교과서 페이지 머리말(concept)이 없습니다.");
  const regions = {} as Record<RegionId, PageRegion>;
  let end = front[0].length;
  for (const match of content.matchAll(OPEN)) {
    const id = match[1] as RegionId;
    if (regions[id]) throw new Error(`관리 영역이 중복됐습니다: ${id}`);
    const start = match.index! + match[0].length;
    const close = content.indexOf(`\n${CLOSE}`, start - 1);
    if (close < start - 1) throw new Error(`관리 영역이 닫히지 않았습니다: ${id}`);
    const body = content.slice(start, Math.max(start, close));
    if (MARKER.test(body)) throw new Error("관리 영역 표시가 손상됐습니다. 자동 수정하지 않습니다.");
    regions[id] = { body, hash: match[2], edited: bodyHash(body) !== match[2] };
    end = close + 1 + CLOSE.length;
  }
  for (const id of REGION_IDS) if (!regions[id]) throw new Error(`관리 영역이 없습니다: ${id}`);
  const notes = content.slice(end).replace(/^\n+/, "");
  if (MARKER.test(notes)) throw new Error("관리 영역 표시가 손상됐습니다. 자동 수정하지 않습니다.");
  return { conceptId: front[1], regions, notes };
}
```

**Step 4: 통과 확인**

Run: `node --test tests/book/book-page.test.ts`
Expected: `# pass 4`, `# fail 0`

**Step 5: Commit**

```bash
git add src/book/book-tree.ts src/book/book-page.ts tests/book/book-page.test.ts
git commit -m "feat(study): add concept tree rules and book page regions"
```

---
### Task 3: 개념 저장소와 head·foot 생성

**TDD scenario:** 새 기능 — 이 두 파일은 Task 4 테스트가 함께 검증한다(저장소는 얇은 I/O, 생성은 경로 결합만). 여기서는 구현만 하고 타입 검사로 끝낸다

**Files:**
- Create: `src/book/book-store.ts`, `src/book/book-render.ts`

**Step 1: 구현** — `src/book/book-store.ts`

```ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { validateConceptId, validateConceptNode, type ConceptNode } from "./book-types.ts";

export const CONCEPTS_DIR = "knowledge/concepts";
export const CONCEPT_HISTORY_DIR = "knowledge/concepts/history";
export const CONCEPT_CHANGES_DIR = "knowledge/concepts/changes";
const CHANGE_ID = /^[A-Za-z0-9_.-]{1,80}$/;

export const conceptPath = (id: string) => `${CONCEPTS_DIR}/${validateConceptId(id)}.json`;
export const conceptHistoryPath = (id: string) => `${CONCEPT_HISTORY_DIR}/${validateConceptId(id)}.jsonl`;
export function conceptChangePath(changeId: string): string {
  if (!CHANGE_ID.test(changeId)) throw new Error(`changeId 형식이 올바르지 않습니다: ${changeId}`);
  return `${CONCEPT_CHANGES_DIR}/${changeId}.json`;
}

export function abs(root: string, relative: string): string {
  return join(root, ...relative.split("/"));
}

export function encodeConcept(node: ConceptNode): string {
  return `${JSON.stringify(validateConceptNode(node), null, 2)}\n`;
}

export function decodeConcept(content: string, label: string): ConceptNode {
  try {
    return validateConceptNode(JSON.parse(content));
  } catch (error) {
    throw new Error(`개념 파일 손상: ${label} (${error instanceof Error ? error.message : error})`);
  }
}

/** All nodes including retired ones. Corrupt files throw; nothing is repaired. */
export async function loadConcepts(root: string): Promise<ConceptNode[]> {
  let names: string[];
  try {
    names = (await readdir(abs(root, CONCEPTS_DIR))).filter((n) => n.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nodes: ConceptNode[] = [];
  for (const name of names) {
    const relative = `${CONCEPTS_DIR}/${name}`;
    const node = decodeConcept((await readTextOptional(abs(root, relative)))!, relative);
    if (`${node.id}.json` !== name) throw new Error(`파일 이름과 개념 ID가 다릅니다: ${relative}`);
    nodes.push(node);
  }
  return nodes;
}
```

`src/book/book-render.ts`:

```ts
import type { WorkspaceProject } from "../workspace/workspace-types.ts";
import { ancestorsOf, BOOK_DIR, childrenOf, pagePath, relativeLink } from "./book-tree.ts";
import type { ConceptNode } from "./book-types.ts";

/** Generated breadcrumb, title and child list. Pure. */
export function renderHead(byId: Map<string, ConceptNode>, node: ConceptNode): string {
  const self = pagePath(byId, node);
  const crumbs = [
    `[교과서](${relativeLink(self, `${BOOK_DIR}/README.md`)})`,
    ...ancestorsOf(byId, node).map((a) => `[${a.name}](${relativeLink(self, pagePath(byId, a))})`),
    `**${node.name}**`,
  ];
  const children = childrenOf(byId, node.id);
  const list = children.length
    ? `\n\n## 하위 개념\n\n${children.map((c) => `- [${c.name}](${relativeLink(self, pagePath(byId, c))})`).join("\n")}`
    : "";
  return `${crumbs.join(" › ")}\n\n# ${node.name}${list}`;
}

/** Generated "배운 곳" list. Pure. */
export function renderFoot(
  byId: Map<string, ConceptNode>,
  node: ConceptNode,
  projects: WorkspaceProject[],
): string {
  if (!node.learnedIn.length) return "## 배운 곳\n\n- (아직 없음)";
  const self = pagePath(byId, node);
  const lines = [...node.learnedIn]
    .sort((a, b) => a.completedOn.localeCompare(b.completedOn))
    .map((l) => {
      const project = projects.find((p) => p.id === l.projectId);
      if (!project) return `- ${l.projectId} · ${l.chapterSlug} · ${l.completedOn} (프로젝트 없음)`;
      const link = relativeLink(self, `${project.path}/${l.chapterSlug}/README.md`);
      return `- [${project.slug} · ${l.chapterSlug}](${link}) · ${l.completedOn}`;
    });
  return `## 배운 곳\n\n${lines.join("\n")}`;
}
```

**Step 2: 로드 확인**

Run: `node -e 'import("./src/book/book-render.ts").then(()=>console.log("ok"))'`
Expected: `ok`

**Step 3: Commit**

```bash
git add src/book/book-store.ts src/book/book-render.ts
git commit -m "feat(study): add concept store and generated page head/foot"
```

---
### Task 4: 원자적 book 변경 (apply·undo)

**TDD scenario:** 새 기능 — 전체 TDD 사이클

**Files:**
- Create: `src/book/book-changes.ts`
- Test: `tests/book/book-changes.test.ts`

검증하는 계약:
- 한 changeId의 operations 묶음이 전부 적용되거나 전혀 적용되지 않음(실패 시 `treeDigest` 동일)
- 같은 changeId 재시도는 `already_applied`, 다른 내용이면 거부
- agent는 최상위 생성·사용자 소유 노드 rename/move/retire 불가 → `propose`는 `knowledge/concepts/proposals.jsonl`에 추가
- 기존 노드를 처음 건드릴 때 `expectedRevisionId` 불일치 → 거부
- 명제는 한 페이지에만(`assertTree`)
- rename/move는 페이지 파일을 옮기고 메모를 보존, 상위 페이지의 하위 목록도 갱신
- 직접 고친 `main`은 `write_page`로 덮지 않음 → `adopt_page` 후에만 새 기준
- `retire(into)`는 메모를 into 페이지로 옮기고 파일 삭제. 메모가 있는데 into가 없으면 거부
- undo는 기록된 파일이 그대로일 때만 전 내용으로 복원(노드는 새 버전으로), 이후 변경이 있으면 거부

**Step 1: 실패 테스트 작성** — `tests/book/book-changes.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { loadConcepts } from "../../src/book/book-store.ts";
import { parsePage } from "../../src/book/book-page.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { source } from "../support/knowledge-fixture.ts";
import { treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

const now = () => "2026-11-03T01:00:00.000Z";

async function setup(t: any) {
  const root = await workspaceFixture(t);
  const area = await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "동시성", parentId: null }] }, { now });
  const knowledge = await applyKnowledgeChange(root, {
    changeId: "k1",
    operation: "create",
    reason: "교재",
    item: { name: "인터럽트 플래그", statement: "s", conditions: [], scope: "", status: "confirmed", explanation: "", aliases: [], sources: [source()] },
  });
  return { root, area: area.nodes[0], k: knowledge.items[0] };
}

const read = (root: string, path: string) => readFile(join(root, ...path.split("/")), "utf8");

test("agent creates a sub-concept with a page in one atomic batch", async (t) => {
  const { root, area, k } = await setup(t);
  const result = await applyBookChange(root, "agent", {
    changeId: "a1",
    reason: "ch-01 완료",
    operations: [
      { op: "create", key: "intr", name: "인터럽트", parentId: area.id },
      { op: "place", id: "key:intr", knowledgeIds: [k.id] },
      { op: "write_page", id: "key:intr", body: "인터럽트는 협력적 취소 요청이다." },
      { op: "record_learned", id: "key:intr", learnedIn: { projectId: "p-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" } },
    ],
  }, { now });
  assert.equal(result.status, "committed");
  const path = "book/동시성/인터럽트/README.md";
  assert.deepEqual(result.pages.map((p) => [p.action, p.path]), [["updated", "book/동시성/README.md"], ["created", path]]);
  const page = parsePage(await read(root, path));
  assert.equal(page.regions.main.body, "인터럽트는 협력적 취소 요청이다.");
  assert.match(page.regions.head.body, /\[동시성\]\(\.\.\/README\.md\) › \*\*인터럽트\*\*/);
  assert.match(page.regions.foot.body, /\[study-alpha · ch-01-intro\]\(\.\.\/\.\.\/\.\.\/study-alpha\/ch-01-intro\/README\.md\) · 2026-11-03/);
  assert.match(parsePage(await read(root, "book/동시성/README.md")).regions.head.body, /- \[인터럽트\]\(%EC%9D%B8/);
  const node = (await loadConcepts(root)).find((n) => n.name === "인터럽트")!;
  assert.equal(node.owner, "agent");
  assert.deepEqual(node.members, [k.id]);
  const retry = await applyBookChange(root, "agent", { changeId: "a1", reason: "ch-01 완료", operations: [
    { op: "create", key: "intr", name: "인터럽트", parentId: area.id },
    { op: "place", id: "key:intr", knowledgeIds: [k.id] },
    { op: "write_page", id: "key:intr", body: "인터럽트는 협력적 취소 요청이다." },
    { op: "record_learned", id: "key:intr", learnedIn: { projectId: "p-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" } },
  ] }, { now });
  assert.equal(retry.status, "already_applied");
  assert.equal((await loadConcepts(root)).length, 2);
});

test("agent cannot create areas or restructure user-owned nodes, and a failed batch writes nothing", async (t) => {
  const { root, area, k } = await setup(t);
  const before = await treeDigest(root);
  await assert.rejects(applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "create", name: "DB", parentId: null }] }), /최상위 영역은 사용자만/);
  await assert.rejects(applyBookChange(root, "agent", { changeId: "a2", reason: "x", operations: [{ op: "rename", id: area.id, name: "병행성", expectedRevisionId: area.revisionId }] }), /propose/);
  await assert.rejects(applyBookChange(root, "agent", { changeId: "a3", reason: "x", operations: [
    { op: "create", key: "a", name: "A", parentId: area.id },
    { op: "place", id: "key:a", knowledgeIds: [k.id] },
    { op: "create", key: "b", name: "B", parentId: area.id },
    { op: "place", id: "key:b", knowledgeIds: [k.id] },
  ] }), /두 페이지/);
  assert.equal(await treeDigest(root), before);
  const proposed = await applyBookChange(root, "agent", { changeId: "a4", reason: "이름", operations: [{ op: "propose", id: area.id, message: "병행성으로 바꾸면 어떨까요" }] }, { now });
  assert.equal(proposed.status, "committed");
  assert.match(await read(root, "knowledge/concepts/proposals.jsonl"), /병행성/);
});

test("stale expected revision is rejected", async (t) => {
  const { root, area } = await setup(t);
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "write_page", id: area.id, body: "v1", expectedRevisionId: area.revisionId }] }, { now });
  await assert.rejects(
    applyBookChange(root, "agent", { changeId: "a2", reason: "x", operations: [{ op: "write_page", id: area.id, body: "v2", expectedRevisionId: area.revisionId }] }),
    /다른 변경이 먼저/,
  );
});

test("rename and move relocate page files with notes; edited body is never overwritten without adopt", async (t) => {
  const { root, area } = await setup(t);
  const created = await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [
    { op: "create", key: "t", name: "스레드", parentId: area.id },
    { op: "write_page", id: "key:t", body: "원래 본문" },
  ] }, { now });
  const node = created.nodes.find((n) => n.name === "스레드")!;
  const oldPath = join(root, "book", "동시성", "스레드", "README.md");
  await writeFile(oldPath, (await readFile(oldPath, "utf8")).replace("## 메모\n", "## 메모\n\n내 메모\n"));
  const renamed = await applyBookChange(root, "agent", { changeId: "a2", reason: "이름", operations: [{ op: "rename", id: node.id, name: "자바 스레드", expectedRevisionId: node.revisionId }] }, { now });
  assert.deepEqual(renamed.pages.find((p) => p.conceptId === node.id), { conceptId: node.id, path: "book/동시성/자바 스레드/README.md", action: "moved", from: "book/동시성/스레드/README.md" });
  assert.equal(existsSync(oldPath), false);
  const newPath = join(root, "book", "동시성", "자바 스레드", "README.md");
  assert.match(await readFile(newPath, "utf8"), /내 메모/);

  await writeFile(newPath, (await readFile(newPath, "utf8")).replace("원래 본문", "내가 고친 본문"));
  const current = (await loadConcepts(root)).find((n) => n.id === node.id)!;
  await assert.rejects(
    applyBookChange(root, "agent", { changeId: "a3", reason: "보강", operations: [{ op: "write_page", id: node.id, body: "에이전트 본문", expectedRevisionId: current.revisionId }] }),
    /직접 고친 본문/,
  );
  await applyBookChange(root, "agent", { changeId: "a4", reason: "수정본 채택", operations: [{ op: "adopt_page", id: node.id, expectedRevisionId: current.revisionId }] }, { now });
  const adopted = parsePage(await readFile(newPath, "utf8"));
  assert.equal(adopted.regions.main.body, "내가 고친 본문");
  assert.equal(adopted.regions.main.edited, false);
});

test("retire carries notes into the target page; undo restores files and nodes", async (t) => {
  const { root, area, k } = await setup(t);
  const made = await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [
    { op: "create", key: "a", name: "A", parentId: area.id },
    { op: "create", key: "b", name: "B", parentId: area.id },
    { op: "place", id: "key:a", knowledgeIds: [k.id] },
  ] }, { now });
  const [a, b] = ["A", "B"].map((name) => made.nodes.find((n) => n.name === name)!);
  const aPath = join(root, "book", "동시성", "A", "README.md");
  await writeFile(aPath, (await readFile(aPath, "utf8")).replace("## 메모\n", "## 메모\n\nA 메모\n"));
  const before = await treeDigest(root);
  await applyBookChange(root, "agent", { changeId: "a2", reason: "합치기", operations: [
    { op: "move_member", from: a.id, to: b.id, knowledgeIds: [k.id], expectedRevisionIds: { [a.id]: a.revisionId, [b.id]: b.revisionId } },
    { op: "write_page", id: b.id, body: "A와 B를 합친 본문" },
    { op: "retire", id: a.id, into: b.id },
  ] }, { now });
  assert.equal(existsSync(aPath), false);
  assert.match(await read(root, "book/동시성/B/README.md"), /### A에서 옮긴 메모\n\nA 메모/);
  assert.deepEqual((await loadConcepts(root)).find((n) => n.id === b.id)!.members, [k.id]);

  const undone = await applyBookChange(root, "user", { changeId: "u2", reason: "되돌리기", undo: "a2" }, { now });
  assert.equal(undone.status, "committed");
  assert.match(await readFile(aPath, "utf8"), /A 메모/);
  const nodes = await loadConcepts(root);
  assert.equal(nodes.find((n) => n.id === a.id)!.retired, undefined);
  assert.deepEqual(nodes.find((n) => n.id === a.id)!.members, [k.id]);
  assert.notEqual(await treeDigest(root), before); // history and change records grew
  await assert.rejects(applyBookChange(root, "user", { changeId: "u3", reason: "다시", undo: "a2" }), /이후 변경/);
});
```

**Step 2: 실패 확인**

Run: `node --test tests/book/book-changes.test.ts`
Expected: FAIL — `book-changes.ts` 모듈 없음

**Step 3: 구현** — `src/book/book-changes.ts`

```ts
import { randomUUID } from "node:crypto";
import { readTextOptional, sha256 } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "../workspace/change-plan.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import { loadItem } from "../knowledge/knowledge-store.ts";
import { assertBodySafe, bodyHash, DEFAULT_NOTES, parsePage, renderPage, type ParsedPage, type RegionId } from "./book-page.ts";
import { renderFoot, renderHead } from "./book-render.ts";
import {
  abs,
  conceptChangePath,
  conceptHistoryPath,
  conceptPath,
  CONCEPTS_DIR,
  encodeConcept,
  loadConcepts,
} from "./book-store.ts";
import { activeById, assertTree, pagePaths } from "./book-tree.ts";
import {
  normalizeConceptName,
  validateConceptId,
  validateLearnedIn,
  type ConceptNode,
  type ConceptOwner,
  type LearnedIn,
} from "./book-types.ts";

export type Actor = ConceptOwner;
/** Existing node id, or `key:<key>` for a node created earlier in the same batch. */
type NodeRef = string;
type Expect = { expectedRevisionId?: string };

export type BookOperation =
  | { op: "create"; key?: string; name: string; parentId: NodeRef | null; order?: number; aliases?: string[] }
  | ({ op: "rename"; id: NodeRef; name: string; aliases?: string[] } & Expect)
  | ({ op: "move"; id: NodeRef; parentId: NodeRef | null; order?: number } & Expect)
  | ({ op: "retire"; id: NodeRef; into?: NodeRef } & Expect)
  | ({ op: "place"; id: NodeRef; knowledgeIds: string[] } & Expect)
  | ({ op: "unplace"; id: NodeRef; knowledgeIds: string[] } & Expect)
  | ({ op: "move_member"; from: NodeRef; to: NodeRef; knowledgeIds: string[] } & { expectedRevisionIds?: Record<string, string> })
  | ({ op: "write_page"; id: NodeRef; body: string } & Expect)
  | ({ op: "adopt_page"; id: NodeRef } & Expect)
  | ({ op: "record_learned"; id: NodeRef; learnedIn: LearnedIn } & Expect)
  | { op: "propose"; id: NodeRef; message: string };

export type BookChangeRequest =
  | { changeId: string; reason: string; operations: BookOperation[] }
  | { changeId: string; reason: string; undo: string };

export type PageResult = { conceptId: string; path: string; action: "created" | "updated" | "moved" | "removed" | "kept_edited"; from?: string };

type FileRecord = { path: string; before: string | null; after: string | null };
export type BookChangeRecord = {
  changeId: string;
  reason: string;
  actor: Actor;
  at: string;
  payloadSha256: string;
  undoOf?: string;
  files: FileRecord[];
  pages: PageResult[];
  summary: string;
};

export type BookChangeResult = {
  status: "committed" | "already_applied";
  changeId: string;
  pages: PageResult[];
  nodes: ConceptNode[];
  summary: string;
};

export type BookApplyOptions = { now?: () => string };

const CHANGE_ID = /^[A-Za-z0-9_.-]{1,80}$/;
const KEY = /^[a-z0-9-]{1,32}$/;
export const PROPOSALS_FILE = `${CONCEPTS_DIR}/proposals.jsonl`;
const EMPTY_MAIN = "(아직 본문이 없습니다)";

function newRevision(): string {
  return `rev-${randomUUID()}`;
}

/** Mutable working copy of the tree for one batch. */
class Batch {
  readonly nodes = new Map<string, ConceptNode>();
  readonly keys = new Map<string, string>();
  readonly touched = new Set<string>();
  readonly created = new Set<string>();
  readonly writes = new Map<string, string>();
  readonly adopts = new Set<string>();
  readonly proposals: string[] = [];

  readonly actor: Actor;
  readonly at: string;

  constructor(actor: Actor, at: string, initial: ConceptNode[]) {
    this.actor = actor;
    this.at = at;
    for (const node of initial) this.nodes.set(node.id, structuredClone(node));
  }

  resolve(ref: NodeRef): ConceptNode {
    const id = ref.startsWith("key:") ? this.keys.get(ref.slice(4)) : ref;
    if (!id) throw new Error(`같은 변경에서 만든 개념 key를 찾지 못했습니다: ${ref}`);
    const node = this.nodes.get(validateConceptId(id));
    if (!node) throw new Error(`개념을 찾지 못했습니다: ${ref}`);
    if (node.retired) throw new Error(`폐기된 개념입니다: ${node.name}`);
    return node;
  }

  /** First touch of an existing node must name the revision the caller read. */
  touch(node: ConceptNode, expected: string | undefined): ConceptNode {
    if (!this.touched.has(node.id) && !this.created.has(node.id)) {
      if (node.revisionId !== expected)
        throw new Error(`다른 변경이 먼저 저장됐습니다. 개념을 다시 조회하세요: ${node.name} (현재 ${node.revisionId}, 기대 ${expected})`);
    }
    this.touched.add(node.id);
    return node;
  }

  /** Agents may not change the name or position of user-owned nodes. */
  guardStructure(node: ConceptNode, what: string): void {
    if (this.actor === "agent" && node.owner === "user")
      throw new Error(`사용자가 정한 개념은 에이전트가 ${what}할 수 없습니다: ${node.name}. propose로 제안하세요.`);
  }

  parent(ref: NodeRef | null): string | null {
    if (ref === null) {
      if (this.actor === "agent") throw new Error("최상위 영역은 사용자만 만들 수 있습니다. 기존 영역 아래에 만들거나 propose로 제안하세요.");
      return null;
    }
    return this.resolve(ref).id;
  }
}

async function requireActiveKnowledge(root: string, id: string): Promise<void> {
  const item = await loadItem(root, id);
  if (!item) throw new Error(`지식을 찾지 못했습니다: ${id}`);
  if (item.mergedInto) throw new Error(`병합된 지식은 페이지에 넣을 수 없습니다: ${id} → ${item.mergedInto}`);
}

async function runOperation(root: string, batch: Batch, op: BookOperation): Promise<void> {
  switch (op.op) {
    case "create": {
      if (op.key !== undefined && (!KEY.test(op.key) || batch.keys.has(op.key))) throw new Error(`create key가 올바르지 않거나 중복됐습니다: ${op.key}`);
      const parentId = batch.parent(op.parentId);
      const siblings = [...batch.nodes.values()].filter((n) => !n.retired && n.parentId === parentId);
      const node: ConceptNode = {
        schemaVersion: 1,
        id: `cn-${randomUUID()}`,
        version: 1,
        revisionId: newRevision(),
        parentRevisionIds: [],
        name: normalizeConceptName(op.name),
        parentId,
        owner: batch.actor,
        order: op.order ?? Math.max(0, ...siblings.map((s) => s.order + 1)),
        aliases: op.aliases ?? [],
        members: [],
        learnedIn: [],
        related: [],
      };
      batch.nodes.set(node.id, node);
      batch.created.add(node.id);
      batch.touched.add(node.id);
      if (op.key) batch.keys.set(op.key, node.id);
      return;
    }
    case "rename": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.guardStructure(node, "이름을 바꿀");
      node.name = normalizeConceptName(op.name);
      if (op.aliases) node.aliases = op.aliases;
      if (batch.actor === "user") node.owner = "user";
      return;
    }
    case "move": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.guardStructure(node, "옮길");
      node.parentId = batch.parent(op.parentId);
      if (op.order !== undefined) node.order = op.order;
      if (batch.actor === "user") node.owner = "user";
      return;
    }
    case "retire": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.guardStructure(node, "폐기");
      if ([...batch.nodes.values()].some((n) => !n.retired && n.parentId === node.id))
        throw new Error(`하위 개념이 있는 개념은 폐기할 수 없습니다. 먼저 옮기세요: ${node.name}`);
      if (node.members.length) throw new Error(`지식이 남아 있는 개념은 폐기할 수 없습니다. move_member로 옮기세요: ${node.name}`);
      const into = op.into ? batch.resolve(op.into) : undefined;
      if (into?.id === node.id) throw new Error("자기 자신으로 합칠 수 없습니다.");
      if (into) batch.touched.add(into.id);
      node.retired = { at: batch.at, ...(into ? { into: into.id } : {}) };
      return;
    }
    case "place": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      for (const id of op.knowledgeIds) await requireActiveKnowledge(root, id);
      node.members = [...new Set([...node.members, ...op.knowledgeIds])];
      return;
    }
    case "unplace": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      node.members = node.members.filter((m) => !op.knowledgeIds.includes(m));
      return;
    }
    case "move_member": {
      const from = batch.resolve(op.from);
      const to = batch.resolve(op.to);
      batch.touch(from, op.expectedRevisionIds?.[from.id]);
      batch.touch(to, op.expectedRevisionIds?.[to.id]);
      for (const id of op.knowledgeIds)
        if (!from.members.includes(id)) throw new Error(`${from.name}에 없는 지식입니다: ${id}`);
      from.members = from.members.filter((m) => !op.knowledgeIds.includes(m));
      to.members = [...new Set([...to.members, ...op.knowledgeIds])];
      return;
    }
    case "write_page": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.writes.set(node.id, assertBodySafe(op.body));
      return;
    }
    case "adopt_page": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.adopts.add(node.id);
      return;
    }
    case "record_learned": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      const entry = validateLearnedIn(op.learnedIn);
      if (!node.learnedIn.some((l) => l.projectId === entry.projectId && l.chapterSlug === entry.chapterSlug))
        node.learnedIn = [...node.learnedIn, entry];
      return;
    }
    case "propose": {
      const node = batch.resolve(op.id);
      if (typeof op.message !== "string" || !op.message.trim()) throw new Error("propose에는 message가 필요합니다.");
      batch.proposals.push(JSON.stringify({ conceptId: node.id, message: op.message.trim(), actor: batch.actor, at: batch.at }));
      return;
    }
    default:
      throw new Error(`지원하지 않는 작업입니다: ${(op as { op: string }).op}`);
  }
}

async function readPage(root: string, path: string): Promise<{ content: string; page: ParsedPage } | null> {
  const content = await readTextOptional(abs(root, path));
  return content === null ? null : { content, page: parsePage(content) };
}

/** Regenerate every active page; emit only real changes. Edited regions are never overwritten silently. */
async function planPages(root: string, batch: Batch, before: ConceptNode[]): Promise<{ files: PlannedChange[]; pages: PageResult[] }> {
  const after = [...batch.nodes.values()];
  const byId = activeById(after);
  const oldPaths = pagePaths(before);
  const newPaths = pagePaths(after);
  const projects = (await readWorkspace(root)).manifest.projects;
  const files: PlannedChange[] = [];
  const pages: PageResult[] = [];
  const carriedNotes = new Map<string, string[]>();

  for (const node of after.filter((n) => n.retired && batch.touched.has(n.id) && oldPaths.has(n.id))) {
    const path = oldPaths.get(node.id)!;
    const current = await readPage(root, path);
    const notes = current?.page.notes.trim() ?? "";
    if (current && notes && notes !== DEFAULT_NOTES.trim()) {
      if (!node.retired!.into) throw new Error(`메모가 있는 페이지는 into 없이 폐기할 수 없습니다: ${path}`);
      carriedNotes.set(node.retired!.into, [...(carriedNotes.get(node.retired!.into) ?? []), `### ${node.name}에서 옮긴 메모\n\n${notes.replace(/^## 메모\n+/, "")}`]);
    }
    if (current) {
      files.push({ path, after: null });
      pages.push({ conceptId: node.id, path, action: "removed" });
    }
  }

  const claimed = new Set<string>();
  for (const node of byId.values()) {
    const path = newPaths.get(node.id)!;
    const oldPath = oldPaths.get(node.id);
    const current = oldPath ? await readPage(root, oldPath) : null;
    if (oldPath !== path) {
      const occupant = await readPage(root, path).catch(() => ({ content: "", page: { conceptId: "?" } as ParsedPage }));
      const movingAway = [...oldPaths.entries()].some(([id, p]) => p === path && newPaths.get(id) !== path);
      if (occupant && !movingAway) throw new Error(`새 경로에 다른 파일이 있습니다: ${path}`);
    }
    if (claimed.has(path)) throw new Error(`두 개념이 같은 경로를 씁니다: ${path}`);
    claimed.add(path);

    const regions = {} as Record<RegionId, { body: string; hash?: string }>;
    let keptEdited = false;
    for (const id of ["head", "foot"] as const) {
      const generated = id === "head" ? renderHead(byId, node) : renderFoot(byId, node, projects);
      const existing = current?.page.regions[id];
      if (existing?.edited) {
        regions[id] = { body: existing.body, hash: existing.hash };
        keptEdited = keptEdited || existing.body !== generated;
      } else regions[id] = { body: generated };
    }
    const existingMain = current?.page.regions.main;
    const written = batch.writes.get(node.id);
    if (written !== undefined) {
      if (existingMain?.edited && !batch.adopts.has(node.id))
        throw new Error(`사용자가 직접 고친 본문입니다: ${path}. 덮어쓰지 않습니다. 수정본을 받아들일지(adopt_page) 사용자에게 물으세요.`);
      regions.main = { body: written };
    } else if (existingMain) {
      regions.main = batch.adopts.has(node.id) ? { body: existingMain.body } : { body: existingMain.body, hash: existingMain.hash };
    } else regions.main = { body: EMPTY_MAIN };

    const extra = carriedNotes.get(node.id);
    const baseNotes = current?.page.notes ?? DEFAULT_NOTES;
    const notes = extra ? `${baseNotes.trimEnd()}\n\n${extra.join("\n\n")}\n` : baseNotes;
    const content = renderPage({ conceptId: node.id, regions, notes });
    if (current && oldPath === path && current.content === content) continue;
    if (oldPath && oldPath !== path && current) files.push({ path: oldPath, after: null });
    files.push({ path, after: content });
    const action = !current ? "created" : oldPath !== path ? "moved" : keptEdited ? "kept_edited" : "updated";
    pages.push({ conceptId: node.id, path, action, ...(oldPath && oldPath !== path ? { from: oldPath } : {}) });
  }
  return { files, pages };
}

function bump(node: ConceptNode, created: boolean): ConceptNode {
  if (created) return node;
  return { ...node, version: node.version + 1, revisionId: newRevision(), parentRevisionIds: [node.revisionId] };
}

async function loadRecord(root: string, changeId: string): Promise<BookChangeRecord | null> {
  const content = await readTextOptional(abs(root, conceptChangePath(changeId)));
  return content === null ? null : JSON.parse(content);
}

async function historyAppend(root: string, node: ConceptNode, record: { changeId: string; reason: string; at: string }, operation: string): Promise<PlannedChange> {
  const path = conceptHistoryPath(node.id);
  const existing = (await readTextOptional(abs(root, path))) ?? "";
  return { path, after: `${existing}${JSON.stringify({ changeId: record.changeId, revisionId: node.revisionId, parentRevisionIds: node.parentRevisionIds, operation, reason: record.reason, at: record.at, snapshot: node })}\n` };
}

function summarizePages(pages: PageResult[]): string {
  return pages.map((p) => `${p.action} ${p.path}${p.from ? ` (← ${p.from})` : ""}`).join(", ") || "페이지 변경 없음";
}

async function computeBatch(root: string, actor: Actor, request: { changeId: string; reason: string; operations: BookOperation[] }, at: string) {
  if (!Array.isArray(request.operations) || !request.operations.length) throw new Error("operations가 필요합니다.");
  const before = await loadConcepts(root);
  const batch = new Batch(actor, at, before);
  for (const op of request.operations) await runOperation(root, batch, op);
  for (const id of batch.touched) {
    const node = batch.nodes.get(id)!;
    batch.nodes.set(id, bump(node, batch.created.has(id)));
  }
  assertTree([...batch.nodes.values()]);
  const { files, pages } = await planPages(root, batch, before);
  const changes: PlannedChange[] = [...files];
  for (const id of batch.touched) {
    const node = batch.nodes.get(id)!;
    changes.push({ path: conceptPath(id), after: encodeConcept(node) });
    changes.push(await historyAppend(root, node, { ...request, at }, request.operations.map((o) => o.op).join("+")));
  }
  if (batch.proposals.length) {
    const existing = (await readTextOptional(abs(root, PROPOSALS_FILE))) ?? "";
    changes.push({ path: PROPOSALS_FILE, after: `${existing}${batch.proposals.join("\n")}\n` });
  }
  return { changes, pages, nodes: [...batch.touched].map((id) => batch.nodes.get(id)!) };
}

/** Undo restores page files byte-for-byte and node content as a new version, only if nothing changed since. */
async function computeUndo(root: string, request: { changeId: string; reason: string; undo: string }, at: string) {
  const target = await loadRecord(root, request.undo);
  if (!target) throw new Error(`되돌릴 변경을 찾지 못했습니다: ${request.undo}`);
  const changes: PlannedChange[] = [];
  const nodes: ConceptNode[] = [];
  const pages: PageResult[] = [];
  for (const file of target.files) {
    const current = await readTextOptional(abs(root, file.path));
    if (current !== file.after) throw new Error(`이후 변경이 있어 되돌릴 수 없습니다: ${file.path}`);
    if (file.path.startsWith(`${CONCEPTS_DIR}/history/`) || file.path === PROPOSALS_FILE) continue;
    if (file.path.startsWith(`${CONCEPTS_DIR}/`)) {
      const now = JSON.parse(current!) as ConceptNode;
      const prior = file.before === null ? { ...now, retired: { at } } : (JSON.parse(file.before) as ConceptNode);
      const { schemaVersion: _s, id: _i, version: _v, revisionId: _r, parentRevisionIds: _p, ...content } = prior;
      const restored = { ...now, ...content, version: now.version + 1, revisionId: newRevision(), parentRevisionIds: [now.revisionId] } as ConceptNode;
      if (!("retired" in content)) delete restored.retired;
      changes.push({ path: file.path, after: encodeConcept(restored) });
      changes.push(await historyAppend(root, restored, { ...request, at }, "undo"));
      nodes.push(restored);
      continue;
    }
    changes.push({ path: file.path, after: file.before });
    const page = file.before === null ? null : parsePage(file.before);
    pages.push({ conceptId: page?.conceptId ?? "", path: file.path, action: file.before === null ? "removed" : file.after === null ? "created" : "updated" });
  }
  assertTree([...(await loadConcepts(root)).filter((n) => !nodes.some((x) => x.id === n.id)), ...nodes]);
  return { changes, pages, nodes };
}

/**
 * Apply one book change atomically: concept nodes, append-only history,
 * page files (create/move/regenerate), proposals and the change record.
 * `actor` comes from the caller (agent tool vs user command), never from the payload.
 */
export async function applyBookChange(root: string, actor: Actor, request: BookChangeRequest, options: BookApplyOptions = {}): Promise<BookChangeResult> {
  if (!request || !CHANGE_ID.test(request.changeId ?? "")) throw new Error("changeId가 필요합니다.");
  if (typeof request.reason !== "string" || !request.reason.trim()) throw new Error("reason(변경 이유)이 필요합니다.");
  const payloadSha256 = sha256(JSON.stringify({ actor, request }));
  const existing = await loadRecord(root, request.changeId);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256) throw new Error(`같은 changeId로 다른 변경을 적용할 수 없습니다: ${request.changeId}`);
    return { status: "already_applied", changeId: request.changeId, pages: existing.pages, nodes: [], summary: existing.summary };
  }
  const at = (options.now ?? (() => new Date().toISOString()))();
  const computed = "undo" in request ? await computeUndo(root, request, at) : await computeBatch(root, actor, request, at);
  const files: FileRecord[] = [];
  for (const change of computed.changes) files.push({ path: change.path, before: await readTextOptional(abs(root, change.path)), after: change.after });
  const summary = `${"undo" in request ? `undo ${request.undo}` : "apply"}: ${summarizePages(computed.pages)} — ${request.reason}`;
  const record: BookChangeRecord = { changeId: request.changeId, reason: request.reason, actor, at, payloadSha256, ...("undo" in request ? { undoOf: request.undo } : {}), files, pages: computed.pages, summary };
  const plan = await preparePlan(root, `book-${request.changeId}`, [...computed.changes, { path: conceptChangePath(request.changeId), after: `${JSON.stringify(record, null, 2)}\n` }]);
  await executePlan(root, plan);
  return { status: "committed", changeId: request.changeId, pages: computed.pages, nodes: computed.nodes, summary };
}

export { bodyHash };
```

**Step 4: 통과 확인**

Run: `node --test tests/book/book-changes.test.ts`
Expected: `# pass 5`, `# fail 0`

**Step 5: Commit**

```bash
git add src/book/book-changes.ts tests/book/book-changes.test.ts
git commit -m "feat(study): apply and undo concept-tree book changes atomically"
```

---
### Task 5: 무결성 검사·챕터 배치 계획·/study-concepts core

**TDD scenario:** 새 기능 — 전체 TDD 사이클

**Files:**
- Create: `src/book/book-integrity.ts`, `src/book/book-query.ts`, `src/book/concepts-command.ts`
- Test: `tests/book/book-integrity.test.ts`

**Step 1: 실패 테스트 작성** — `tests/book/book-integrity.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { checkBookIntegrity } from "../../src/book/book-integrity.ts";
import { planChapter } from "../../src/book/book-query.ts";
import { runConceptsCommand, type ConceptsUi } from "../../src/book/concepts-command.ts";
import { loadConcepts } from "../../src/book/book-store.ts";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { source } from "../support/knowledge-fixture.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

async function knowledge(root: string, changeId: string, name: string) {
  const { items } = await applyKnowledgeChange(root, { changeId, operation: "create", reason: "교재", item: { name, statement: `${name} s`, conditions: [], scope: "", status: "confirmed", explanation: "", aliases: [], sources: [source()] } });
  return items[0];
}

test("integrity reports missing pages, corrupt pages and conflict markers without repairing", async (t) => {
  const root = await workspaceFixture(t);
  assert.deepEqual(await checkBookIntegrity(root), []);
  await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "동시성", parentId: null }] });
  assert.deepEqual(await checkBookIntegrity(root), []);
  const page = join(root, "book", "동시성", "README.md");
  await writeFile(page, "# 손으로 덮어씀\n");
  assert.match((await checkBookIntegrity(root)).join("\n"), /교과서 페이지 손상: book\/동시성\/README\.md/);
  await rm(page);
  assert.match((await checkBookIntegrity(root)).join("\n"), /교과서 페이지가 없습니다/);
  const [node] = await loadConcepts(root);
  const file = join(root, "knowledge", "concepts", `${node.id}.json`);
  await writeFile(file, `<<<<<<< HEAD\n${await readFile(file, "utf8")}`);
  assert.match((await checkBookIntegrity(root)).join("\n"), /Git 충돌 표시/);
});

test("plan maps a chapter's propositions to existing pages and lists unplaced ones", async (t) => {
  const root = await workspaceFixture(t);
  const a = await knowledge(root, "k1", "인터럽트 플래그");
  const b = await knowledge(root, "k2", "InterruptedException");
  const area = (await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "동시성", parentId: null }] })).nodes[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "create", key: "i", name: "인터럽트", parentId: area.id }, { op: "place", id: "key:i", knowledgeIds: [a.id] }] });
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [a, b].map((k) => ({ id: k.id, version: k.version, revisionId: k.revisionId })) }] });
  const plan = await planChapter(root, "study-alpha", "ch-01-intro");
  assert.deepEqual(plan.pages.map((p) => [p.path, p.knowledge.map((k) => k.name)]), [["book/동시성/인터럽트/README.md", ["인터럽트 플래그"]]]);
  assert.deepEqual(plan.unplaced.map((k) => k.name), ["InterruptedException"]);
  assert.match(plan.tree, /- 동시성 \[사용자\][\s\S]*  - 인터럽트 · 지식 1/);
});

test("/study-concepts edits run as the user and take ownership", async (t) => {
  const root = await workspaceFixture(t);
  const notes: string[] = [];
  const ui = (answers: string[]): ConceptsUi => ({
    select: async (_title, options) => {
      const answer = answers.shift()!;
      return options.find((o) => o.trim().startsWith(answer));
    },
    input: async () => answers.shift(),
    notify: (message) => notes.push(message),
  });
  await runConceptsCommand(root, ui(["최상위 영역 만들기", "동시성"]));
  const area = (await loadConcepts(root))[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "create", name: "스레드", parentId: area.id }] });
  await runConceptsCommand(root, ui(["개념 이름 바꾸기", "스레드", "자바 스레드"]));
  const renamed = (await loadConcepts(root)).find((n) => n.name === "자바 스레드")!;
  assert.equal(renamed.owner, "user");
  await assert.rejects(
    applyBookChange(root, "agent", { changeId: "a2", reason: "x", operations: [{ op: "rename", id: renamed.id, name: "스레드", expectedRevisionId: renamed.revisionId }] }),
    /propose/,
  );
  await runConceptsCommand(root, ui(["개념 위계 보기"]));
  assert.match(notes.at(-1)!, /자바 스레드 \[사용자\]/);
});
```

주의: 가짜 `select`에서 `answers.shift()`를 `find` 콜백 안에서 부르면 옵션마다 소비된다. 위처럼 먼저 꺼낸다.

**Step 2: 실패 확인**

Run: `node --test tests/book/book-integrity.test.ts`
Expected: FAIL — 모듈 없음

**Step 3: 구현** — `src/book/book-integrity.ts`

```ts
import { readdir } from "node:fs/promises";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { loadItem } from "../knowledge/knowledge-store.ts";
import { parsePage } from "./book-page.ts";
import { abs, CONCEPTS_DIR, decodeConcept } from "./book-store.ts";
import { assertTree, pagePaths } from "./book-tree.ts";
import type { ConceptNode } from "./book-types.ts";

const CONFLICT = /^(<{7}|={7}|>{7})( |$)/m;

/** Read-only check run at session start. Never repairs. */
export async function checkBookIntegrity(root: string): Promise<string[]> {
  const issues: string[] = [];
  let names: string[] = [];
  try {
    names = (await readdir(abs(root, CONCEPTS_DIR))).filter((n) => n.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const nodes: ConceptNode[] = [];
  for (const name of names) {
    const relative = `${CONCEPTS_DIR}/${name}`;
    const content = (await readTextOptional(abs(root, relative)))!;
    if (CONFLICT.test(content)) {
      issues.push(`Git 충돌 표시가 남아 있습니다: ${relative}`);
      continue;
    }
    try {
      const node = decodeConcept(content, relative);
      if (`${node.id}.json` !== name) issues.push(`파일 이름과 개념 ID가 다릅니다: ${relative}`);
      nodes.push(node);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    assertTree(nodes);
  } catch (error) {
    issues.push(`교과서 개념 위계: ${error instanceof Error ? error.message : error}`);
  }
  for (const node of nodes.filter((n) => !n.retired)) {
    for (const id of node.members) {
      const item = await loadItem(root, id).catch(() => null);
      if (!item) issues.push(`교과서 개념이 없는 지식을 가리킵니다: ${node.name} → ${id}`);
      else if (item.mergedInto) issues.push(`교과서 개념에 병합된 지식이 남아 있습니다: ${node.name} → ${id} (→ ${item.mergedInto})`);
    }
  }
  let paths = new Map<string, string>();
  try {
    paths = pagePaths(nodes);
  } catch {
    return issues;
  }
  for (const [id, path] of paths) {
    const content = await readTextOptional(abs(root, path));
    if (content === null) {
      issues.push(`교과서 페이지가 없습니다: ${path}`);
      continue;
    }
    if (CONFLICT.test(content)) {
      issues.push(`Git 충돌 표시가 남아 있습니다: ${path}`);
      continue;
    }
    try {
      if (parsePage(content).conceptId !== id) issues.push(`교과서 페이지의 개념 ID가 다릅니다: ${path}`);
    } catch (error) {
      issues.push(`교과서 페이지 손상: ${path} (${error instanceof Error ? error.message : error})`);
    }
  }
  return issues;
}
```

`src/book/book-query.ts`:

```ts
import { loadAllItems } from "../knowledge/knowledge-store.ts";
import { loadBinding } from "../knowledge/chapter-bindings.ts";
import { loadConcepts } from "./book-store.ts";
import { activeById, childrenOf, pagePath } from "./book-tree.ts";
import type { ConceptNode } from "./book-types.ts";

export type TreeLine = { id: string; name: string; depth: number; owner: ConceptNode["owner"]; revisionId: string; path: string; members: number; chapters: number };

export async function bookTree(root: string): Promise<TreeLine[]> {
  const byId = activeById(await loadConcepts(root));
  const lines: TreeLine[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const node of childrenOf(byId, parent)) {
      lines.push({ id: node.id, name: node.name, depth, owner: node.owner, revisionId: node.revisionId, path: pagePath(byId, node), members: node.members.length, chapters: node.learnedIn.length });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines;
}

export function formatTree(lines: TreeLine[]): string {
  if (!lines.length) return "교과서 개념이 아직 없습니다. 사용자가 /study-concepts로 최상위 영역을 먼저 만듭니다.";
  return lines.map((l) => `${"  ".repeat(l.depth)}- ${l.name}${l.owner === "user" ? " [사용자]" : ""} · 지식 ${l.members} · 챕터 ${l.chapters} (${l.id}@${l.revisionId})`).join("\n");
}

export type BookPlan = {
  pages: Array<{ conceptId: string; name: string; path: string; revisionId: string; knowledge: Array<{ id: string; name: string }> }>;
  unplaced: Array<{ id: string; name: string }>;
  tree: string;
};

/** Where this chapter's propositions already live, and which have no page yet. */
export async function planChapter(root: string, projectSlug: string, chapterSlug: string): Promise<BookPlan> {
  const binding = await loadBinding(root, projectSlug, chapterSlug);
  const ids = [...new Set((binding?.regions ?? []).flatMap((r) => r.refs.map((ref) => ref.id)))];
  const names = new Map((await loadAllItems(root)).map((item) => [item.id, item.name]));
  const byId = activeById(await loadConcepts(root));
  const owner = new Map<string, ConceptNode>();
  for (const node of byId.values()) for (const m of node.members) owner.set(m, node);
  const pages = new Map<string, BookPlan["pages"][number]>();
  const unplaced: BookPlan["unplaced"] = [];
  for (const id of ids) {
    const node = owner.get(id);
    const entry = { id, name: names.get(id) ?? id };
    if (!node) {
      unplaced.push(entry);
      continue;
    }
    if (!pages.has(node.id)) pages.set(node.id, { conceptId: node.id, name: node.name, path: pagePath(byId, node), revisionId: node.revisionId, knowledge: [] });
    pages.get(node.id)!.knowledge.push(entry);
  }
  return { pages: [...pages.values()], unplaced, tree: formatTree(await bookTree(root)) };
}
```

`src/book/concepts-command.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { applyBookChange, PROPOSALS_FILE } from "./book-changes.ts";
import { bookTree, formatTree, type TreeLine } from "./book-query.ts";
import { abs } from "./book-store.ts";

export type ConceptsUi = {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, level: "info" | "warning" | "error"): void;
};

const ACTIONS = ["최상위 영역 만들기", "개념 이름 바꾸기", "개념 옮기기", "개념 위계 보기", "에이전트 제안 보기"] as const;

const label = (l: TreeLine) => `${"  ".repeat(l.depth)}${l.name}${l.owner === "user" ? " [사용자]" : ""}`;

async function pick(ui: ConceptsUi, lines: TreeLine[], title: string, extra: string[] = []): Promise<TreeLine | string | undefined> {
  const labels = [...extra, ...lines.map(label)];
  const choice = await ui.select(title, labels);
  if (choice === undefined) return undefined;
  if (extra.includes(choice)) return choice;
  return lines[labels.indexOf(choice) - extra.length];
}

const changeId = () => `user-${randomUUID()}`;

/** User-side tree editing. Runs with actor=user, so edited nodes become user-owned. */
export async function runConceptsCommand(root: string, ui: ConceptsUi): Promise<void> {
  const action = await ui.select("교과서 개념 위계", [...ACTIONS]);
  if (!action) return;
  const lines = await bookTree(root);
  if (action === "개념 위계 보기") return ui.notify(formatTree(lines), "info");
  if (action === "에이전트 제안 보기") {
    const content = (await readTextOptional(abs(root, PROPOSALS_FILE))) ?? "";
    const names = new Map(lines.map((l) => [l.id, l.name]));
    const items = content.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return ui.notify(items.map((p) => `- ${names.get(p.conceptId) ?? p.conceptId}: ${p.message} (${p.at.slice(0, 10)})`).join("\n") || "제안이 없습니다.", "info");
  }
  if (action === "최상위 영역 만들기") {
    const name = await ui.input("새 최상위 영역 이름", "예: 동시성");
    if (!name?.trim()) return;
    const result = await applyBookChange(root, "user", { changeId: changeId(), reason: "사용자가 최상위 영역을 만듦", operations: [{ op: "create", name, parentId: null }] });
    return ui.notify(result.summary, "info");
  }
  if (!lines.length) return ui.notify("개념이 없습니다. 먼저 최상위 영역을 만드세요.", "warning");
  const target = await pick(ui, lines, action === "개념 이름 바꾸기" ? "이름을 바꿀 개념" : "옮길 개념");
  if (!target || typeof target === "string") return;
  if (action === "개념 이름 바꾸기") {
    const name = await ui.input(`${target.name}의 새 이름`, target.name);
    if (!name?.trim() || name.trim() === target.name) return;
    const result = await applyBookChange(root, "user", { changeId: changeId(), reason: "사용자가 이름을 바꿈", operations: [{ op: "rename", id: target.id, name, expectedRevisionId: target.revisionId }] });
    return ui.notify(result.summary, "info");
  }
  const TOP = "(최상위로)";
  const parent = await pick(ui, lines.filter((l) => l.id !== target.id && !l.path.startsWith(target.path.replace(/README\.md$/, ""))), `${target.name}을(를) 어디 아래로 옮길까요?`, [TOP]);
  if (!parent) return;
  const parentId = parent === TOP ? null : (parent as TreeLine).id;
  const result = await applyBookChange(root, "user", { changeId: changeId(), reason: "사용자가 개념을 옮김", operations: [{ op: "move", id: target.id, parentId, expectedRevisionId: target.revisionId }] });
  ui.notify(result.summary, "info");
}

export function registerConceptsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("study-concepts", {
    description: "내 교과서의 개념 위계 정리 — 최상위 영역 만들기, 이름 바꾸기, 옮기기, 제안 보기",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const workspace = await requireWorkspace(ctx.cwd);
        await runConceptsCommand(workspace.root, ctx.ui);
      } catch (error) {
        ctx.ui.notify(`개념 위계를 바꾸지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, "warning");
      }
    },
  });
}
```

**Step 4: 통과 확인**

Run: `node --test tests/book/`
Expected: `# pass 12`, `# fail 0`

**Step 5: Commit**

```bash
git add src/book/book-integrity.ts src/book/book-query.ts src/book/concepts-command.ts tests/book/book-integrity.test.ts
git commit -m "feat(study): check book integrity, plan chapter placement and edit concepts as user"
```

---
### Task 6: study_book 도구와 진입점 연결

**TDD scenario:** 기존 테스트 수정 — 등록 목록 테스트를 먼저 바꿔 실패시킨 뒤 연결

**Files:**
- Create: `src/book/book-tools.ts`
- Modify: `index.ts` (import 3줄, `registerWorkspaceTools` 인자, `registerTextbookTools(pi);` 다음 2줄)
- Modify: `tests/integration/extension-registration.test.ts` (도구 목록에 `"study_book"`, 명령 목록에 `"study-concepts"`)
- Modify: `tests/integration/directory-layout.test.ts` (`features`에 `"book"`)

**Step 1: 테스트 변경**

`extension-registration.test.ts`의 도구 목록 `"study_knowledge",` 다음 줄에 `"study_book",`, 명령 목록을 다음으로:

```ts
    assert.deepEqual([...h.commands.keys()].sort(), [
      "study-chapter",
      "study-checkpoint",
      "study-concepts",
      "study-knowledge-graph",
      "study-map",
    ]);
```

`directory-layout.test.ts`:

```ts
const features = [
  "assessment",
  "book",
  "bridge",
```

**Step 2: 실패 확인**

Run: `NODE_PATH="$(npm root -g)" node --test tests/integration/extension-registration.test.ts 2>&1 | grep -E '^not ok|^# fail'`
Expected: `not ok … extension registers public tools and commands`

**Step 3: 구현** — `src/book/book-tools.ts`

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { applyBookChange, type BookChangeRequest } from "./book-changes.ts";
import { bookTree, formatTree, planChapter } from "./book-query.ts";

function parsePayload<T>(payloadJson: string | undefined): T {
  if (!payloadJson) throw new Error("payloadJson이 필요합니다.");
  try {
    return JSON.parse(payloadJson) as T;
  } catch {
    throw new Error("payloadJson이 올바른 JSON이 아닙니다.");
  }
}

export function registerBookTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "study_book",
    label: "Study Book",
    description:
      "개념 위계로 재구성하는 내 교과서(book/)를 조회(query)·챕터 배치 계획(plan)·변경(apply)합니다. apply는 operations 묶음을 changeId·reason과 함께 원자적으로 적용하며 undo로 되돌립니다. 최상위 영역과 사용자가 정한 개념의 이름·위치는 바꿀 수 없고 propose로 제안만 합니다.",
    promptSnippet: "Query, plan or apply the concept-tree textbook (book/) atomically",
    promptGuidelines: [
      "study_book apply는 에이전트 권한으로 실행됩니다. 최상위 영역 생성과 사용자 소유 개념의 이름·위치 변경은 거부되니 propose로 제안하세요.",
      "같은 지식(명제)은 교과서 한 페이지에만 속합니다. 이미 다른 페이지에 있으면 새 페이지를 만들지 말고 그 페이지를 보강하거나 move_member로 옮기세요.",
      "사용자가 직접 고친 본문은 덮어쓰지 않습니다. 거부되면 수정본을 받아들일지(adopt_page) 사용자에게 먼저 물으세요.",
    ],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("query"), Type.Literal("plan"), Type.Literal("apply")]),
      payloadJson: Type.Optional(
        Type.String({
          description:
            "query: 없음. plan: {projectSlug,chapterSlug}. apply: {changeId,reason,operations:[{op:create|rename|move|retire|place|unplace|move_member|write_page|adopt_page|record_learned|propose,...}]} 또는 {changeId,reason,undo:<changeId>}. 같은 묶음에서 만든 개념은 create의 key로 이름 붙여 'key:<key>'로 가리킴. 기존 개념을 처음 바꿀 때 expectedRevisionId 필수.",
        }),
      ),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await requireWorkspace(ctx?.cwd ?? process.cwd(), params.workspaceRoot);
      if (params.action === "query") {
        const tree = await bookTree(workspace.root);
        return { content: [{ type: "text", text: formatTree(tree) }], details: { tree } };
      }
      if (params.action === "plan") {
        const { projectSlug, chapterSlug } = parsePayload<{ projectSlug: string; chapterSlug: string }>(params.payloadJson);
        const plan = await planChapter(workspace.root, projectSlug, chapterSlug);
        const lines = [
          ...plan.pages.map((p) => `- 보강: ${p.path} (${p.conceptId}@${p.revisionId}) ← ${p.knowledge.map((k) => k.name).join(", ")}`),
          ...plan.unplaced.map((k) => `- 미배치: ${k.name} (${k.id})`),
          "",
          plan.tree,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }], details: plan };
      }
      const result = await applyBookChange(workspace.root, "agent", parsePayload<BookChangeRequest>(params.payloadJson));
      return { content: [{ type: "text", text: `${result.status}: ${result.summary}\nundo: {changeId:<새 id>, reason, undo:"${result.changeId}"}` }], details: result };
    },
  });
}
```

`index.ts`:

```ts
import { registerMapCommand } from "./src/knowledge/map-command.ts";
import { registerBookTools } from "./src/book/book-tools.ts";
import { registerConceptsCommand } from "./src/book/concepts-command.ts";
import { checkBookIntegrity } from "./src/book/book-integrity.ts";
```

```ts
  registerWorkspaceTools(pi, [checkKnowledgeIntegrity, checkBookIntegrity]);
  registerKnowledgeTools(pi, (root) => ({ extraChanges: (record) => reviewMergeChanges(root, record) }));
  registerTextbookTools(pi);
  registerBookTools(pi);
  registerConceptsCommand(pi);
```

**Step 4: 전체 통과 확인**

Run: `NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts' 2>&1 | grep -E '^not ok|^# (pass|fail|skipped)'`
Expected: `# fail 0`, `# skipped 0`

**Step 5: Commit**

```bash
git add src/book/book-tools.ts index.ts tests/integration/
git commit -m "feat(study): register study_book tool and /study-concepts command"
```

---

### Task 7: 문서

**TDD scenario:** 사소한 변경 — 판단으로 진행

**Files:**
- Modify: `README.md` (extension) — 명령 표에 `/study-concepts`, 구성 트리에 `src/book/`·`tests/book/`, study 루트 트리에 `knowledge/concepts/`·`book/`, "루트 공통 쓰기"에 `book/`, 도구 목록에 `study_book`
- Modify: `../../../../docs/plans/2026-11-03-study-my-textbook-design.md` — 상태 줄에 "1단계 구현 완료(커밋 해시)"

**Step 1: README 변경**

명령 표에 행 추가:

```markdown
| `/study-concepts` | 교과서 개념 위계 정리 | 메뉴: 최상위 영역 만들기·이름 바꾸기·옮기기·위계 보기·제안 보기 | — |
```

"명령은 6개" → "명령은 7개". study 루트 트리:

```text
├── knowledge/concepts/cn-*.json # 교과서 개념 노드 (위계·명제 소속·배운 곳)
├── knowledge/concepts/history/, changes/, proposals.jsonl
├── book/<영역>/…/README.md      # 개념별 교과서 페이지: head·main·foot 관리 영역 + 메모
```

"루트 공통 쓰기는 `.study/`, `knowledge/`, `review/`, `book/`만."

도구 목록에:

```markdown
- `study_book`: 교과서 위계 조회(query)·챕터 배치 계획(plan)·원자적 변경(apply: create/rename/move/retire/place/unplace/move_member/write_page/adopt_page/record_learned/propose, undo). agent 권한: 최상위 생성·사용자 소유 개념 구조 변경 불가, 직접 고친 본문 덮어쓰기 불가
```

**Step 2: 검증**

Run: `cd ../../../.. && bash scripts/check-resources && git diff --check`
Expected: 오류 없음

**Step 3: Commit**

```bash
git add runtime/pi/extensions/study/README.md docs/plans/2026-11-03-study-my-textbook-design.md
git commit -m "docs(study): document the concept-tree book foundation"
```

---

## 체크포인트: 상위 영역 정하기

1단계가 끝나면 `/reload` 후 사용자와 함께:

1. `/study-concepts` → "최상위 영역 만들기"로 상위 영역을 만든다(사용자)
2. agent가 `study_book query`로 위계를 보고, 기존 명제 10개(`study-java-threads`)를 어느 하위 개념에 둘지 `study_book apply`(create·place)로 제안·적용한다. 본문(`write_page`)은 2단계 지침이 생긴 뒤 쓴다
3. `study_workspace check`에서 교과서 관련 문제가 없는지 확인한다

그다음 2단계(완료 연결: follow-up·`instructions/book.md`·대시보드) 계획을 쓴다.
