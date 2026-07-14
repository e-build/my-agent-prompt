---
name: shopl-dev-task-flow-unit
description: Execute one implementation unit (작은 분류 / 실행 단위) within a task-flow workflow. Owns one unit file (unitFilePath) as the single source of truth, handling detailed planning, approval gate, implementation, diff review gate, commit and unit file update, then returns structured completion events to the parent task-flow skill.
---

# Task Flow Implementation Unit

하나의 실행 단위(작은 분류)를 완료하는 절차. 부모 스킬(`shopl-dev-task-flow`)의 작은 분류 루프에서 각 단위마다 호출한다. 이 스킬은 호출 시 받은 **unit 파일(`unitFilePath`)**을 정본으로 삼아, 그 파일 안에서 계획/승인/구현/diff/검증/커밋을 전부 기록한다. 큰 분류 파일에는 긴 로그를 쓰지 않는다. 독립 실행도 가능하지만, 보통 작업 흐름 컨텍스트(트래커 모드, 커밋 접두사, unit 파일 경로)가 필요하므로 부모 스킬을 통해 실행하는 것이 기본이다.

## 용도

다음 조건에서 이 스킬을 사용한다:

- 부모 스킬(`shopl-dev-task-flow`)의 작은 분류 루프가 현재 실행 단위를 위임했을 때.
- 또는 사용자가 단일 실행 단위를 지정하고 "이 단위만 계획 세우고 실행해줘"라고 요청했을 때.

자동 활성화 트리거는 없다. 항상 부모 스킬의 호출 또는 사용자의 명시적 요청에 의해 활성화된다.

## 호출 인터페이스 (Parent Contract)

호출자(부모 스킬 또는 사용자)는 아래 정보를 제공해야 한다:

| 정보 | 설명 | 예시 |
|------|------|------|
| unit 파일 경로 (`unitFilePath`) | **정본**. 이 스킬이 읽고 쓰는 unit 파일의 전체 경로 | `docs/task-workflow/01-SH-21819/02-공통-raw-source.md` |
| 큰 분류 파일 경로 | Unit Index를 갱신할 큰 분류 인덱스 파일의 전체 경로 | `docs/task-workflow/01-SH-21819/index.md` |
| 큰 분류 작업 키 | 현재 큰 분류의 작업 키 | `SH-21682` |
| 상위/에픽 키 | 커밋 접두사로 쓸 상위 키 | `SH-19400` |
| 실행 단위 식별자 | 번호 + 이름 + 태그 | `2. 결제 API 구현 [API]` |
| 실행 단위 순번 | 큰 분류 내 몇 번째 작은 분류인지 | `1` |
| 첫 실행 단위 여부 | 부모가 트래커 전환 판단에 쓰는 값 | `true` |
| Unit Index 행 | 갱신할 Unit Index 행 식별자(순번 또는 slug) | `2` |
| 목표 | 이 단위가 달성할 것 | 주문 결제 검증 로직 구현 |
| 대상 파일 | 수정/생성할 파일 경로 목록 | `src/main/kotlin/.../Order.java` |
| 트래커 모드 | `jira` / `linear` / `local` | `jira` |
| 커밋 접두사 | 커밋 메시지에 붙일 티켓 키 | `SH-19400` |
| 검증 힌트 | 실행 후 어떤 검증을 우선 볼지 | `OrderService 관련 테스트, gradle test --tests ...` |

## 실행 순서

각 실행 단위마다 아래 절차를 순차적으로 수행한다. 한 번 승인으로 큰 분류 전체를 batch로 진행하지 않는다.

### 1. 상세 계획

현재 실행 단위 1개에 대해서만 아래 항목을 작성한다:

- 목표
- 대상 파일
- 구현 접근
- 검증 방법
- 리스크

**unit 파일(`unitFilePath`)의 `## Plan` 섹션에 기록한다.** 큰 분류 파일에는 쓰지 않는다.

unit 파일 템플릿:

