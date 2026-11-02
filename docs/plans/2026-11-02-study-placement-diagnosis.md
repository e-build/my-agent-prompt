# Study 배치 진단 — /study-init 적응형 커리큘럼 구현 계획

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** `/study-init`이 커리큘럼을 확정하기 전에 학습자 수준을 대화로 확인(배치 진단)하고, 그 결과로 커리큘럼 범위·시작점을 정하며, 승인 뒤 챕터 진단이 배치 결과를 이어받도록 study extension과 지침을 수정.

**Architecture:** 배치 진단은 **프로젝트 등록 전**에 일어나므로 study 루트의 질문·근거 저장소(`study_question_prepare`)를 쓰지 않고 프로젝트 디렉터리 `.study/placement.json`에 독립 저장. 순수 상태 전이(`src/placement/placement-state.ts`)와 파일 저장(`placement-store.ts`), Pi 도구(`placement-tools.ts`)를 분리. 기존 `dialogue-state.ts`의 상한·종료 사유 규칙을 같은 계약으로 재사용. 커리큘럼 미리보기는 `CurriculumPreview.placement`로 진단 근거를 표시. 승인·자동 등록 흐름은 변경 없음.

**Tech Stack:** TypeScript, Node.js 22 `node:test`·`node:assert/strict`, 기존 Pi `ExtensionAPI`·TypeBox·`writeFileAtomic`. 새 라이브러리 추가 없음.

---

## 목차

