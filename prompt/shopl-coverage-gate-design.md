# 큰 분류 Coverage 게이트 도입 설계안 (A+B+E 묶음)

> 적용 전 설계안. `shopl-dev-task-flow` / `shopl-dev-task-flow-unit` / `shopl-dev-backend-breakdown-from-scrap` 3개 스킬에
> **커버리지 기반 완료 게이트**를 도입. 본문의 `oldText`/`newText`는 실제 파일과 정확히 일치하도록 검증됨.

## 목표

> **큰 분류 완료 = 관련 정책(Trace ID)이 전부 unit/test/commit에 연결 + 영향 준 결정(PC-ID)이 전부 반영 + Coverage Checklist 통과.**

"코드가 돌아감"이 아니라 **"coverage가 닫힘"**이 완료 조건이 된다.

## 커버리지 데이터 경로

```
breakdown Traceability Matrix (정책→화면→Gap→큰 분류)
   │  큰 분류별 Trace ID 추출
   ▼
큰 분류 index.md :: Traceability 표 (초기화: 미할당)
   │  Orientation에서 작은 분류에 Trace ID 배정 → 할당됨
   ▼
각 unit :: Coverage Links 선언 (coveredTraceIds / coveredTestCaseIds / appliedPCIds)
   │  unit 완료 → 부모에 반환
   ▼
부모 집계 :: Traceability 표 + Planning Changes 표 갱신 (구현됨 / 반영 완료)
   │
   ▼
큰 분류 검증 :: Coverage Checklist (전 항목 [x] → 완료)
```

## 상태 어휘

- **Traceability `상태`**: `미할당` → `할당됨` → `구현됨` → `검증완료`
- **Planning Changes `반영 상태`**: `반영 대기` / `반영 완료` / `보류(사유 기록)`
  - 원장(`planning-change-log.md`)의 `구현 반영 완료`와 동기화.

---

# A. `shopl-dev-task-flow/SKILL.md` (6건)

## TF-1. Traceability 표 규칙 (초기화·갱신·전이)

**위치**: `### 로컬 상세 md 구성` 내 큰 분류 index.md 템플릿의 `## Traceability (실행 추적)` 블록.

**oldText**:
```
## Traceability (실행 추적)

| Trace ID | 정책/조건 | API Draft | Unit | Test Case | Commit | 상태 |
|----------|-----------|-----------|------|-----------|--------|------|

- 최초 Trace ID/정책-화면 연결은 분해 문서의 Traceability Matrix에서 가져온다. 이 표는 구현 진행에 따라 unit/test case/commit으로 채운다.
```

**newText**:
```
## Traceability (실행 추적)

| Trace ID | 정책/조건 | API Draft | Unit | Test Case | Commit | 상태 |
|----------|-----------|-----------|------|-----------|--------|------|

- **초기화**: Orientation 진입 시 분해 문서의 Traceability Matrix에서 **이 큰 분류에 해당하는 Trace ID만** 추출해 초기 행을 만든다(상태 `미할당`).
- **갱신**: 각 unit이 완료되면 부모가 unit 반환값(`coveredTraceIds`/`coveredTestCaseIds`/`commitHash`)으로 이 표의 `Unit`/`Test Case`/`Commit`/`상태`를 채운다.
- **상태 전이**: `미할당` → `할당됨`(Orientation에서 unit 배정) → `구현됨`(commit 연결) → `검증완료`(큰 분류 검증 통과).
- 이 표는 큰 분류 검증 게이트의 입력이다. 미해결 Trace ID가 남으면 완료 불가(아래 `작업별 절차` 7단계).
```

**효과**: Traceability 표가 "만들기만 하는 표"에서 "완료 전에 다 닫아야 하는 표"로 승격.

---

## TF-2. Planning Changes 표 갱신·반영 게이트

**위치**: 같은 템플릿의 `## Planning Changes (이 큰 분류에 영향 준 변경)` 블록.

**oldText**:
```
## Planning Changes (이 큰 분류에 영향 준 변경)

| PC-ID | 내용 | 영향 unit | 반영 상태 |
|-------|------|-----------|-----------|

- 이 큰 분류에 영향을 주는 기획 변경/구두 합의는 여기에 연결한다. 원본 변경 원장은 최상위 `planning-change-log.md`(아래 `Planning Change Log 관리` 참조).
```