```markdown
# <큰분류번호>-<unit순번>. <작은 분류 원문 제목>

- 큰 분류: `<큰분류키>`
- 작업 키: `<티켓키>`
- 트래커 모드: `<jira | linear | local>`
- 상태: `계획 작성`
- 커밋 접두사: `<상위키>`
- 원문 작은 분류: `<작은 분류 원문 제목>`

## Unit Goal

## Plan

- 목표:
- 대상 파일:
- 구현 접근:
- 검증 방법:
- 리스크:

## Coverage Links

- Covered Trace IDs: `<TR-ID 목록 or 없음>`
- Covered Test Case IDs: `<TC-ID 목록 or 없음>`
- Applied PC-IDs: `<PC-ID 목록 or 없음>`

> 골격/단순 DTO/조사/문서 unit은 "해당 없음"으로 기록.

## Test Case Review

| ID | 정책/요구사항 | 조건 | 입력 | 기대 결과 | 테스트 레벨 |
|----|---------------|------|------|-----------|-------------|

> 테스트 케이스가 필요 없는 unit(골격/단순 DTO/조사/문서)은 "테스트 케이스 없음: <사유>"로 기록.

## User Review

## Execution Result

## Diff Review

## Verification Result

## Commit

- 커밋: `none`

## Planning Changes

- 적용한 PC-ID: `<목록 or 없음>` (원본 원장은 부모 스킬의 `planning-change-log.md`)

## Open Issues
```

unit 파일 헤더의 `상태:`를 `계획 작성`으로 설정한다. (작은 분류 전용 상태 모델은 아래 `작은 분류 상태 모델` 참조.)

#### 표준 스킬 계획 검토 (승인 제시 직전)

계획 초안을 사용자에게 제시하기 전에, 이 단위의 **설계 결정과 관련된** 팀 표준 프로젝트 스킬만 호출해 계획이 표준에 부합하는지 자기 검증한다. 모두 호출하지 않는다. 위반은 Plan 섹션을 고쳐서 반영한다. 코드를 아직 쓰기 전 단계이므로 수정 비용이 가장 싸다.

| 계획 항목 | 호출할 스킬 |
|----------|------------|
| 레이어/패키지 구조 | `backend-layer-rule` |
| JPA 엔티티/영속성 설계 | `backend-jpa-entity` |
| API/컨트롤러 설계 | `backend-api-patterns` |
| 예외/에러 전략 | `backend-error-handling` |

코드 스타일·테스트 전략은 코드가 없는 이 단계에서는 호출하지 않고 step 4로 미룬다.

#### Test Case Review 작성 (조건부 필수)

Plan과 함께 unit 파일의 `## Test Case Review`에 테스트 케이스 표를 작성한다. **테스트 케이스가 의미 있는 unit은 이 단계가 필수**이며, 이 표에 대한 사용자 승인이 있어야만 구현으로 넘어간다(step 2에서 Plan과 함께 승인).

필수 대상: API 엔드포인트 / 비즈니스 로직 / 권한 분기 / 정책 분기 / 계산 로직을 다루는 unit.

필요 없는 unit(골격 생성 / 단순 DTO 조립 / 조사 / 문서 정리)은 "테스트 케이스 없음: <사유>"로 기록한다.

작성 기준(`shopl-dev-task-flow`의 `테스트 케이스 정의 원칙`과 정책서·API Draft에서 추출):

- 기획서·정책서의 분기/경계값/예외/권한 거부/enum 가능값을 누락 없이 식별.
- Facade 계층은 happy path 통합 테스트, 도메인/서비스 내부 분기는 단위 테스트로 커버.
- 표 형식: `ID / 정책·요구사항 / 조건 / 입력 / 기대 결과 / 테스트 레벨`.

#### Coverage Links 작성 (필수)

unit 파일의 `## Coverage Links`에 이 unit이 닫는 범위를 선언한다. 부모가 이 값을 큰 분류 Traceability/Planning Changes 표의 갱신에 사용한다.

- `Covered Trace IDs`: 이 unit이 구현·검증하는 정책 분기/경계값(분해 문서 Traceability Matrix의 Trace ID). 값은 Orientation에서 부모가 배정한 범위에서 선택.
- `Covered Test Case IDs`: 이 unit의 `Test Case Review` 표에 정의한 TC-ID 목록. (Test Case Review가 없는 unit은 `없음`.)
- `Applied PC-IDs`: 이 unit이 반영하는 Planning Change PC-ID 목록. (없으면 `없음`.)
- 골격/단순 DTO/조사/문서 unit은 세 항목 모두 `해당 없음`.

### 2. 상세 승인 대기 (Plan + Coverage Links + Test Case Review)

작성한 계획, Coverage Links, (필수면) 테스트 케이스 표를 함께 사용자에게 제시하고 승인을 기다린다. 승인 전에는 어떤 구현 변경도 하지 않는다.

unit 파일 헤더의 `상태:`를 `승인 대기`로 설정한다. 트래커(`jira` 모드)는 그대로 둔다(아직 시작 전).

**Test Case Review가 필수인 unit**은 아래 확인 문구를 포함해 제시한다:

> 위 테스트 케이스로 구현 전 검증 기준을 확정해도 될까요? 승인되면 테스트 코드를 먼저 작성하고, 실패 확인 후 구현으로 넘어갑니다.