- [전제와 범위](#전제와-범위)
- [문제 정의](#문제-정의)
- [설계 계약](#설계-계약)
- [공통 TDD 실행 규칙](#공통-tdd-실행-규칙)
- [Phase 1 — 설계 문서 정정](#phase-1--설계-문서-정정)
- [Phase 2 — 배치 진단 저장소와 도구](#phase-2--배치-진단-저장소와-도구)
- [Phase 3 — 미리보기와 지침 연결](#phase-3--미리보기와-지침-연결)
- [Phase 4 — 파일럿과 마무리](#phase-4--파일럿과-마무리) — 결정 ③에 따라 Task 9의 1차 파일럿은 Task 2 직후 실행
- [하지 않는 것](#하지-않는-것)
- [진행 체크리스트](#진행-체크리스트)

## 전제와 범위

2026-11-02 Plannotator Inbox에서 사용자가 확정한 결정.

| 결정 | 확정 값 | 반영 Task |
|---|---|---|
| ① 커리큘럼 범위 | 진단 기반 최소 경로. 건너뛴 범위는 근거와 함께 미리보기에 표시 | Task 2·6 |
| ② 배치 진단 상한 | 8문항, 경로가 정해지면 조기 종료, 재개해도 초기화 없음 | Task 3 |
| ③ 도입 순서 | 문서·프롬프트(Task 1~2) → 파일럿(Task 9) → extension 확장(Task 3~8) | Task 순서 |
| ④ 수업 중 커리큘럼 변경 | 수정 제안 + `study_curriculum_open` 재호출로 재승인 | Task 8 |
| ⑤ 기존 thread-pool 산출물 | 미리보기 승인하지 않고 생성 파일 전부 삭제. `reference/`만 유지 | 2026-11-02 삭제 완료, 파일럿은 `/study-init`부터 다시 시작 |

실행 순서: Task 1 → Task 2 → Task 9(파일럿, 도구 없이 프롬프트만으로) → Task 3~8 → Task 9 재확인 → Task 10.

- 작업 위치: `P` = `runtime/pi/extensions/study/`. 아래 `src/`, `tests/`, `index.ts`, `prompts/`, `instructions/`, `assets/`, `README.md`는 `P` 기준
- 기준 HEAD: `c8030a5`. 기준 테스트: **348 tests / 348 pass / 0 fail** (`NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts'`, 2026-11-02 실행)
- 브랜치: 기존 구현 계획과 같이 `main`에서 작업. push 없음
- 실제 학습 저장소 `/Users/jimmylee/IdeaProjects/study` 변경은 Task 9 파일럿에서만, 사용자와 같이 진행

## 문제 정의

- 현재 `/study-init`은 브리프 5문항(목적·수준·범위·자료·스택) 자기보고만 받고 "기초부터 전문가 수준까지" 고정 틀로 커리큘럼을 만든 뒤 승인을 받음. 학습자의 실제 수준을 확인하는 진단은 **승인 후** ch-01에서 처음 수행
- 결과: 수준·직전 답변이 커리큘럼에 반영되지 않음. 원인은 설계 문서(`2026-10-30-study-learnharness-design.md` "입력 → 커리큘럼 승인 → 진단", `research.md` 71행 "전체 커리큘럼과 분리")와 `study-init.md`에 그대로 남아 있음
- 기술적 제약: `src/evidence/question-store.ts:64 resolveLocation`이 등록된 프로젝트를 요구하고, 등록은 커리큘럼 승인이 동의. 따라서 승인 전 진단은 기존 질문 저장소를 쓸 수 없음
- 참고한 외부 설계: LearnHarness(AGPL-3.0)의 "목표 구체화 → 갈래(strand) → 높은 수준부터 bracketing → 진단 요약 → 최소 계획" 순서. **아이디어만 반영**하며 프롬프트 문장·코드는 복사하지 않음

## 설계 계약

### 1. 흐름

```text
브리프 → 자료 조사(선수 갈래 도출) → 배치 진단(대화, 상한 8) → 진단 요약 확인
→ 최소 경로 커리큘럼 → 미리보기(진단 근거 표시) → 승인·자동 등록
→ ch-01 챕터 진단(배치 결과 이어받기, 미확인만 보강) → 개념 → 실습 → 시험 → 통합 복습
```

- 배치 진단은 **프로젝트 단위 1회**. 챕터 진단은 기존대로 챕터 단위
- 배치 진단 질문은 지식 명제 참조 없이 가능. 승인·등록 뒤 공통 지식이 생기면 `study_answer_record kind:"link"`로 연결(선택)
- 자기보고(브리프 "수준")와 실제 확인(배치 진단 결과)을 문서와 미리보기에서 구분 표기

### 2. 저장

```text
<projectRoot>/.study/placement.json      # 배치 진단 1개 시도 묶음. 채점 기준 포함 (비공개)
<projectRoot>/.study/project.json        # manifest에 placement 요약(공개 부분) 보존
```

- `placement.json`은 `writeFileAtomic`과 SHA-256 CAS(`expectedSha256`)로 쓰기. 손상 JSON은 재생성하지 않고 오류
- 등록된 루트의 `change-plan`은 사용하지 않음(등록 전이라 루트가 없을 수 있음). 심볼릭 링크 경유 쓰기는 `safeProjectWritePath`로 거부

### 3. 타입

```ts
// src/placement/placement-state.ts — 순수 상태 전이
export const DEFAULT_PLACEMENT_LIMIT = 8;
export type PlacementStrand = { id: string; name: string; why: string };
export type PlacementQuestion = {
  id: string;            // q-<sha(requestId)20자>
  requestId: string;
  strandId: string;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  scored: boolean;
  criteria: { answer: string; acceptable: string[]; rubric: string; conditions: string[] } | null;
  askedAt: string;
};
export type PlacementAnswer = {
  questionId: string;
  response: string;
  responseAnchor: string;
  assistance: "independent" | "hinted" | "explained" | "unknown";
  result: "demonstrated" | "partial" | "incorrect" | "unverified";  // scored=false면 unverified만
  reason: string;
  at: string;
};
export type PlacementRun = {
  schemaVersion: 1;
  id: string;
  projectSlug: string;
  limit: number;
  status: "open" | "finished";
  strands: PlacementStrand[];
  questions: PlacementQuestion[];
  answers: PlacementAnswer[];
  startedAt: string;
  finishedAt?: string;
  endReason?: DiagnosisEndReason;           // dialogue-state.ts 재사용
  route?: LearningRoute;                    // dialogue-state.ts 재사용
  unverified: string[];
};
export type PublicPlacement = Omit<PlacementRun, "questions"> & {
  questions: Array<Omit<PlacementQuestion, "criteria">>;
};
```

```ts
// CurriculumPreview 확장 (prompts/study-init.md, assets/curriculum-template.html, project-manifest.ts)
placement?: {
  summary: string;
  startAt: string;
  focus: string[];
  skip: Array<{ what: string; reason: string }>;
  unverified: string[];
  questionCount: number;
  selfReportedLevel?: string;   // 브리프 자기보고
};
```

### 4. 도구

`study_placement` 1개. 등록 전이라 `projectRoot`(절대 경로) 필수.

| action | payloadJson | 효과 |
|---|---|---|
| `get` | — | 공개 부분만 반환(채점 기준 제외) |
| `start` | `{projectSlug, strands:[{id,name,why}], limit?}` | 열린 시도가 있으면 오류. 종료된 시도가 있으면 사용자 요청 시에만 새 시도 |
| `prepare` | `{requestId, strandId, prompt, options?, scored, criteria?}` | 채점 기준을 먼저 저장하고 공개 질문만 반환. 같은 requestId는 저장된 질문 반환, 내용이 다르면 오류. 상한 초과 시 오류 |
| `record` | `{questionId, response, responseAnchor, assistance, result, reason}` | 질문당 1회. 비채점 질문은 `unverified`만 허용 |
| `finish` | `{reason, route?, unverified}` | `dialogue-state.ts`와 같은 종료 규칙 |

## 공통 TDD 실행 규칙

1. Task마다 기존 관련 테스트를 먼저 실행해 통과 확인
2. RED: `node:test`로 실패 테스트 작성. fixture는 `tests/support/workspace-fixture.ts`의 `tempDir` 사용, 실제 임시 디렉터리
3. GREEN: 최소 구현. 테스트가 요구하지 않는 옵션·추상화 추가 금지
4. 회귀: `NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts'`
5. 커밋: Task Files만 명시적 `git add`, `git diff --cached --check` 통과 후 커밋. `git add .`·push 금지

## Phase 1 — 설계 문서 정정

### Task 1: 설계 문서와 결정 기록 갱신

**Files**
- Modify: `docs/plans/2026-10-30-study-learnharness-design.md` ("1. 학습 흐름", "입력", "진단 — Pi 대화")
- Modify: `docs/plans/learnharness-study/decisions.md` ("사용자가 선택한 방향" 표)
- Modify: `docs/plans/learnharness-study/research.md` (71행 '계획' 행)

**Steps**
1. `design.md` 흐름을 `입력 → 배치 진단 → 커리큘럼 승인 → 챕터 진단 → …`으로 변경. "입력" 절에 배치 진단 1문단 추가: 프로젝트 단위 1회, 상한 8, 등록 전 프로젝트 디렉터리에 저장, 챕터 진단이 결과를 이어받음
2. `decisions.md` 표에 행 추가: "커리큘럼 확정 전 배치 진단" — 근거는 2026-11-02 대화(사용자 피드백 "사용자 수준과 직전 답변을 고려"). 아직 답을 받지 못한 5개 결정은 "현재 제안과 미결 사항"에 전제값과 함께 기록
3. `research.md` 71행 "전체 커리큘럼과 분리"에 "2026-11-02 배치 진단 도입으로 대체" 표시. 행 삭제 없음
4. `me-docs-readability` 규칙 확인: 목차 링크, 명사형 마무리, 이모티콘 없음
5. Commit: `docs(study): put placement diagnosis before curriculum approval`

**완료 기준:** 세 문서가 같은 흐름을 말하고, 이전 결정이 삭제 없이 대체 표시됨.

### Task 2: `/study-init` 프롬프트 수정

**Files**
- Modify: `prompts/study-init.md`
- Test: `tests/integration/learning-instructions.test.ts`

**Steps**
1. 테스트 추가(RED):
   ```ts
   test("study-init runs a placement diagnosis before the curriculum is fixed", async () => {
     const text = await read("prompts/study-init.md");
     assert.match(text, /## 3\. .*배치 진단/);
     assert.match(text, /study_placement/);
     assert.match(text, /상한 8/);
     assert.match(text, /placement\?:/);          // CurriculumPreview 필드
     assert.match(text, /자기보고/);
     assert.doesNotMatch(text, /기초부터 전문가 수준까지/);
     assert.doesNotMatch(text, /진단은 .*미룬다|나중에 진단/);
   });
   ```
   기존 테스트 57~66행(`사전진단 — Pi 대화`, `자동 등록`)은 계속 통과해야 함
2. `study-init.md` 수정 범위:
   - "묻지 않는 것"의 진단 미루기 문구 삭제. 브리프 "수준"은 자기보고로 표기
   - "3. 커리큘럼 설계 전 리서치"를 3a 자료 조사(선수 갈래 3~5개 도출, 각 갈래에 why) → 3b 배치 진단 → 3c 경로 확정으로 분리
   - 3b 규칙: `study_placement start`로 갈래 등록 → 한 번에 하나 질문, 직전 답에 따라 다음 질문 선택, 높은 수준 질문부터 시작해 틀리면 한 단계 아래 확인, 상한 8, 경로가 정해지면 조기 종료, 설명 요청·건너뛰기 허용, 미확인은 이해로 간주 금지 → 진단 요약을 학습자에게 보여 주고 확인 받기 → `finish`
   - `study_placement` 도구 없을 때 가드: `study_curriculum_open` 가드와 같은 3줄 안내, workaround 금지
   - "4. README.md": "기초부터 전문가 수준까지" → "배치 진단 결과로 정한 시작점부터 목표까지의 최소 경로". 건너뛴 범위는 README "건너뛴 범위와 근거" 표로 남김
   - CurriculumPreview schema에 `placement?` 추가. 정상 흐름 3단계에 "placement에 진단 요약을 넣는다" 추가
   - "설계 근거" 절에 자기보고와 실제 확인 구분 규칙
3. GREEN 확인 후 Commit: `feat(study): ask a placement diagnosis before fixing the curriculum`

**완료 기준:** 프롬프트만으로도 (도구가 없을 때) 배치 진단을 대화로 수행하고 커리큘럼에 반영하는 절차가 완결됨.

## Phase 2 — 배치 진단 저장소와 도구

### Task 3: 순수 상태 전이

**Files**
- Create: `src/placement/placement-state.ts`
- Test: `tests/placement/placement-state.test.ts`

**Steps**
1. 테스트(RED):
   - `createPlacement`: 상한 기본 8, 1~20 밖이면 오류, 갈래 0개면 오류, 갈래 id 중복 오류
   - `addQuestion`: 같은 requestId·같은 내용은 동일 run 반환(멱등), 같은 requestId·다른 내용 오류, 상한 도달 시 오류, 모르는 strandId 오류, `scored=true`인데 criteria 없으면 오류, finished면 오류
   - `recordAnswer`: 없는 questionId 오류, 중복 답 오류, 비채점 질문에 `demonstrated` 오류, assistance 검증
   - `finishPlacement`: `limit_reached`는 상한 도달 시에만, `route_decided`는 route 필수, `user_request`는 route 선택, 두 번 종료 오류
   - `publicPlacement`: criteria가 결과에 없음(`JSON.stringify` 후 `/criteria/` 미검출)
   - `restorePlacement`: 손상 JSON·중복 question id·상한 초과 기록 오류
2. 구현: `dialogue-state.ts`의 `DiagnosisEndReason`, `LearningRoute`를 import해 재사용. 질문 id는 `question-store.ts`의 `questionIdFor`와 같은 규칙(`q-` + sha256(requestId) 20자). 중복 구현을 피하려면 `questionIdFor`를 `src/evidence/question-id.ts`로 분리해 양쪽에서 import(이동 시 `tests/evidence/question-store.test.ts` 회귀 확인)
3. Commit: `feat(study): add placement diagnosis state machine`

### Task 4: 파일 저장소

**Files**
- Create: `src/placement/placement-store.ts`
- Test: `tests/placement/placement-store.test.ts`

**Steps**
1. 테스트(RED), 임시 프로젝트 디렉터리 fixture:
   - `loadPlacement(projectRoot)`: 파일 없음 → `null`, 손상 JSON → 오류(재생성 없음)
   - `savePlacement(projectRoot, run, expectedSha256)`: 처음 저장은 `null` 전제, 다른 쓰기가 먼저 일어나면 "덮어쓰지 않습니다" 오류(기존 `writeFileAtomic` 메시지)
   - `preparePlacementQuestion(projectRoot, input)`: 기준 저장 후 공개 질문 반환, 저장 실패 시 파일 변화 없음(`treeDigest` 비교), 재시도 시 같은 질문
   - 심볼릭 링크 `.study` 경유 쓰기 거부(`safeProjectWritePath`)
2. 구현: `loadPlacement`·`currentSha256` → 전이 함수 적용 → `writeFileAtomic(path, json, { expectedSha256 })`. 경로는 `safeProjectWritePath(projectRoot, ".study/placement.json")`
3. Commit: `feat(study): store placement diagnosis beside the project manifest`

### Task 5: `study_placement` 도구와 등록

**Files**
- Create: `src/placement/placement-tools.ts`
- Modify: `index.ts` (`registerPlacementTools(pi)`)
- Test: `tests/placement/placement-tools.test.ts`, `tests/integration/extension-registration.test.ts`

**Steps**
1. `extension-registration.test.ts`의 도구 목록에 `"study_placement"` 추가(RED). 같은 파일의 host 테스트에 `start → prepare → get(criteria 없음 확인) → record → finish` 호출 1건 추가
2. `placement-tools.test.ts`: `registerTool` 스텁으로 `execute` 직접 호출. `projectRoot`가 상대 경로면 오류, `payloadJson` JSON 오류 메시지, `get` 결과에 `criteria` 없음
3. 구현: TypeBox 파라미터 `action`·`projectRoot`·`payloadJson`. `promptGuidelines` 2줄 — "반환한 공개 질문만 보여 주고 채점 기준을 말하지 않음", "비채점 질문은 unverified만 기록"
4. Commit: `feat(study): register the study_placement tool`

**완료 기준:** 등록되지 않은 프로젝트 디렉터리만으로 배치 진단 전 과정이 도구로 기록됨.

## Phase 3 — 미리보기와 지침 연결

### Task 6: CurriculumPreview `placement` 표시와 manifest 보존

**Files**
- Modify: `assets/curriculum-template.html`, `src/project/project-manifest.ts`
- Test: `tests/project/project-manifest.test.ts`, `tests/curriculum/curriculum-core.test.ts`

**Steps**
1. 테스트(RED):
   - `manifestFromCurriculum`: payload에 `placement`가 있으면 manifest에 같은 값 보존, 없으면 필드 없음
   - `curriculum-core.test.ts`: 실제 `assets/curriculum-template.html`을 읽어 `id="placementPanel"`과 `data.placement` 참조가 있는지 확인(렌더링은 브라우저 JS라 문자열 검사까지만)
2. 템플릿: "학습 설계 요약" 아래 "진단 근거" 패널 추가 — 시작점, 집중, 건너뜀(what·reason), 미확인, 질문 수, 자기보고 수준. `placement`가 없으면 패널 숨김. 기존 escape 함수 재사용
3. Commit: `feat(study): show placement evidence in the curriculum preview`

### Task 7: 챕터 진단이 배치 결과를 이어받기

**Files**
- Modify: `src/session/dialogue-prompt.ts`, `src/session/study-command.ts` (`diagnosisStatus`)
- Modify: `src/evidence/existing-record-links.ts` (`kind: "placement"` 추가)
- Test: `tests/session/dialogue-prompt.test.ts`, `tests/session/study-command.test.ts`, `tests/evidence/existing-record-links.test.ts`

**Steps**
1. 테스트(RED):
   - `buildDialogueStatus({ …, placement })`: 배치 요약(시작점·건너뜀·미확인)이 포함되고 채점 기준은 없음. `placement`가 없으면 기존 출력과 동일
   - `diagnosisStatus`: `target.projectRoot/.study/placement.json`이 있으면 요약 포함
   - `linkExistingRecord`: `kind: "placement"`, `recordPath: ".study/placement.json"`로 지식 연결 가능
2. 구현: `loadPlacement`는 등록 여부와 무관하게 `projectRoot`에서 읽음. 상태 문구에 "미확인 항목만 챕터 진단으로 보강, 확인된 항목은 다시 묻지 않음" 지침 1줄
3. Commit: `feat(study): carry placement results into the chapter diagnosis`

### Task 8: 진단 지침과 README

**Files**
- Modify: `instructions/diagnosis.md`, `README.md`
- Test: `tests/integration/learning-instructions.test.ts`

**Steps**
1. 테스트(RED): `diagnosis.md`에 `/배치 진단/`, `/study_curriculum_open/`(커리큘럼 수정 제안 재승인) 포함. 기존 단언(`최소 문항 수 없음`, `상한 8문항` 등) 유지
2. `diagnosis.md`: "배치 결과가 있으면" 절 — 확인된 갈래 생략, 미확인만 질문, 결과가 승인된 커리큘럼과 어긋나면 수정 제안을 말로 하고 동의 시 README·챕터 수정 후 `study_curriculum_open` 재호출(전제 ④)
3. `README.md`: 명령 표 `/study-init` 행에 배치 진단, "상태 파일"에 `placement.json`, 구성 트리에 `src/placement/`
4. Commit: `docs(study): document placement diagnosis and curriculum revision`

## Phase 4 — 파일럿과 마무리

### Task 9: thread-pool 프로젝트 파일럿

**Files**
- `/Users/jimmylee/IdeaProjects/study/study-thread-pool-from-scratch/` — 현재 `reference/`만 존재. 이전 산출물은 2026-11-02 삭제

두 번 실행한다. 1차는 Task 2 직후 **도구 없이** 프롬프트 절차만으로, 2차는 Task 8 뒤 `study_placement`까지 포함해서.

**1차 (Task 2 직후)**
1. `/reload` 후 새 세션에서 `/study-init`을 처음부터 다시 실행. 브리프는 이전 답(목적=원리 체득·동료 설명, 수준=용어만 앎(자기보고), 규모=3~5챕터, JDK 25+Gradle) 재사용 가능
2. 배치 진단은 대화로만 진행하고 질문·답·판정을 README "배치 진단 기록" 절에 임시로 남김(도구가 없으므로). 채점 기준은 답을 듣기 전에 에이전트가 메시지에 쓰지 않음
3. 갈래 예시(에이전트가 자료 조사로 확정): 스레드 생명주기·`synchronized`와 가시성·`wait/notify`·`BlockingQueue`·`ExecutorService` 계약. 첫 질문은 상위 수준부터(예: "스레드 두 개가 `count++`를 10만 번씩 하면 결과?" → 답에 따라 `volatile`·`synchronized`로 분기)
4. 진단 요약 확인 후 README·챕터 README를 최소 경로로 생성(건너뛴 범위 표 포함), `placement`를 넣어 `study_curriculum_open` 호출. 미리보기 패널은 아직 없으므로 JSON만 확인
5. 관찰 결과를 `docs/plans/study-learnharness-verification.md` "배치 진단 파일럿" 절에 기록(실제 질문 수, 조기 종료 여부, 프롬프트만으로 부족했던 점). 이 기록이 Task 3~8의 요구 조정 근거

**2차 (Task 8 뒤)**
6. 1차에서 승인했다면 등록된 상태. `.study/placement.json`이 없으므로 README의 임시 기록을 보고 `study_placement`로 옮길지 사용자와 결정. 승인하지 않았다면 처음부터 도구로 재실행
7. `/study-chapter 01 진단`에서 배치 요약이 보이고 확인된 갈래를 다시 묻지 않는지 확인

### Task 10: 검증 기록과 체크리스트 마감

**Files**
- Modify: `docs/plans/study-learnharness-verification.md`, 이 문서의 체크리스트

**Steps**
1. 전체 테스트 실행 결과(테스트 수 변화 포함)와 `bash scripts/check-resources`, `git diff --check` 기록
2. Commit: `docs(study): record placement diagnosis verification`

## 하지 않는 것

- 기존 등록 프로젝트의 소급 배치 진단. 등록 후 프로젝트는 챕터 진단만 사용
- 배치 진단의 브라우저 UI. 대화형만
- `study_question_prepare`의 등록 요구 완화. 배치 진단은 별도 저장소로 해결
- 배치 결과를 공통 지식 명제로 자동 저장. 학습자 답변은 지식이 아님
- LearnHarness 프롬프트·코드 복사

## 진행 체크리스트

- [ ] Task 1 설계 문서 정정
- [ ] Task 2 `study-init.md`
- [ ] Task 3 `placement-state.ts`
- [ ] Task 4 `placement-store.ts`
- [ ] Task 5 `study_placement` 도구
- [ ] Task 6 미리보기·manifest
- [ ] Task 7 챕터 진단 연계
- [ ] Task 8 `diagnosis.md`·README
- [ ] Task 9 파일럿
- [ ] Task 10 검증 기록
