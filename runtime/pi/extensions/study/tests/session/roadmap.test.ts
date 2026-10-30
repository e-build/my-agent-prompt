import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoadmap, roadmapRows } from "../../src/session/roadmap.ts";
import type { ChapterCatalog, CatalogChapter } from "../../src/session/chapter-catalog.ts";
import type { StudyPhase, StudyPhaseStatus } from "../../src/session/study-state.ts";

const PHASES: StudyPhase[] = ["diagnosis", "concept", "lab", "test", "review"];
function chapter(n: number, title: string, statuses: StudyPhaseStatus[] = [], active = false): CatalogChapter {
  const phases = Object.fromEntries(PHASES.map((p, i) => [p, statuses[i] ?? "not_started"])) as Record<StudyPhase, StudyPhaseStatus>;
  const next = PHASES.find((p) => !["completed", "skipped_understood"].includes(phases[p])) ?? "review";
  const num = String(n).padStart(2, "0");
  return { slug: `ch-${num}-x`, number: num, title, phases, next, active };
}
const catalog = (chapters: CatalogChapter[]): ChapterCatalog => ({ projectRoot: "/p/study-x", chapters });

// Shape used by study-thread-pool-from-scratch: chapter nodes inside phase subgraphs.
const threadPool = `# 스레드 풀
## 전체 커리큘럼
### Phase 1 — 기초: 최소 풀
- **ch-01 동시성 기초** — x
- **ch-02 첫 Executor** — x
### Phase 2 — 중급: 라이프사이클
- **ch-03 shutdownNow** — x
- **ch-04 와치독** — x
- **ch-05 ExecutorService** — x
## 개념 의존성 지도
\`\`\`mermaid
flowchart TD
    subgraph P1[Phase 1 — 기초]
        C01[ch-01 동시성 기초]
        C02[ch-02 첫 Executor]
    end
    subgraph P2[Phase 2 — 중급]
        C03[ch-03 shutdownNow]
        C04[ch-04 와치독]
        C05[ch-05 ExecutorService]
    end
    C01 --> C02
    C02 --> C03
    C03 --> C04
    C03 --> C05
    C04 --> C05
    C03 -.인터럽트 사유.-> C04
\`\`\`
`;

// Shape used by study-redis-read-through-lifecycle: concept nodes, chapter headings in phases.
const redis = `# 캐시
## Phase 1 — 기초: 캐시와 Redis
### Ch 01 — 캐시란 무엇인가
## Phase 2 — 중급: 패턴
### Ch 02 — 캐시 패턴
## 개념 의존성 지도
\`\`\`mermaid
flowchart TD
    CACHE["캐시의 본질<br/>(비싼 연산)"]
    LAND["캐시 패턴 지형"]
    CACHE --> LAND
\`\`\`
`;

// Shape used by study-backend-optimization-practical-case: concept nodes, chapters in subgraph titles.
const backend = `# 백엔드
## Phase 1 — 기초: 병목 식별
ch-01에서 측정한다.
## Phase 2 — 중급: 개선
ch-02, ch-03
## 개념 의존성 지도
\`\`\`mermaid
flowchart TD
    subgraph P1["Phase 1 — ch-01 식별/측정"]
        A1["CPU vs IO"] --> A2["코드 경로"]
    end
    subgraph P2["Phase 2 — ch-02/ch-03 개선"]
        B1["groupBy"]
    end
    A2 --> B1
\`\`\`
`;

test("phases come from README headings and dependencies from chapter nodes", () => {
  const model = parseRoadmap(threadPool, catalog([1, 2, 3, 4, 5].map((n) => chapter(n, `제목 ${n}`))));
  assert.deepEqual(model.phases.map((p) => [p.title, p.chapters]), [
    ["Phase 1 — 기초: 최소 풀", ["01", "02"]],
    ["Phase 2 — 중급: 라이프사이클", ["03", "04", "05"]],
  ]);
  assert.deepEqual(model.prerequisites.get("05"), ["03", "04"]);
  assert.deepEqual(model.prerequisites.get("04"), ["03"]);
  assert.equal(model.dependencySource, "chapters");
});

test("concept-only maps keep phases but never invent chapter dependencies", () => {
  const model = parseRoadmap(redis, catalog([chapter(1, "캐시"), chapter(2, "패턴")]));
  assert.deepEqual(model.phases.map((p) => p.chapters), [["01"], ["02"]]);
  assert.equal(model.prerequisites.size, 0);
  assert.equal(model.dependencySource, "concepts");
});

test("a subgraph naming exactly one chapter maps its concepts; ambiguous subgraphs are ignored", () => {
  const model = parseRoadmap(backend, catalog([1, 2, 3].map((n) => chapter(n, `c${n}`))));
  assert.deepEqual(model.phases.map((p) => p.chapters), [["01"], ["02", "03"]]);
  assert.equal(model.prerequisites.size, 0);
  assert.equal(model.dependencySource, "concepts");
});

test("chapters missing from the README are listed under a separate group", () => {
  const model = parseRoadmap("# 제목만\n", catalog([chapter(1, "a"), chapter(2, "b")]));
  assert.deepEqual(model.phases.map((p) => [p.title, p.chapters]), [["챕터", ["01", "02"]]]);
  assert.equal(model.dependencySource, "none");
});

test("rows show progress, status icons, the current chapter and its prerequisites", () => {
  const done: StudyPhaseStatus[] = ["completed", "completed", "completed", "completed", "completed"];
  const cat = catalog([
    chapter(1, "동시성 기초", done),
    chapter(2, "첫 Executor", ["completed", "skipped_understood", "skipped_understood", "skipped_understood", "skipped_understood"]),
    chapter(3, "shutdownNow", ["completed", "in_progress"], true),
    chapter(4, "와치독"),
    chapter(5, "ExecutorService"),
  ]);
  const rows = roadmapRows(parseRoadmap(threadPool, cat), cat, { maxRows: 40 });
  const text = rows.map((r) => r.text).join("\n");
  assert.match(text, /study-x/);
  assert.match(text, /완료 2 \/ 5/);
  assert.match(text, /✓ 01 동시성 기초/);
  assert.match(text, /– 02 첫 Executor/);
  assert.match(text, /▶ 03 shutdownNow · 개념/);
  assert.match(text, /선행: 02/);
  assert.match(text, /○ 05 ExecutorService/);
  assert.match(text, /\/study-map 다시 입력하면 닫힘/);
  assert.equal(rows.find((r) => r.text.includes("▶ 03"))?.tone, "accent");
  assert.equal(rows.find((r) => r.text.includes("✓ 01"))?.tone, "success");
});

test("a long roadmap keeps the current chapter visible within the row budget", () => {
  const chapters = Array.from({ length: 17 }, (_, i) => chapter(i + 1, `챕터 ${i + 1}`, [], i === 13));
  const rows = roadmapRows(parseRoadmap("", catalog(chapters)), catalog(chapters), { maxRows: 12 });
  assert.ok(rows.length <= 12);
  assert.ok(rows.some((r) => r.text.includes("▶ 14")));
  assert.ok(rows.some((r) => /…/.test(r.text)));
});