승인 표현 표는 아래 `승인 게이트` 참조. 승인은 Plan·Coverage Links·Test Case Review를 모두 포함한다. Coverage Links나 테스트 케이스 수정 요청이 오면 Plan이 아니어도 해당 섹션을 고치고 재승인받는다.

### 3. 실행 시작

승인 시 unit 파일 헤더의 `상태:`를 `진행 중`으로 변경한다.

이 스킬은 트래커 상태를 직접 전환하지 않는다. 대신 부모 스킬이 판단할 수 있도록 다음 사실을 결과에 포함한다:

- 현재 실행 단위가 큰 분류의 첫 실행 단위인지
- 구현이 실제로 시작되었는지
- 커밋 완료 전까지 트래커를 `진행 중`으로 유지해야 하는지

### 4. 구현

해당 실행 단위만 구현한다. 다음 실행 단위를 미리 구현하지 않는다.

승인된 계획의 대상 파일과 구현 접근에 충실하게 구현한다.

#### 표준 스킬 자기 검증 (구현 직후)

구현을 마친 뒤 diff를 사용자에게 제시하기 전에, **실제 코드를 봐야 판별되는** 팀 표준 프로젝트 스킬만 호출해 자기 검증한다. 설계형 스킬은 step 1에서 이미 검토했으므로 여기서는 부르지 않는다. 위반 항목은 그 자리에서 수정한 뒤 diff를 제시한다.

| 검증 대상 | 호출할 스킬 |
|-----------|------------|
| (모든 코드 변경의 기본) | `backend-code-style` |
| 테스트 코드/검증 | `backend-testing` |
| 예외 매핑 디테일 (구현 결과물) | `backend-error-handling` |

### 5. Diff 검토

구현 완료 후 diff를 생성하여 사용자에게 제시한다. unit 파일 헤더의 `상태:`를 `diff 검토 중`으로 설정한다.

#### 승인 표현 (diff 통과)

다음 표현은 현재 diff가 승인되었음을 의미한다. 승인 시 step 6(커밋)으로 진행한다:

- `승인` / `진행` / `작업 시작` / `구현해` / `계속해`
- `좋아` / `OK` / `go` / `이대로 진행` / `계획대로 진행`

#### 거절 / 수정 요청 표현

다음 표현은 현재 diff가 거절되었거나 수정이 필요함을 의미한다:

- `거절` / `NO` / `이건 아니야`
- `되돌려` / `취소`
- `수정해줘` / `고쳐`
- `다르게 해` / `방향이 틀렸어`

거절 시 unit 파일 헤더의 `상태:`를 `diff 거절`로 설정하고 step 4로 돌아가 해당 단위만 수정 후 diff를 다시 제시한다. 다음 실행 단위로 넘어가지 않는다.

#### 금지 사항

- diff 검토 중에 다른 실행 단위를 미리 진행하지 않는다.
- 사용자가 diff를 보지 않은 상태에서 커밋하지 않는다.
- 거절된 diff를 그대로 커밋하지 않는다.

### 6. 커밋

diff 승인 시 해당 실행 단위만 커밋한다.

커밋 규칙:
- 커밋 접두사 = 호출 시 전달받은 커밋 접두사(상위 티켓 키).
- 실행 단위마다 커밋한다. 실행 전체를 한 번에 커밋하지 않는다.
- `local` 모드도 동일하게 커밋한다. 사용자가 명시적으로 커밋 금지를 요청한 경우에만 예외다.
- 프로젝트 고유의 커밋 형식을 따른다(예: `SH-19400 주문 결제 API 구현`).
- AI 도구 이름/저작권 문구를 커밋 메시지에 포함하지 않는다.

### 7. unit 파일 갱신 + 큰 분류 요약

커밋 직전 최종 점검:

- `git status --short` 결과가 예상과 일치하는가 (무엇이 추가/변경/삭제됐는지 확인)
- 이동/삭제 파일이 있다면 D 또는 R 상태가 stage되었는가
- 테스트 항목이 남아 있지 않은가 (테스트 미완료 시 다음 작은 분류로 넘어가지 않음)

unit 파일에 결과를 기록한다:

- `## Coverage Links`를 최종값으로 확정(구현 중 범위가 바뀌면 갱신) / `## Execution Result` / `## Verification Result` / `## Diff Review` / `## Commit`(커밋 해시) / `## Open Issues` 채우기
- unit 파일 헤더 `상태:`를 `완료`(또는 `차단`)로 설정

**큰 분류 파일에는 긴 로그를 쓰지 않는다.** 부모가 Unit Index 행(상태/커밋 해시)만 갱신하도록 결과를 반환한다.