**newText**:
```
## Planning Changes (이 큰 분류에 영향 준 변경)

| PC-ID | 내용 | 영향 unit | 반영 상태 |
|-------|------|-----------|-----------|

- 이 큰 분류에 영향을 주는 기획 변경/구두 합의는 여기에 연결한다. 원본 변경 원장은 최상위 `planning-change-log.md`(아래 `Planning Change Log 관리` 참조).
- **갱신**: 각 unit이 완료되면 부모가 unit 반환값(`appliedPCIds`)으로 이 표의 `반영 상태`를 갱신한다. `반영 완료`는 원장의 `구현 반영 완료`로도 동기화.
- **반영 상태**: `반영 대기` / `반영 완료` / `보류(사유 기록)`.
- 이 표는 큰 분류 검증 게이트의 입력이다. `반영 대기` PC-ID가 남으면 완료 불가.
```

**효과**: Decision Coverage(A). 구두 합의가 코드에 들어갔는지 검증.

---

## TF-3. 큰 분류 검증 결과 템플릿 → Coverage Checklist (E)

**위치**: 추적 문서 초기 템플릿(큰 분류 상세 파일)의 `## 큰 분류 검증 결과` 블록.

**oldText**:
```
## 큰 분류 검증 결과

대기.
```

**newText**:
```
## 큰 분류 검증 결과

### Coverage Checklist

- [ ] 관련 Trace ID가 전부 unit에 할당됨 (Traceability `미할당` 0건)
- [ ] 관련 Trace ID가 전부 test case + commit에 연결됨 (Traceability `검증완료` 100%)
- [ ] 이 큰 분류에 영향 준 PC-ID가 전부 반영됨 (Planning Changes `반영 대기` 0건)
- [ ] Test Case Review에서 정의한 테스트가 전부 통과함
- [ ] 이 큰 분류 범위의 미확인/보류 항목 잔여 없음 (명시 보류는 허용, 사유 기록)

> 모든 항목이 `[x]`여야 `완료`. 하나라도 미달이면 `재작업 필요` + 미달 항목을 `Open Issues`로 이동.
```

**효과**: 완료 판정을 5개 커버리지 항목으로 정식화. A+B+E가 한 체크리스트에서 실행.

---

## TF-4. 작업별 절차 6.4 / 7 / 9 갱신

**위치**: `## 작업별 절차` 6단계 sub 4-5 + 7·8·9단계.

**oldText**:
```
   4. 부모는 큰 분류 파일의 **Unit Index 행만** 갱신한다 (상태/커밋 해시). 긴 실행 로그는 쓰지 않는다.
   5. 첫 실행 단위 시작 이벤트면 트래커 상태 동기화를 판단한 뒤 다음 단위로 넘어간다.
7. **검증** — 모든 실행 단위가 승인·커밋된 뒤 추적 상태 `검증 중`. 프로젝트 허용 검증 실행, 금지 명령 준수.
8. **결과 기록** — 상세 파일·인덱스 행 갱신.
9. **완료** — 검증 OK 시 추적 상태 `완료`. 트래커 전환은 동기화 매트릭스 따름.
```

**newText**:
```
   4. 부모는 **Unit Index 행(상태/커밋 해시)**과 **Traceability/Planning Changes 표**를 자식 반환값(`coveredTraceIds`/`coveredTestCaseIds`/`appliedPCIds`/`commitHash`)으로 갱신한다. 긴 실행 로그는 쓰지 않는다.
   5. 첫 실행 단위 시작 이벤트면 트래커 상태 동기화를 판단한 뒤 다음 단위로 넘어간다.
7. **검증 (Coverage 게이트)** — 모든 실행 단위가 승인·커밋된 뒤 추적 상태 `검증 중`. 큰 분류 `index.md`의 `Coverage Checklist`를 평가한다(프로젝트 허용 검증 실행, 금지 명령 준수).
8. **결과 기록** — `큰 분류 검증 결과`에 Checklist 결과 기록. 인덱스 행 갱신.
9. **완료** — Checklist 전 항목 `[x]`일 때만 추적 상태 `완료`. 미달 항목이면 `재작업 필요`로 유지하고 `Open Issues`에 적재. 트래커 전환은 동기화 매트릭스 따름.
```

**효과**: 절차가 coverage 집계와 게이트를 실제로 실행하도록 명시.

---

## TF-5. Orientation(4단계)에 Traceability 초기화 추가

**위치**: `## 작업별 절차` 4단계.

