# Study LearnHarness Implementation Plan

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** 승인된 학습 흐름과 중앙 지식·통합 복습·교재 갱신을 기존 study extension에 추가하고 기존 학습 기록을 안전하게 연결.

**Architecture:** 순수 상태 전이·검증과 파일 저장·Pi 도구·브라우저 adapter 분리. 기존 HTML 시험과 lab은 유지하고 대화형 진단만 새 경로로 전환. 공통 자료는 명시적으로 등록한 study 루트에 보관하며, 미등록 프로젝트는 기존 기능을 유지하고 자동 이전하지 않음.

**Tech Stack:** TypeScript, Node.js 22의 `node:test`·`node:assert/strict`·파일/crypto 표준 라이브러리, 기존 Pi `ExtensionAPI`·TypeBox·loopback browser bridge. 새 DB·LLM SDK·그래프 라이브러리 추가 없음.

---

## 목차

- [실행 범위와 기준선](#실행-범위와-기준선)
- [구현 전에 고정할 계약](#구현-전에-고정할-계약)
- [공통 TDD 실행 규칙](#공통-tdd-실행-규칙)
- [Phase A — 저장 기반](#phase-a--저장-기반)
- [Phase B — 지식과 교재](#phase-b--지식과-교재)
- [Phase C — 질문·근거·대화형 진단](#phase-c--질문근거대화형-진단)
- [Phase D — 통합 복습](#phase-d--통합-복습)
- [Phase E — 기존 기능 연결](#phase-e--기존-기능-연결)
- [Phase F — 지도·위젯·이전 도구](#phase-f--지도위젯이전-도구)
- [Phase G — 지침·회귀·완료](#phase-g--지침회귀완료)
- [실제 데이터 이전은 별도 작업](#실제-데이터-이전은-별도-작업)
- [진행 체크리스트](#진행-체크리스트)

## 실행 범위와 기준선

- 설계 정본: [2026-10-30-study-learnharness-design.md](2026-10-30-study-learnharness-design.md)
- **사용자 지정: main에서 작업. 새 브랜치·worktree 생성 없음.** 일반 스킬의 격리 작업 공간 권장보다 이 지시 우선
- 현재 요청은 **구현 계획 작성**. 아래 코드 변경·커밋 명령은 이후 구현할 때 실행하는 절차
- 실제 `/Users/jimmylee/IdeaProjects/study` 쓰기·환경 변경·migration 실행·push는 포함하지 않음
- 기준 HEAD: `01d0428`. 계획 작성 시작 시 작업 트리 깨끗함
- 기준 테스트 실제 실행 결과: **137 tests / 137 pass / 0 fail / 0 skipped**. 신규 테스트의 개수는 실행 결과로만 보고
- `P` = `runtime/pi/extensions/study/`. 아래 `src/`, `tests/`, `index.ts`, `instructions/`, `prompts/`, `assets/`, `README.md` 경로는 모두 `P` 기준
- `resources/skills/tool/study-dialogue/`는 저장소 루트 기준

```bash
# 저장소 루트
cd runtime/pi/extensions/study
NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts'
```

## 구현 전에 고정할 계약

승인된 원칙을 구현 가능한 형태로 구체화한 계약. 교육 정책을 새로 선택하는 단계가 아님.

### 1. 무변경 읽기와 호환

- workspace 탐색·질문 조회·지도 조회는 폴더·state·cache를 만들지 않음
- `.study/workspace.json` 없는 기존 프로젝트: lab·HTML test·기존 review 조회 유지. 새 공통 지식 쓰기는 등록 필요 오류
- 손상된 JSON을 파일 없음으로 취급하여 재생성하지 않음. `ENOENT`만 신규 생성 경로로 처리
- 기존 `study_diagnosis_open`과 옛 HTML 라우트는 재개·호환용 유지. 새 진단 지침에서는 호출하지 않음
- 프로젝트 `state.json` v1은 계속 읽고, 원래 알 수 없는 필드도 round-trip 보존. 실제 이전 중 state를 재직렬화하지 않음

### 2. ID·버전·원본

```ts
// src/knowledge/knowledge-types.ts — 아래 필드가 최소 계약
export type KnowledgeRef = { id: string; version: number; revisionId: string };
export type KnowledgeItem = {
  schemaVersion: 1;
  id: string;                 // k-${randomUUID()}; short ID는 표시용만
  version: number;            // 지식별 증가 번호
  revisionId: string;         // 충돌 판별용 변경 ID
  parentRevisionIds: string[];
  name: string;
  statement: string;
  conditions: string[];
  scope: string;
  status: "confirmed" | "uncertain" | "conflicted" | "retired";
  explanation: string;
  aliases: string[];
  sources: SourceRef[];
  mergedInto?: string;
};
export type SourceRef = {
  materialId: string;
  kind: "url" | "workspace-file" | "external-file" | "teacher";
  locator: string;            // 상대 파일+문단 또는 URL+위치
  observedAt: string;
  digest?: string;
  basis: "explicit" | "derived" | "hypothesis";
};
```

- Markdown 파일은 고정 형식의 JSON 메타데이터 구역 + 설명 본문. 범용 YAML parser 추가 없음
- 최신 item은 현재 버전의 materialized view. 불변 history snapshot으로 재구성 가능
- history 한 줄은 `changeId`, `revisionId`, `parentRevisionIds`, 전체 item snapshot, 이유, 시각 포함
- 숫자 v2만으로는 두 PC의 서로 다른 v2를 구별할 수 없음. 근거는 `revisionId`까지 참조하고, 둘의 충돌은 검사로 중단
- 추론 사슬은 `{id, premiseRefs[], conclusionRef, sourceRefs, revisionId}`. 입력 순서와 무관한 전제 집합 중복 탐지, 직접 자기 추론·병합 redirect 순환 거부
- 선수 학습은 프로젝트의 경로 기록, 활용 맥락은 챕터 binding. `chains.jsonl`에 혼합하지 않음

### 3. 질문과 근거

```ts
// src/evidence/evidence-types.ts
export type Assistance = "independent" | "hinted" | "explained" | "unknown";
export type Demonstration = "demonstrated" | "partial" | "incorrect" | "unverified";
export type Evidence = {
  id: string;
  questionId: string;
  submittedAt: string;
  response: string;
  responseAnchor: string;     // 현재 대화 메시지 또는 원본 기록 위치
  assistance: Assistance;
  context: { projectId: string; chapterSlug: string; kind: string };
  findings: Array<{ ref: KnowledgeRef; result: Demonstration; reason: string }>;
  chainFindings: Array<{ chainId: string; revisionId: string; result: Demonstration }>;
  correctionOf?: string;
};
```

- question prepare는 비공개 기준을 먼저 저장한 뒤 공개 prompt/options만 반환
- 답을 기록하는 도구는 에이전트가 실제 메시지를 근거로 호출. JSON 구조 검증이 학습자가 답했다는 사실까지 증명한다고 주장하지 않음
- 도움·부분 정답·미응답을 구분. 점수만 보고 기억 수준 추정 금지
- 정답 정정은 새 기준 revision과 사유를 추가. 이미 기록된 답·최초 판정은 보존

### 4. 복습 시간 계산

- 간격 `[1, 3, 7, 14]`는 **이전 실제 수행일 이후의 달력 날짜 차이**. 모든 날짜를 최초 날짜에 더하는 방식 아님. 기존 redis의 기준일 누적 날짜 표를 이 규칙으로 소급 해석하지 않음
- 최초 일정: 챕터 완료일 +1. 독립 정답 시 다음 간격, 오답·힌트 후 정답이면 해당 날 +1로 재시작
- `partial`은 해당 명제의 회상 부족으로 +1 재시작. `unverified`·도움 불명·문항 무효는 일정 유지
- 마지막 회차의 독립 정답 후 `completed`. 같은 내용 재등장만으로 완료 주기 재시작 없음
- timestamp(UTC ISO)와 local date(`YYYY-MM-DD`)·IANA timezone을 함께 저장. 날짜 덧셈은 calendar arithmetic. `24h * n` 사용 금지
- 중단·미응답·아직 학습하지 않은 내용은 자동 오답 아님
- 한 질문에 여러 명제가 있어도 명제별 일정. 전체 추론 성공은 chain evidence로 따로 기록

### 5. 구현 보완 사항과 범위

- `revisionId`는 승인 설계의 숫자 버전에 **추가하는 기술 보완**. 두 PC가 각각 v2를 쓴 경우를 구분하기 위함이며 사용자 운영 정책 변경 아님
- 최초 지도는 읽기 전용 SVG+표. 렌더러 라이브러리보다 검증 가능한 최소 구현 우선
- 에이전트 판단과 코드 검증 분리: 후보 추출·의미 동일성·채점은 현재 Pi 에이전트가 수행. core는 입력 구조·출처·참조·버전·원 응답 보존만 검증. 추가 LLM 프로세스 없음
- 학습 자료는 파일/디렉터리/URL locator를 등록하고 현재 에이전트의 읽기·fetch 결과를 출처로 연결. 접근하지 못한 자료는 별도 표시. 새 crawler나 디렉터리 전체 자동 수집 없음
- `.study/local/cache`만 자유 재생성 가능. `pending`의 진행 중 변경 계획은 캐시가 아니며 해결 전에 삭제 금지

### 6. 도구 표면 — 작은 도구를 묶되 의미는 명시

| 도구/명령 | 인자·역할 |
|---|---|
| `study_workspace` | `action: inspect|initialize|recover|check`, `workspaceRoot?`, `requestId?`. initialize/recover는 현재 세션에서 명시 승인된 요청만 |
| `study_knowledge` | `action: query|apply|undo`, `payloadJson`. 쓰기는 기대 revision·reason·출처 필수. 자동 지식 반영은 사후 요약 |
| `study_question_prepare` | `payloadJson`: 목적, 공개 질문, 비공개 기준, refs, 경로 또는 복습 대상. 반환은 공개 부분만 |
| `study_answer_record` | `payloadJson`: questionId, 원 응답, 근거 위치, 도움·명제별 판정, 멱등 제출 ID |
| `study_learning_route` | `action: get|update|finish_diagnosis|finish_concept`, `chapterSlug`, `payloadJson?` |
| `study_textbook_refresh` | `chapterSlug`, `regionIds?`. 자동 관리 영역만 적용 |
| `study_review_next` | `projectId?`, `chapterSlug?`. 기한 경과·오늘 대상의 묶음 제안, 정답 없음 |
| `study_migrate` | `action: preview|apply|undo`, `workspaceRoot`, `planId?`, `requestId?`. apply/undo는 승인 gate 필수 |
| `/study-map` | 현재 workspace의 읽기 전용 지도 열기 |
| `/study-workspace` | inspect/init/check/recover 진입과 쓰기 승인 발급. 자동 initialize 없음 |

`/study-review`는 prompt resource로 유지해 명령 중복 등록 방지. 기존 refresh/pack alias는 registered workspace에서 통합 navigation, 미등록은 legacy로 분기.

- `query`의 기본 결과는 이름·상태·연결만. statement/criteria를 읽는 agent용 조회와 학습자 공개 DTO를 분리. 지도·위젯의 기본값도 공개 DTO
- `study_knowledge apply`에 포함한 change plan은 새 명제·수정 이력·병합·관계·출처를 함께 검증. workspace ID와 상대 경로를 server/core가 계산하며 agent에게 arbitrary write path를 받지 않음
- 공통 설정은 초기 기본값만 저장. 진행 중 일정의 간격·시간대를 나중에 설정 변경만으로 소급 변경하지 않도록 일정 snapshot에 고정
- 등록되지 않은 legacy 프로젝트의 새 대화형 진단은 먼저 등록 필요를 안내. 기존 HTML pending 재개와 이미 제공되던 lab/test는 유지. 임의의 새 workspace를 만들지 않음

## 공통 TDD 실행 규칙

각 Task는 아래 순서로 실행. 각 번호는 하나의 작은 행동이며 한 번에 전체 단계를 작성하지 않음.

1. **기존 테스트 먼저:** 수정하는 기존 기능의 테스트 실행. 아직 없는 파일을 먼저 추가하지 않음
2. **RED:** 아래 시나리오를 `node:test`와 실제 임시 fixture로 작성. 지정 명령 실행, import/API 부재 또는 행동 차이 때문에 실패하는지 확인
3. **GREEN:** 해당 시나리오만 통과하는 최소 구현. 미리 만들 공용 프레임워크·새 라이브러리 없음
4. **회귀:** 지정 기능 테스트와 전체 suite 통과. 실패 출력·테스트 수 기록
5. **커밋:** Task Files의 파일만 명시적으로 `git add`, `git diff --cached --check`, 제시한 메시지로 커밋. `git add .`, 자동 push 금지. main에서 Task마다 작업 트리를 확인하고 다른 변경이 섞였으면 자동 정리하지 않음

각 Task의 Step 5는 아래 명령 형태 사용. `<Task Files>`는 해당 Task에 명시한 실제 파일 경로만 공백으로 나열하고 wildcard를 사용하지 않음. 새 테스트 파일도 포함.

```bash
# extension 작업 디렉터리 기준. 루트의 resources/docs 파일은 루트 기준으로 실행.
git add -- <Task Files>
git diff --cached --check
git diff --cached --stat
git commit -m '<해당 Task의 Commit 메시지>'
```

RED의 기대 결과는 import/API 부재 또는 명시한 assertion 실패이고, GREEN은 선택 테스트의 0 fail. 타임아웃·환경 오류로 실패한 것은 RED 성공으로 인정하지 않음

테스트는 `mkdtemp` + `t.after(rm)` 사용. 실제 study 경로, 실제 Pi 세션, 운영 DB·네트워크 호출 금지. clock·UUID·failpoint·openBrowser는 adapter 인자로 주입.

## Phase A — 저장 기반

### Task 1: 워크스페이스 계약과 무변경 탐색

**TDD scenario:** 새 기능 — 전체 RED/GREEN.

**Files**
- Create: `src/workspace/workspace-types.ts`, `src/workspace/workspace-root.ts`
- Test: `tests/workspace/workspace-root.test.ts`, `tests/support/workspace-fixture.ts`
- Modify: `tests/integration/directory-layout.test.ts` — 새 feature 목록

**Steps**
1. fixture에 루트 marker·프로젝트·챕터 생성, 하위 cwd와 명시 경로에서 같은 root 반환 테스트 작성.
2. RED: `node --test tests/workspace/workspace-root.test.ts`. marker 없음/손상/중첩 root/잘못된 timezone·간격/중복 project ID도 거부 테스트.
3. `findWorkspaceRoot(cwd, explicitRoot?)`, `readWorkspace(root)` 구현. manifest는 `{schemaVersion:1,workspaceId,timezone,review:{intervals:[1,3,7,14]},projects:[{id,slug,path}]}`.
4. 탐색 전후 전체 파일 hash 비교: 생성·수정 0, 알 수 없는 manifest 버전 거부. `tests/project/project-root.test.ts`도 통과.
5. Commit: `feat(study): add read-only workspace discovery and contracts`.

**완료 기준:** 프로젝트 탐색과 workspace 탐색은 별개. 자동 등록 없음.

### Task 2: 명시적 쓰기 경계와 원자적 단일 파일 쓰기

**Files**
- Create: `src/workspace/safe-path.ts`, `src/workspace/atomic-file.ts`
- Test: `tests/workspace/safe-path.test.ts`, `tests/workspace/atomic-file.test.ts`
- Modify/Test: `src/project/project-path.ts`, `tests/project/project-path.test.ts` — 기존 sync API 유지, 새 async 검증의 호출 지점 계약만 추가

**Steps**
1. 루트 공통 허용 경로, 프로젝트 전용 경로, `..`, absolute path, symlink ancestor·target·깨진 symlink 거부 테스트 작성.
2. RED: `node --test tests/workspace/safe-path.test.ts tests/workspace/atomic-file.test.ts tests/project/project-path.test.ts`.
3. `safeWorkspacePath(root, relative, scope)`, `safeProjectWritePath(root, relative)` 구현. 존재하는 ancestor는 `lstat/realpath`, 새 경로는 검증된 parent에서만 생성. 임시 파일은 고유 이름·동일 디렉터리·배타 생성 후 rename.
4. hash precondition 실패 시 원본 불변, rename 전 강제 실패 시 원본 정상·temp 정리 확인. 임의 공격자가 parent를 동시에 바꾸는 상황까지 보장한다고 주장하지 않음.
5. Commit: `feat(study): enforce workspace write scopes and atomic files`.

### Task 3: 변경 계획·잠금·멱등 복구

**Files**
- Create: `src/workspace/change-plan.ts`, `src/workspace/workspace-lock.ts`, `src/workspace/recovery.ts`
- Test: `tests/workspace/change-plan.test.ts`, `tests/workspace/workspace-lock.test.ts`, `tests/workspace/recovery.test.ts`

**구현 API**

```ts
type FileChange = {
  path: string;
  beforeSha256: string | null;
  before: string | null;
  after: string | null;
};
type ChangePlan = {
  schemaVersion: 1;
  id: string;
  requestId: string;
  state: "prepared" | "applying" | "committed" | "rolled_back" | "conflict";
  changes: FileChange[];
};
// executePlan(root, plan, { failAfterWrite? }); recoverPlan(root, id, mode)
```

**Steps**
1. 파일 3개의 fixture에 0/1/2/3회 쓰기 직후 failpoint 적용, retry/rollback, 중복 requestId 테스트 작성. 일부만 바뀐 상태를 성공으로 반환하지 않음.
2. RED: `node --test 'tests/workspace/*.test.ts'`.
3. `local/pending`에 before/after 전체 내용을 먼저 저장. 배타 lock 아래 hash CAS → temp rename. 모든 precondition을 처음에 검사하고 각 쓰기 직전 재검사.
4. 재실행 시 파일별로 before/after/외부 변경 분류. after는 건너뛰고 외부 변경은 복구 보류. rollback도 after hash 일치 시에만 수행하여 다른 업데이트 보존. 종료된 PID의 lock은 소유 token 확인 후 해제하며 완료 journal은 정리 가능.
5. Commit: `feat(study): recover multi-file changes without overwriting newer work`.

**완료 기준:** index·navigation은 pending root를 정합 완료로 표시하지 않음. durable 근거만 별도 저장된 경우 그 근거의 성공 여부와 연결 대기 상태를 따로 보고.

### Task 4: 등록 preview·승인 gate·무손실 상태 읽기

**Files**
- Create: `src/workspace/workspace-registration.ts`, `src/workspace/workspace-tools.ts`, `src/workspace/workspace-command.ts`
- Test: `tests/workspace/workspace-registration.test.ts`, `tests/workspace/workspace-tools.test.ts`
- Modify/Test: `src/project/project-manifest.ts`, `tests/project/project-manifest.test.ts`, `src/session/study-state.ts`, `tests/session/study-state.test.ts`

**Steps**
1. initialize preview 무변경, 승인 없는 initialize 거부, 같은 root 재등록 ID 보존, 손상된 state/manifest 재생성 금지 테스트 작성.
2. RED: `node --test 'tests/workspace/*.test.ts' tests/project/project-manifest.test.ts tests/session/study-state.test.ts`.
3. `/study-workspace init <root>`에서 현재 세션 requestId 발급 후 명시 승인. preview hash와 tree 상태가 같을 때만 root marker·project ID·기존 `.gitignore`에 local 제외 패턴 추가. topic·environment·개인 설정 필드 보존.
4. `loadStudyState`는 `ENOENT`만 기존 migration 허용. legacy 절대 root를 런타임의 현재 위치로 해석하되 읽기만으로 디스크 수정 없음. 기존 미지 필드·closed 상태 보존 테스트.
5. Commit: `feat(study): initialize approved workspaces without rewriting legacy state`.

**Checkpoint A:** 전체 suite, 2개 임시 루트 이동, 중단·symlink·충돌 테스트 통과 후 다음 Phase. 실제 root 등록 안 함.

## Phase B — 지식과 교재

### Task 5: 명제·출처·관계의 파싱과 검증

**Files**
- Create: `src/knowledge/knowledge-types.ts`, `src/knowledge/knowledge-codec.ts`, `src/knowledge/knowledge-validation.ts`
- Test: `tests/knowledge/knowledge-codec.test.ts`, `tests/knowledge/knowledge-validation.test.ts`
- Modify: `tests/integration/directory-layout.test.ts` feature 추가

**Steps**
1. 명제 본문의 여러 문장·코드펜스·HTML 주석 round-trip, confirmed의 근거 누락, uncertain 허용, ID 탈출·redirect 순환·분리된 전제 누락 테스트 작성.
2. RED: `node --test 'tests/knowledge/*.test.ts'`.
3. JSON 메타 구역과 Markdown 설명 본문 parser 구현. 입력 필드 whitelist, 크기 한도, 고유 ID와 revision 검증. teacher 출처와 learner evidence를 서로 다른 타입으로 처리.
4. joint `[A,B]→C`가 `[A]→C`와 같지 않고 독립 `[D]→C`도 별도라는 fixture 통과. 구조 검증은 진실성 인증 아님.
5. Commit: `feat(study): define proposition and provenance contracts`.

### Task 6: 지식 저장·버전·보수적 병합·undo

**Files**
- Create: `src/knowledge/knowledge-store.ts`, `src/knowledge/knowledge-changes.ts`, `src/knowledge/knowledge-tools.ts`
- Test: `tests/knowledge/knowledge-store.test.ts`, `tests/knowledge/knowledge-changes.test.ts`, `tests/knowledge/knowledge-tools.test.ts`

**Steps**
1. 표현 추가·같은 지식 교정·별도 추가, 기대 revision 불일치, 과거 ref 조회, merge/undo·retry 테스트 작성.
2. RED: `node --test 'tests/knowledge/*.test.ts'`.
3. apply payload는 `{changeId,operation,id?,expectedRevisionId?,reason,item?,targetId?}`. item+history+redirect+관계 변경을 Task 3 계획에 포함. agent가 의미를 판단하고 core는 형식·버전·허용 상태 확인.
4. merge 전후 원본 ID·출처·근거 불변. 기존 근거 rewrite 없음. uncertain→confirmed는 출처·조건·사유 필수, confirmed→conflicted/retired는 새 버전으로 남기며 신규 교재/출제 사용 보류. 과거 판정은 그대로 보존. 두 ID 모두 일정이 있는 경우 합친 view는 하나지만 원 일정 lineage 보존; 최종 결합은 Task 13. 충돌 시 조용히 진행하지 않음.
5. Commit: `feat(study): persist knowledge revisions and reversible merges`.

### Task 7: 챕터 binding·학습 경로와 교재 관리 영역

**Files**
- Create: `src/knowledge/chapter-bindings.ts`, `src/knowledge/textbook-regions.ts`, `src/knowledge/textbook-tools.ts`
- Test: `tests/knowledge/chapter-bindings.test.ts`, `tests/knowledge/textbook-regions.test.ts`

**Steps**
1. 챕터별 공통 refs·지역 예시·선수 경로의 분리, 영역 갱신·직접 편집·깨진/중복 marker·uncertain 차단 테스트 작성.
2. RED: `node --test tests/knowledge/chapter-bindings.test.ts tests/knowledge/textbook-regions.test.ts`.
3. `.study/bindings/<chapterSlug>.json`에 안정 project ID·refs·context·goal route 저장. 영역 hash는 직전 생성 문자열의 SHA-256. 외부 편집이면 제안 diff만 반환, 무단 덮어쓰기 없음.
4. 자동 영역만 교체, 기존 비관리 교재는 최초 marker 삽입 preview/확인 없으면 그대로. 교재 하나의 영역이 여러 refs를 묶을 수 있게 region ID+refs 목록 지원. 개인 메모/예시 byte 불변, 반복 refresh 무변경 확인.
5. Commit: `feat(study): render grouped textbook regions with edit conflict protection`.

**Checkpoint B:** 저장 기반 전체 회귀 + 지식 merge/undo + 관리 영역 편집 보존 통과. 의미 자동 병합 정확도를 수치로 보증하지 않음.

## Phase C — 질문·근거·대화형 진단

### Task 8: 공개 질문과 사전 확정 답안 계약

**Files**
- Create: `src/evidence/evidence-types.ts`, `src/evidence/question-store.ts`, `src/evidence/question-tools.ts`
- Test: `tests/evidence/question-store.test.ts`, `tests/evidence/question-tools.test.ts`
- Modify: `tests/integration/directory-layout.test.ts`

**Steps**
1. prepare 시 비공개 기준 먼저 저장, 공개 반환에 정답/이전 오답 없음, confirmed 아닌 ref의 채점용 사용 거부, 비채점 질문 허용 테스트 작성.
2. RED: `node --test 'tests/evidence/*.test.ts'`.
3. 프로젝트 질문은 `.study/dialogue/questions/<id>.json`, 루트 복습 질문은 `review/questions/<id>.json`. criteria는 agent가 준비하되 반환은 public DTO. 저장 실패 시 질문 생성 성공 반환 금지.
4. 같은 request 재시도 ID·질문 수 불변, 수정 재출제는 새 ID. 조건·허용 대안·source revision 필수. 정정은 기존 기준 덮어쓰기 없이 revision 추가. Task 10의 run counter와 질문 저장을 같은 변경 계획에 묶어 실패한 준비가 상한을 소비하지 않도록 연결.
5. Commit: `feat(study): precommit answer keys before publishing dialogue questions`.

### Task 9: 원 응답·도움·명제별 판정 저장

**Files**
- Create: `src/evidence/evidence-store.ts`, `src/evidence/evidence-validation.ts`, `src/evidence/answer-tools.ts`
- Test: `tests/evidence/evidence-store.test.ts`, `tests/evidence/evidence-validation.test.ts`

**Steps**
1. 제출 ID 재시도 중복 없음, 최초 답·교정 답 분리, 질문에 없는 ref 판정 거부, 서로 다른 도움 수준, 지식 수정 후 옛 기준 유지 테스트 작성.
2. RED: `node --test 'tests/evidence/*.test.ts'`.
3. append는 파일 내용을 읽어 변경 계획으로 atomic replace하며 이벤트는 추가만. 같은 제출 ID의 다른 내용은 오류. 원본 응답 위치와 당시에 확인한 ref/revision 저장. 자유 대화 메모는 상세 응답을 강제하지 않고, 실제 복습/진단 판정으로 쓰는 경우에만 이 계약 적용.
4. learner answer가 `knowledge/items`에 자동 쓰이지 않음, chain 수행이 개별 premise 성공만으로 생성되지 않음 확인.
5. Commit: `feat(study): preserve learner answers and versioned demonstration evidence`.

### Task 10: 진단 상태기계·8문항 상한·재개

**Files**
- Create: `src/session/dialogue-state.ts`, `src/session/dialogue-prompt.ts`, `src/session/learning-route-tools.ts`
- Test: `tests/session/dialogue-state.test.ts`, `tests/session/dialogue-prompt.test.ts`
- Modify/Test: `src/session/study-command.ts`, `tests/session/study-command.test.ts`

**핵심 RED 예시**

```ts
test("reopening a diagnosis does not reset its eight-question limit", () => {
  let run = createDiagnosis({ id: "d1", chapterSlug: "ch-01", limit: 8 });
  for (let n = 0; n < 8; n++) run = prepareDiagnosisQuestion(run, `q${n}`);
  const resumed = restoreDiagnosis(JSON.stringify(run));
  assert.throws(() => prepareDiagnosisQuestion(resumed, "q8"), /상한/);
  assert.equal(prepareDiagnosisQuestion(resumed, "q0").questionIds.length, 8);
});
```

**Steps**
1. 위 테스트 + 2문항 조기 종료/설명 요청/skip/unknown/정정/기존 HTML pending 재개 테스트 작성.
2. RED: `node --test tests/session/dialogue-state.test.ts tests/session/dialogue-prompt.test.ts tests/session/study-command.test.ts`.
3. `.study/dialogue/<chapterSlug>.json`에 run·질문 IDs·현재 목표·route·미확인·종료 사유 보존. pending legacy HTML은 완료 전 새 run으로 바꾸지 않음. route finish와 phase 변경은 같은 변경 계획. Task 8 question prepare가 이 상태를 함께 읽어 질문 준비 성공 때만 counter를 올리도록 연결.
4. route 결정·상한·사용자 중단을 구분. 시도 재개는 counter 유지. 명시적 새 시도만 새 run. teacher explanation만으로 demonstrated 생성 금지.
5. Commit: `feat(study): add resumable route-driven conversational diagnosis`.

### Task 11: HTML 강제 guard 분리·개념 완료 gate

**Files**
- Create: `src/session/assessment-open-guard.ts`, `src/session/concept-completion.ts`
- Test: `tests/session/assessment-open-guard.test.ts`, `tests/session/concept-completion.test.ts`
- Modify/Test: `index.ts`, `src/session/phase-state.ts`, `tests/integration/extension-registration.test.ts`, `tests/session/study-command.test.ts`

**Steps**
1. diagnosis에는 새 대화 도구 사용, test에는 기존 browser-open follow-up 유지, concept 종료 전 교재·binding·미확인 기록 누락 거부 테스트 작성.
2. RED: `node --test tests/session/assessment-open-guard.test.ts tests/session/concept-completion.test.ts tests/integration/extension-registration.test.ts`.
3. index의 turn_end 업무 로직을 guard 모듈로 추출. diagnosis는 학습 경로 준비만 요구하고 `study_diagnosis_open` 강제 제거. `finish_concept`는 README와 phase를 검증·저장 후 lab 제안.
4. `updateProjectPhase` 실패를 무조건 catch 후 성공처럼 반환하는 경로 제거 또는 typed 실패 반환. old callers의 경고 정책은 explicit adapter에서 유지. 저장 실패 시 다음 단계 자동 진입 거부.
5. Commit: `feat(study): switch new diagnosis to dialogue while retaining HTML exams`.

**Checkpoint C:** 실제 임시 프로젝트 진단 2문항 → 설명 → concept → lab 선택까지 등록 도구로 실행. 기존 HTML 시험·lab·checkpoint 회귀 통과.

## Phase D — 통합 복습

### Task 12: 달력 날짜와 유한 일정 reducer

**Files**
- Create: `src/review/review-date.ts`, `src/review/review-schedule.ts`
- Test: `tests/review/review-date.test.ts`, `tests/review/review-schedule.test.ts`

**핵심 RED 예시**

```ts
test("a hinted answer restarts only that proposition from one day later", () => {
  const before = { knowledgeId: "k-a", nextStage: 2, dueDate: "2026-10-08",
    status: "active", intervals: [1, 3, 7, 14], timezone: "Asia/Seoul" };
  const after = advanceReview(before, {
    id: "e1", localDate: "2026-10-10", assistance: "hinted", result: "demonstrated",
  });
  assert.equal(after.nextStage, 0);
  assert.equal(after.dueDate, "2026-10-11");
});
```

**Steps**
1. 위 테스트 + 10/1 완료→10/2→10/5→10/12→10/26 종료, late·WRONG·partial·unverified·동일 evidence ID·잘못된 timezone·DST·윤년 테스트 작성.
2. RED: `node --test tests/review/review-date.test.ts tests/review/review-schedule.test.ts`.
3. `localDate(iso, timezone)`, `addCalendarDays(date,n)`, `advanceReview(schedule,evidence)` 순수 함수 구현. completed에는 자동 새 cycle 없음.
4. 기록의 로컬 날짜가 dueDate보다 빠르면 독립 지연 복습 진행 거부. 교정 직후 응답은 일정 전진 금지. 미응답은 중단인지 오답인지 명시적으로 분류.
5. Commit: `feat(study): calculate finite proposition review cycles by local calendar dates`.

### Task 13: 일정 저장·중복 방지·병합과 재시작

**Files**
- Create: `src/review/review-store.ts`, `src/review/review-merge.ts`
- Test: `tests/review/review-store.test.ts`, `tests/review/review-merge.test.ts`
- Modify/Test: `src/knowledge/knowledge-changes.ts`, `tests/knowledge/knowledge-changes.test.ts`

**Steps**
1. 여러 챕터의 같은 명제 등록 시 1일정, completed 재등장 무변경, 한 질문 3명제 중 1개만 reset, 증거 저장 후 일정 쓰기 실패 재시도 테스트 작성.
2. RED: `node --test tests/review/review-store.test.ts tests/review/review-merge.test.ts tests/knowledge/knowledge-changes.test.ts`.
3. `review/items/<id>.json`은 evidence refs·현재 stage·cycle ID·origin chapter·revision 참조. 근거와 일정 업데이트를 변경 계획으로 적용. 같은 evidence 중복 소비 금지.
4. merge는 canonical당 하나의 active view. 완료 근거 없는 stage 승격 금지, 기한은 양쪽 미완료의 이른 날짜 보존. 흡수한 일정 snapshot·lineage는 보존하고 undo 시 원 일정 복원. merge 후 새 근거는 실제 원본 refs 기준으로만 분배하고 모호하면 연결 대기, 성공을 복제하지 않음.
5. Commit: `feat(study): persist deduplicated review schedules with reversible merge lineage`.

### Task 14: due 조회·질문 묶기·정답 비노출 시작 페이지

**Files**
- Create: `src/review/review-query.ts`, `src/review/integrated-review-page.ts`, `src/review/review-next-tool.ts`
- Test: `tests/review/review-query.test.ts`, `tests/review/integrated-review-page.test.ts`
- Modify/Test: `src/review/review-tools.ts`, `tests/review/review-page.test.ts`

**Steps**
1. workspace root에서 overdue 우선·프로젝트 필터·all future·무한 상한 없음·중단 후 남은 due 유지 테스트 작성.
2. RED: `node --test 'tests/review/*.test.ts'`.
3. due 조회는 기준일+ID로 안정 정렬, 묶기 후보만 반환. agent는 관련 내용을 묶어 Task 8로 질문 준비. 데이터 페이지에 정답·조건부 채점기준·예전 오답 없음.
4. root `review/README.md`는 이름·due·기록 링크만. chapter refresh는 linked scope의 view, canonical schedule 복제 없음. 미등록 프로젝트는 legacy builder·alias 동작 유지. 사용자가 관리하지 않기로 한 기존 README는 marker 자동 삽입 없이 갱신 보류.
5. Commit: `feat(study): expose scoped integrated review without answer leakage`.

**Checkpoint D:** 4회차·실패 재시작·늦은 수행을 주입 clock으로 end-to-end. 실제 날짜를 기다리거나 가짜 수행 기록을 사용자 저장소에 만들지 않음.

## Phase E — 기존 기능 연결

### Task 15: HTML 시험 완료 → 최초 복습 등록

**Files**
- Create: `src/review/chapter-review-registration.ts`
- Test: `tests/review/chapter-review-registration.test.ts`
- Modify/Test: `src/assessment/test-completion.ts`, `tests/assessment/test-completion.test.ts`, `src/bridge/study-routes.ts`, `tests/bridge/study-routes.test.ts`, `src/session/study-state.ts`, `tests/session/study-state.test.ts`

**Steps**
1. passed+ack+chapter evidence 완료 전 일정 미생성, ack 재시도 중복 없음, bindings 누락 연결 대기, 복습 등록 실패해도 시험 성과 보존 테스트 작성.
2. RED: `node --test tests/review/chapter-review-registration.test.ts tests/assessment/test-completion.test.ts tests/bridge/study-routes.test.ts tests/session/study-state.test.ts`.
3. 시험 완료 시 최초의 immutable `chapterCompletedAt` 기록. 기존 completed 로드·updatedAt으로 소급 생성 금지. 새 explicit chapter 완료(승인된 skip 포함)도 같은 helper 사용.
4. 시험 통과는 독립 사실. root 연결 실패는 pending retry+경고로 분리, test completed를 취소하지 않음. `syncReviewPhase`는 등록된 bindings만 통합 view 사용, legacy completed/skipped를 무단 강등하지 않음. 다른 활성 챕터/phase 불변.
5. Commit: `feat(study): register integrated reviews after acknowledged chapter completion`.

### Task 16: lab·시험 근거 연결과 checkpoint 경계

**Files**
- Create: `src/evidence/existing-record-links.ts`
- Test: `tests/evidence/existing-record-links.test.ts`
- Modify/Test: `src/lab/lab-tools.ts`, `tests/lab/lab-core.test.ts`, `src/assessment/grade-handler.ts`, `tests/assessment/grade-handler.test.ts`, `src/checkpoint/checkpoint-core.ts`, `tests/checkpoint/checkpoint-core.test.ts`

**Steps**
1. 기존 lab/test 원본 복제 없이 anchor 연결, agent-assisted lab 통과가 independent 아님, checkpoint로 새 지식/일정 파일 push 거부 테스트 작성.
2. RED: `node --test tests/evidence/existing-record-links.test.ts tests/lab/lab-core.test.ts tests/assessment/grade-handler.test.ts tests/checkpoint/checkpoint-core.test.ts`.
3. 원본 path·attempt/step ID·digest·도움 정보만 연결. 판단 불명은 unknown. 학습자 observation/takeaway 요구는 그대로 유지.
4. checkpoint는 기존 승인 파일 하나만 stage/commit/push. 지식 반영 변경들을 따라 포함시키지 않음. root 연결 실패는 기록 저장 여부와 별도 보고.
5. Commit: `feat(study): link existing learning evidence without widening publish permissions`.

**Checkpoint E:** 등록/미등록 fixture 둘 다 HTML test·lab·checkpoint 전 회귀. 기존 데이터 자동 등록 0.

## Phase F — 지도·위젯·이전 도구

### Task 17: 읽기 전용 지도 데이터와 loopback 페이지

**Files**
- Create: `src/knowledge/knowledge-view.ts`, `src/bridge/knowledge-routes.ts`, `src/knowledge/map-command.ts`, `assets/knowledge-template.html`
- Test: `tests/knowledge/knowledge-view.test.ts`, `tests/bridge/knowledge-routes.test.ts`
- Modify/Test: `src/bridge/study-routes.ts`, `tests/bridge/study-routes.test.ts`

**Steps**
1. 지도에 명제·관계 종류·joint junction·프로젝트 scope·근거 이름 표시, 정답/원 응답 제외, HTML 삽입 문자열 escape 테스트 작성.
2. RED: `node --test tests/knowledge/knowledge-view.test.ts tests/bridge/knowledge-routes.test.ts tests/bridge/study-routes.test.ts`.
3. `GET /knowledge/<opaque-session-id>` 및 고정 snapshot endpoint. 임의 파일 경로 요청 거부. 기존 lazy server 사용. inline SVG와 표 뷰, 1차는 서버에서 만든 좌표로 단순 배치, 외부 CDN 없음.
4. `/study-map`은 브라우저 자동 열기. 선택은 페이지 로컬 상태, phase·route 쓰기 API 없음. 상태 snapshot stale 표시, 명시 새로고침. 오류 시 이미 저장한 학습 성과 유지.
5. Commit: `feat(study): add read-only knowledge map and table browser`.

### Task 18: 작은 위젯과 Pi 등록

**Files**
- Create: `src/session/study-widget.ts`
- Test: `tests/session/study-widget.test.ts`
- Modify/Test: `index.ts`, `tests/integration/extension-registration.test.ts`

**Steps**
1. `ctx.hasUI` 없는 환경에서도 정상, chapter·phase·다음 행동만 표시, session switch 후 이전 target 제거, shutdown dispose 테스트 작성.
2. RED: `NODE_PATH="$(npm root -g)" node --test tests/session/study-widget.test.ts tests/integration/extension-registration.test.ts`.
3. `ctx.ui.setWidget("study-status", lines)` 사용. lifecycle handler에 context 인자 추가, 이벤트별 전체 자료 scan 금지. Task 4–17 도구/명령 등록은 feature별 함수, index는 조립만.
4. host harness mock에 ui·isIdle·session context를 명시적으로 추가. expected tool/command 목록 업데이트, 기존 curriculum/test/lab/checkpoint·legacy diagnosis 이름 보존. 서버 미리 시작 없음.
5. Commit: `feat(study): register integrated learning tools and compact status widget`.

### Task 19: 이전 계획 미리 보기·승인·보존·undo

**Files**
- Create: `src/workspace/migration-plan.ts`, `src/workspace/migration-tools.ts`
- Test: `tests/workspace/migration-plan.test.ts`, `tests/workspace/migration-tools.test.ts`
- Modify/Test: `src/workspace/workspace-command.ts`, `tests/integration/extension-registration.test.ts`

**Steps**
1. current-layout 익명 fixture: manifest 누락·빈 schedule·지난 planned·skipped_understood·완료일 미확인·dirty Git·삭제 챕터 생성. preview tree hash 불변 테스트 작성.
2. RED: `node --test tests/workspace/migration-plan.test.ts tests/workspace/migration-tools.test.ts`.
3. preview는 읽기만 하고 plan+digest 반환. apply는 같은 세션 승인 requestId·plan digest·HEAD/tree hash·root ID를 재검사. 외부 파일·삭제 챕터 복원 안 함. root 등록·누락 manifest 보완은 계획에 명시.
4. redis ch-03/04 skipped 일정 생성 0, ch-01/02 요청 전 자동 시작 0, backend/thread 완료 전 일정 0. 따라서 기본 이전만으로 가짜 due를 만들지 않음. 기존 state·schedule·답안 byte 불변. 새 root navigation이 과거 기록을 참조하므로 원본 schedule에 redirect 쓰지 않음.
5. undo도 journal after hash 일치하는 추가 항목만 제거. 후속 학습 변경이 있으면 보류. Commit: `feat(study): preview and authorize non-destructive legacy review migration`.

**Checkpoint F:** migration preview는 실제 학습 저장소 실행도 아직 금지. fixture dry-run·apply·undo 및 HTML map smoke만.

## Phase G — 지침·회귀·완료

### Task 20: 새 흐름 지침과 study-dialogue 호환

**Files**
- Modify: `instructions/diagnosis.md`, `instructions/concept.md`, `instructions/lab.md`, `instructions/test.md`, `instructions/review.md`, `instructions/legacy-study-chapter.md`, `prompts/study-init.md`, `prompts/study-review.md`, `README.md`
- Modify: `resources/skills/tool/study-dialogue/SKILL.md`, `resources/skills/tool/study-dialogue/references/review-integration.md`
- Test: `tests/review/review-instructions.test.ts`, `tests/session/diagnosis-review-prompt.test.ts`
- Create Test: `tests/integration/learning-instructions.test.ts`

**Steps**
1. 문구 계약 테스트: 새 진단 8상한·조기 종료·precommit, HTML 강제 없음, test HTML 유지, review finite/restart/무제한 양, 미확인 보존 작성.
2. RED: `node --test tests/integration/learning-instructions.test.ts tests/review/review-instructions.test.ts tests/session/diagnosis-review-prompt.test.ts`.
3. instructions를 단일 정본으로 고침. init은 템플릿 생성 전 루트 확인/등록과 curriculum 승인 유지. 기존 unregistered용 설명은 명시적 legacy 분기, 두 정책 혼합 금지.
4. study-dialogue는 환경 독립 유지. 등록 root이면 새 지식별 due/근거, 미등록이면 legacy schedule. 자유 대화는 자의적 회상 완료로 변환하지 않음. 새 도구 사용 가능 시 활용하되 필수 아님.
5. Commit: `docs(study): align prompts and dialogue skill with integrated learning`.

### Task 21: 전체 시나리오·보안·중단 회귀

**Files**
- Create: `tests/integration/integrated-learning.test.ts`, `tests/integration/workspace-portability.test.ts`, `tests/integration/write-recovery.test.ts`
- Modify: 필요한 기존 테스트만. baseline regression을 새 기능에 맞춘다는 이유로 삭제하지 않음

**Steps**
1. 새 root initialize → 진단 2문항 → route 종료 → concept/binding → 기존 lab 검증 → HTML test passed+ack → +1 due → 독립 답 → hint 재시작 → 네 회차 종료 fixture 작성.
2. RED: `NODE_PATH="$(npm root -g)" node --test 'tests/integration/*.test.ts'`.
3. 통합 연결 누락만 수정. actual browser opener 대신 spy, loopback HTTP는 기존 방식. 실제 Git publish 테스트는 로컬 bare remote.
4. 이동한 root·PC 두 revision 충돌·journal 부분 적용·symlink 탈출·교재 직접 편집·문항 기준 정정·corrupt state·pending legacy HTML을 전부 재검증.
5. Commit: `test(study): cover integrated learning portability and failure recovery`.

### Task 22: 최종 점검·구현 결과 인계

**TDD scenario:** 검증·문서 작업. 별도 RED: 없음. Tasks 1–21에서 작성한 테스트를 다시 실행하며 실제 결과만 기록.

**Files**
- Modify: `README.md`(extension), 저장소 루트 기준 `docs/plans/2026-10-30-study-learnharness-implementation.md`의 체크리스트
- Create: 저장소 루트 기준 `docs/plans/study-learnharness-verification.md` — 실제 명령·결과·제한 사항만

**Steps**
1. 전체 테스트 실행, 실제 tests/pass/fail/skip 기록. 기준 137개에서 어떤 테스트를 보존·추가·정책 변경했는지 설명.
2. 포맷 도구가 이미 있으면 `prettier --check 'index.ts' 'src/**/*.ts' 'tests/**/*.ts'`. 없다면 설치하지 말고 미실행 이유 기록.
3. 저장소 루트에서 `bash scripts/check-resources`, `git diff --check`. 승인 설계와 구현 traceability 표, 노출 도구 스키마·README 대조.
4. mock host만 통과한 것을 실제 Pi 사용 성공이라고 하지 않음. 실제 `/reload`·브라우저 파일럿은 임시 프로젝트에서 사용자와 실행, 실제 study 데이터는 제외. headless/비UI 경로도 확인.
5. Commit: `docs(study): record integrated learning verification and rollout boundaries`. 코드 완료·테스트 완료·사용자 파일럿·실제 이전을 각각 보고.

## 실제 데이터 이전은 별도 작업

아래는 Task 22 이후에도 자동 실행하지 않음.

1. 사용자에게 actual workspace 대상과 변경 범위 확인
2. 사용자가 보유한 dirty state 정리 요청. 자동 stash·reset·commit 금지
3. preview 출력과 원본 hash/백업·복구 방법 제시
4. 해당 planId에 대한 명시 승인 후 apply
5. 원본 state/schedule/응답 불변·새 root 연결 검사, 필요하면 CAS undo
6. redis skipped 유지와 자동 due 없음 확인
7. 이후 사용자가 새 챕터를 끝내거나 복습 시작을 요청할 때만 해당 일정 등록

## 진행 체크리스트

- [ ] A: Tasks 1–4 — 저장 기반
- [ ] B: Tasks 5–7 — 지식·교재
- [ ] C: Tasks 8–11 — 질문·근거·진단
- [ ] D: Tasks 12–14 — 통합 복습
- [ ] E: Tasks 15–16 — 기존 기능 연결
- [ ] F: Tasks 17–19 — 지도·위젯·이전 도구
- [ ] G: Tasks 20–22 — 지침·통합 회귀·인계
- [ ] 별도 승인 후 실제 study 이전 — 이 계획의 자동 실행 대상 아님

각 체크는 실제 실행·검증 결과가 있을 때만 변경. 계획 작성 시점에 완료된 것은 **기준 테스트 137개 통과 확인**뿐이며 새 기능 테스트·구현·이전은 미실행.