## 반환 계약 (Return Contract)

이 스킬은 완료 시 아래 결과를 부모 스킬로 반환한다:

| 반환값 | 의미 |
|------|------|
| `unitFilePath` | 처리한 unit 파일 경로 |
| `unitStatus` | `completed` / `rework-needed` / `blocked` |
| `startedExecution` | 실제 구현이 시작되었는지 |
| `isFirstUnit` | 현재 단위가 첫 실행 단위였는지 |
| `changedFiles` | 실제 변경된 파일 목록 |
| `commitHash` | 커밋 완료 시 해시, 없으면 `none` |
| `verificationMemo` | 어떤 검증을 했고 결과가 어땠는지 |
| `openIssues` | 부모가 다음 액션을 잡아야 할 남은 이슈 |
| `needsTrackerSync` | 부모가 트래커 상태 재평가를 해야 하는지 |
| `appliedPCIds` | 이 unit에 적용한 Planning Change PC-ID 목록 (없으면 빈 목록). 부모가 `planning-change-log.md` 상태 갱신에 사용 |
| `coveredTraceIds` | 이 unit이 닫은 Trace ID 목록 (없으면 빈 목록). 부모가 큰 분류 Traceability 표 갱신에 사용 |
| `coveredTestCaseIds` | 이 unit이 검증한 TC-ID 목록 (없으면 빈 목록). 부모가 큰 분류 Traceability 표 갱신에 사용 |

## 작업 완료 조건

다음 조건이 모두 충족되어야 부모 스킬로 제어를 되돌린다:

1. unit 파일(`unitFilePath`)의 Plan/Coverage Links/Test Case Review/User Review/Execution/Diff/Verification/Commit이 전부 기록됨. (테스트 케이스가 의미 있는 unit은 Test Case Review가 사용자 승인된 상태여야 함.)
2. diff 승인 후 커밋 완료.
3. unit 파일 헤더 `상태:`가 `완료`(또는 `차단`)로 설정됨.
4. 반환 계약의 핵심 값(`unitFilePath`, `unitStatus`, `changedFiles`, `commitHash`, `coveredTraceIds`, `coveredTestCaseIds`, `appliedPCIds`, `needsTrackerSync`)이 정리됨.
5. 적용한 PC-ID가 있으면 부모에게 전달(`planning-change-log.md` 갱신은 부모가 수행).
6. Coverage Links가 부모에 반환됨 — 부모가 큰 분류 coverage 집계에 사용.

## 작은 분류 상태 모델

작은 분류(unit)는 큰 분류 상태와 별개의 전용 상태를 쓴다. 트래커와 동기화하지 않고 로컬 진행 제어 전용이다. unit 파일 헤더 `상태:`와 큰 분류 파일의 Unit Index에만 기록된다.

| 상태 | 의미 |
|------|------|
| `대기` | unit 시작 전 |
| `계획 작성` | unit 파일에 Plan 작성 중 |
| `승인 대기` | 사용자 승인 대기 |
| `진행 중` | 승인 후 구현 중 |
| `diff 검토 중` | 구현 완료, diff 제시 후 판단 대기 |
| `diff 거절` | diff 수정 필요, 같은 unit에서 재작업 |
| `검증 중` | diff 승인/커밋 후 unit 검증 중 |
| `완료` | unit 완료, 큰 분류 파일 Unit Index에 요약 반영됨 |
| `차단` | 이 unit 진행에 필요한 결정/정보 부족 |

규칙:

- 작은 분류 상태는 트래커(Jira/Linear)와 동기화하지 않는다. 트래커 상태는 큰 분류/티켓 단위에서만 관리한다.
- `diff 거절`은 큰 분류 상태를 바꾸지 않는다. 같은 unit 내에서만 전이한다.
- unit이 `차단`일 때만 부모가 큰 분류 차단 여부를 전파할지 판단한다.

## 비고

- 이 스킬은 상태 플래핑(잦은 상태 변경)을 피한다. `계획 작성` → `승인 대기` → `진행 중` → `diff 검토 중` → 필요 시 재순환 → `완료`까지 한 unit 파일 내에서만 전이한다.
- 큰 분류 전체의 방향은 부모 스킬(`shopl-dev-task-flow`)의 `Orientation`에서 결정한다. 이 스킬은 Orientation을 건드리지 않는다.
- 트래커 상태 전환은 부모 스킬 전담이다. 이 스킬은 상태 전환을 실행하지 않고, 전환 판단에 필요한 결과만 반환한다.
- 정본은 unit 파일(`unitFilePath`) 하나다. 큰 분류 파일에는 긴 실행 로그를 쓰지 않는다.