**oldText**:
```
4. **Orientation + 작은 분류 생성** — 큰 분류 전체의 얇은 방향을 정리한다. 난이도/공수 점수는 초기화에서 이미 산정되었으므로 확인만(재산정 X). **이 단계에서 코드/현황/API Draft/정책 조건/공통 컴포넌트 매핑표를 읽고 작은 분류를 생성**하여 큰 분류 `index.md`의 Unit Index에 기록한다(작은 분류 생성 원칙·실행 순서·테스트-기능 인접 정렬 — `작은 분류 정렬 및 테스트 원칙` 참조). 공통 컴포넌트/데이터 모델 결정, 주요 리스크도 기록한다. 큰 분류 전체 상세 계획(각 unit의 Plan)은 작성하지 않는다.
```

**newText**:
```
4. **Orientation + 작은 분류 생성 + Traceability 초기화** — 큰 분류 전체의 얇은 방향을 정리한다. 난이도/공수 점수는 초기화에서 이미 산정되었으므로 확인만(재산정 X). **이 단계에서 코드/현황/API Draft/정책 조건/공통 컴포넌트 매핑표를 읽고 작은 분류를 생성**하여 큰 분류 `index.md`의 Unit Index에 기록한다(작은 분류 생성 원칙·실행 순서·테스트-기능 인접 정렬 — `작은 분류 정렬 및 테스트 원칙` 참조). **분해 문서의 Traceability Matrix에서 이 큰 분류의 Trace ID를 추출해 `index.md`의 Traceability 표를 초기화(상태 `미할당`)하고, 작은 분류에 Trace ID를 배정한다(배정 항목 `할당됨`).** 공통 컴포넌트/데이터 모델 결정, 주요 리스크도 기록한다. 큰 분류 전체 상세 계획(각 unit의 Plan)은 작성하지 않는다.
```

**효과**: Traceability가 빈 표로 남지 않고 Orientation에서 실제로 채워짐.

---

## TF-6. 부모/자식 책임 분리 확장

**위치**: `## Planning Change Log 관리` → `### 부모/자식 책임 분리`.

**oldText**:
```
### 부모/자식 책임 분리

- **부모(이 스킬)**: `planning-change-log.md` 원장 유지, PC-ID 발급/상태 갱신, 큰 분류 `index.md`의 `Planning Changes` 표로 라우팅.
- **자식(`shopl-dev-task-flow-unit`)**: 자기 unit에 적용한 PC-ID만 unit 파일에 기록하고 반영 결과를 부모에 반환. 원장 갱신은 부모가 수행.
```

**newText**:
```
### 부모/자식 책임 분리

- **부모(이 스킬)**: `planning-change-log.md` 원장 유지, PC-ID 발급/상태 갱신. 큰 분류 `index.md`의 **Traceability/Planning Changes 표**를 자식 반환값으로 집계. 큰 분류 검증 시 Coverage Checklist 평가.
- **자식(`shopl-dev-task-flow-unit`)**: 자기 unit이 닫는 범위(`coveredTraceIds`/`coveredTestCaseIds`/`appliedPCIds`)를 Coverage Links로 선언·반환. 원장/표 갱신은 부모가 수행.
```

**효과**: 집계 책임을 부모에, 선언 책임을 자식에 명확히 고정.

---

# B. `shopl-dev-task-flow-unit/SKILL.md` (6건)

## TU-1. unit 템플릿에 Coverage Links 섹션 추가

**위치**: unit 파일 템플릿(`## Plan` 과 `## Test Case Review` 사이).

**oldText**:
```
## Plan

- 목표:
- 대상 파일:
- 구현 접근:
- 검증 방법:
- 리스크:

## Test Case Review
```

**newText**:
```
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
```

**효과**: 부모 집계의 입력이 되는 선언 필드. 단일 진실.

---

## TU-2. step 1에 "Coverage Links 작성" 서브규칙 추가

**위치**: 1단계의 `#### Test Case Review 작성 (조건부 필수)` 끝 직후(`### 2.` 직전).

**oldText**:
```
- 표 형식: `ID / 정책·요구사항 / 조건 / 입력 / 기대 결과 / 테스트 레벨`.

### 2. 상세 승인 대기 (Plan + Test Case Review)
```

**newText**:
```
- 표 형식: `ID / 정책·요구사항 / 조건 / 입력 / 기대 결과 / 테스트 레벨`.

#### Coverage Links 작성 (필수)

unit 파일의 `## Coverage Links`에 이 unit이 닫는 범위를 선언한다. 부모가 이 값을 큰 분류 Traceability/Planning Changes 표의 갱신에 사용한다.

- `Covered Trace IDs`: 이 unit이 구현·검증하는 정책 분기/경계값(분해 문서 Traceability Matrix의 Trace ID). 값은 Orientation에서 부모가 배정한 범위에서 선택.
- `Covered Test Case IDs`: 이 unit의 `Test Case Review` 표에 정의한 TC-ID 목록. (Test Case Review가 없는 unit은 `없음`.)
- `Applied PC-IDs`: 이 unit이 반영하는 Planning Change PC-ID 목록. (없으면 `없음`.)
- 골격/단순 DTO/조사/문서 unit은 세 항목 모두 `해당 없음`.

### 2. 상세 승인 대기 (Plan + Coverage Links + Test Case Review)
```

**효과**: Coverage Links의 작성 시점·채움 규칙 명시. 승인 범위에 Coverage Links 포함.

---

## TU-3. step 2 승인 본문에 Coverage Links 반영

**위치**: 2단계 본문 첫 문단 + 마지막 문단.

**oldText**:
```
작성한 계획과 테스트 케이스 표를 함께 사용자에게 제시하고 승인을 기다린다. 승인 전에는 어떤 구현 변경도 하지 않는다.
```

**newText**:
```
작성한 계획, Coverage Links, (필수면) 테스트 케이스 표를 함께 사용자에게 제시하고 승인을 기다린다. 승인 전에는 어떤 구현 변경도 하지 않는다.
```

**oldText**:
```
승인 표현 표는 아래 `승인 게이트` 참조. 승인은 Plan과 Test Case Review를 모두 포함한다. 테스트 케이스 수정 요청이 오면 Plan이 아니어도 Test Case Review를 고치고 재승인받는다.
```

**newText**:
```
승인 표현 표는 아래 `승인 게이트` 참조. 승인은 Plan·Coverage Links·Test Case Review를 모두 포함한다. Coverage Links나 테스트 케이스 수정 요청이 오면 Plan이 아니어도 해당 섹션을 고치고 재승인받는다.
```

**효과**: 승인 객체에 Coverage Links 포함. 커버리지 범위 변경도 재승인 트리거.

---

## TU-4. step 7 기록 항목에 Coverage Links 추가

**위치**: 7단계 `unit 파일에 결과를 기록한다:` 목록.

**oldText**:
```
- `## Execution Result` / `## Verification Result` / `## Diff Review` / `## Commit`(커밋 해시) / `## Open Issues` 채우기
```

**newText**:
```
- `## Coverage Links`를 최종값으로 확정(구현 중 범위가 바뀌면 갱신) / `## Execution Result` / `## Verification Result` / `## Diff Review` / `## Commit`(커밋 해시) / `## Open Issues` 채우기
```

**효과**: 구현 중 커버리지 범위 변동을 최종 확정값으로 반영.

---

## TU-5. 반환 계약에 커버리지 필드 추가

**위치**: `## 반환 계약 (Return Contract)` 표의 `appliedPCIds` 행 뒤.

**oldText**:
```
| `appliedPCIds` | 이 unit에 적용한 Planning Change PC-ID 목록 (없으면 빈 목록). 부모가 `planning-change-log.md` 상태 갱신에 사용 |
```

**newText**:
```
| `appliedPCIds` | 이 unit에 적용한 Planning Change PC-ID 목록 (없으면 빈 목록). 부모가 `planning-change-log.md` 상태 갱신에 사용 |
| `coveredTraceIds` | 이 unit이 닫은 Trace ID 목록 (없으면 빈 목록). 부모가 큰 분류 Traceability 표 갱신에 사용 |
| `coveredTestCaseIds` | 이 unit이 검증한 TC-ID 목록 (없으면 빈 목록). 부모가 큰 분류 Traceability 표 갱신에 사용 |
```

**효과**: 부모 집계의 실제 입력 채널. 기계적 연결.

---

## TU-6. 작업 완료 조건에 coverage 선언 추가

**위치**: `## 작업 완료 조건` 목록.

**oldText**:
```
1. unit 파일(`unitFilePath`)의 Plan/Test Case Review/User Review/Execution/Diff/Verification/Commit이 전부 기록됨. (테스트 케이스가 의미 있는 unit은 Test Case Review가 사용자 승인된 상태여야 함.)
2. diff 승인 후 커밋 완료.
3. unit 파일 헤더 `상태:`가 `완료`(또는 `차단`)로 설정됨.
4. 반환 계약의 핵심 값(`unitFilePath`, `unitStatus`, `changedFiles`, `commitHash`, `needsTrackerSync`)이 정리됨.
5. 적용한 PC-ID가 있으면 부모에게 전달(`planning-change-log.md` 갱신은 부모가 수행).
```

**newText**:
```
1. unit 파일(`unitFilePath`)의 Plan/Coverage Links/Test Case Review/User Review/Execution/Diff/Verification/Commit이 전부 기록됨. (테스트 케이스가 의미 있는 unit은 Test Case Review가 사용자 승인된 상태여야 함.)
2. diff 승인 후 커밋 완료.
3. unit 파일 헤더 `상태:`가 `완료`(또는 `차단`)로 설정됨.
4. 반환 계약의 핵심 값(`unitFilePath`, `unitStatus`, `changedFiles`, `commitHash`, `coveredTraceIds`, `coveredTestCaseIds`, `appliedPCIds`, `needsTrackerSync`)이 정리됨.
5. 적용한 PC-ID가 있으면 부모에게 전달(`planning-change-log.md` 갱신은 부모가 수행).
6. Coverage Links가 부모에 반환됨 — 부모가 큰 분류 coverage 집계에 사용.
```

**효과**: unit 완료 = coverage 선언 완료로 정합.

---

# C. `shopl-dev-backend-breakdown-from-scrap/SKILL.md` (1건)

## BD-1. Traceability Matrix `큰 분류` 열 필수화

**위치**: `## Traceability Matrix 형식` 의 완전성 규칙 문장.

**oldText**:
```
정책서의 모든 분기/경계값이 최소 한 Trace ID에 걸리도록 작성한다. 걸리지 않는 정책 항목이 있으면 기획 누락이므로 큰 분류 또는 확인 필요로 환원한다.
```

**newText**:
```
정책서의 모든 분기/경계값이 최소 한 Trace ID에 걸리도록 작성한다. 걸리지 않는 정책 항목이 있으면 기획 누락이므로 큰 분류 또는 확인 필요로 환원한다. **`큰 분류` 열은 반드시 채운다** — `shopl-dev-task-flow`가 Orientation에서 이 열로 각 큰 분류의 Trace ID를 추출해 큰 분류 `index.md`의 Traceability 표를 초기화하기 때문이다. 한 Trace ID가 여러 큰 분류에 걸치면 콤마로 나열한다.
```

**효과**: task-flow의 큰 분류별 Trace 추출이 빈칸 없이 동작.

---

# 적용 순서

1. **task-flow-unit** (TU-1→TU-6): Coverage Links + 반환 계약. 자식쪽부터 (부모가 의존).
2. **task-flow** (TF-1→TF-6): 집계 + 게이트. 자식 반환값에 의존.
3. **backend-breakdown** (BD-1): 큰 분류 열 필수화.
4. **검증**: YAML 파싱 · 코드펜스 균형 · oldText 일치 재확인.

# 드라이런 시나리오 (적용 후 문서 시뮬레이션)

시나리오: 큰 분류 1, Trace 3개(TR-001/2/3), PC 2개(PC-001/2), unit 3개.

| 결함 상황 | 게이트에서 잡히는가? |
|---|---|
| TR-003가 어느 unit에도 배정 안 됨 | Checklist 1번: Traceability `미할당` 1건 → 완료 불가 |
| TR-002는 구현됐지만 test case 연결 누락 | Checklist 2번: `검증완료` 아님 → 완료 불가 |
| PC-002 반영됐으나 Planning Changes 표 `반영 대기`로 방치 | Checklist 3번: `반영 대기` 1건 → 완료 불가 |
| Test Case Review의 TC-04가 커밋에 연결 안 됨 | Checklist 4번 → 완료 불가 |
| unit이 Coverage Links를 안 씀 | TU-6 완료 조건 위반 → unit 자체가 완료 불가(부모 도달 전 차단) |
| 골격 unit이 Coverage Links 생략 | TU-1 안내대로 "해당 없음" 기록 → 통과 |

모든 결함이 절차상 실제로 걸러짐을 확인.
