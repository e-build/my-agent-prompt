# Interactive Chapter Test Plan

## Context

`/study-chapter`의 lab 이후 test 단계는 현재 `test.md`에 문제와 답안란을 작성한 뒤 학습자가 파일을 직접 편집해야 한다. 이를 사전진단과 동일하게 브라우저에서 답안 작성 → Pi 제출 → 동일 화면에서 점수·정답·해설 확인 → 다음 단계 선택까지 가능한 인터랙티브 흐름으로 바꾼다.

합의된 동작:

- `test.md`에는 각 시도의 **문제·학습자 답안·채점 결과**를 모두 보존한다.
- 결과 확인 후 **통과면 복습**, **미달이면 부족한 개념만 재학습**하도록 점수별 CTA를 제공한다.

## Approach

### 1. diagnosis UI를 범용 assessment UI로 재사용

- 기존 diagnosis 템플릿의 문항 입력, localStorage 임시 저장, 필수문항 검증, 진행률, 제출 대기/polling, 문항별 결과 UI를 `assessment-template.html` 공통 템플릿으로 일반화한다.
- diagnosis/test별 문구, bridge URL, submission kind, grade marker, 결과 CTA는 주입된 mode config로 결정한다.
- test는 새 `study_test_open` tool이 `ch-{slug}/test.html`을 만들고 브라우저를 자동으로 연다. 학습자에게 파일 열기나 복사/붙여넣기를 요구하지 않는다.
- localStorage key에는 assessment session/attempt ID를 포함해 재시험이 이전 답안·채점 결과를 불러오지 않게 한다.
- test-taking 화면은 한 번에 학습 과제에 집중할 수 있는 단일 컬럼, 낮은 시각 밀도, 하나의 주 CTA를 유지한다. 진단의 pinpoint UI는 test에는 노출하지 않고 결과별 다음 행동만 명확하게 제공한다.

### 2. test 전용 protocol과 session 분리

- diagnosis와 별도로 test session map/status를 관리하고 HTTP route를 `/test/:id`, `/api/study-test/:id/{submit,result,ack}`로 분리한다.
- 중복 submit/ack는 session 상태로 방지해 같은 답안이나 handoff 신호가 Pi에 여러 번 전달되지 않게 한다.
- 제출 시 `# TEST_SUBMISSION_RECEIVED`를 현재 Pi 세션에 보내고, AI 응답의 `TEST_GRADE_JSON` marker를 추출해 같은 브라우저에 표시한다.
- grade에는 `testId`, `attempt`, `totalScore`, `maxScore`, `passScore`, `passed`, `summary`, `weaknesses`, 문항별 `score/status/correctAnswer/explanation/advice`를 포함한다.
- 결과 확인 버튼은 grade에 따라 같은 ack endpoint로 `{ nextAction: "review" | "relearn" }`을 보내고, Pi에는 `# TEST_RESULTS_REVIEWED` 신호와 점수·약점·다음 행동을 전달한다.

### 3. test 출제와 기록 정책

- `TestQuestionSet`은 기존 문항 타입(`single-choice`, `multiple-choice`, `short-answer`, `essay`, `code`, `sql`)과 section 구조를 재사용하되 diagnosis의 최소 10문항/70:20:10 검증은 적용하지 않는다.
- test는 보통 5~8문항, 총 100점, 기본 통과 기준 70점으로 구성하고 JSON의 `passScore`로 명시한다.
- diagnosis보다 한 단계 어렵게 만들고, lab 예시를 그대로 반복하지 않으며 조건 변경·비교·판단·원인 분석을 포함한다.
- 정답/모범답안 전문은 questions JSON/HTML에 넣지 않고 Pi 채점 컨텍스트에만 유지한다.
- `test.md`는 attempt 단위로 누적한다. 각 attempt에 출제 시각, 통과 기준, 문제 스냅샷, 학습자 답안, 문항별 점수/정답/해설/보완점, 총점, 통과 여부를 기록한다.
- 미달이면 `test.md` 상태를 `미통과 — 재학습 필요`로 남기고 틀린 개념만 보강한다. 그 뒤 기존 문제 재사용이 아닌 새 변형 문제로 다음 attempt를 연다.

### 4. 상태 감지와 다음 단계

- `/study-chapter`의 test 상태 감지를 단순 “채점 기록 존재 여부”에서 최신 attempt의 상태로 변경한다.
  - 진행 중/미채점: 현재 test를 진행한다.
  - 미통과: weaknesses에 한정해 재학습한 뒤 새 test attempt를 연다.
  - 통과: review로 전환한다.
- 통과 결과 CTA는 `Pi에서 복습 시작`, 미달 결과 CTA는 `Pi에서 부족한 개념 재학습`으로 표시한다.
- 재학습은 전체 concept/lab 반복이 아니라 채점된 weakness에 한정한다.

### 5. UI/UX Pro Max 기반 학습자 경험 보완

`ui-ux-pro-max`의 인터랙티브 assessment/form 가이드 검토 결과를 구현 요구사항으로 반영한다.

- **집중과 인지 부하:** minimal single-column 구조, 760px 내외 읽기 폭, 충분한 문항 간 여백, 상단에 `답변 수/전체 문항`과 총점·통과 기준을 항상 보여준다. 불필요한 nav, 장식, leaderboard형 요소는 넣지 않는다.
- **진행과 상태 피드백:** 답안 작성 → 제출 확인 → 채점 중 → 결과 → 다음 행동의 상태를 명시한다. 제출 버튼은 전송 중 비활성화하고 중복 제출을 막으며, 긴 AI 채점 대기에는 현재 상태와 “이 탭을 유지해도 된다”는 설명을 제공한다.
- **검증 UX:** 필수문항 오류는 제출 시 첫 누락 문항으로 이동하는 것에 더해 문항 가까이에 텍스트 오류를 표시하고 `role="alert"`/`aria-live`로 알린다. 색상만으로 누락·정답·오답을 구분하지 않고 아이콘/상태 텍스트를 함께 쓴다.
- **폼 접근성:** 모든 textarea/input에 실제 `<label>` 또는 접근 가능한 이름을 연결하고, 키보드 tab 순서를 DOM 순서와 일치시킨다. 모든 기능을 키보드만으로 수행할 수 있게 하며 `:focus-visible`을 명확히 유지한다.
- **터치/반응형:** 주요 버튼/선택지는 최소 44px hit area와 8px 이상 간격을 보장한다. 375/768/1024/1440px에서 수평 스크롤 없이 동작하고, 모바일 sticky dock이 마지막 결과/입력 영역을 가리지 않게 safe padding을 둔다.
- **가독성과 대비:** 본문은 최소 16px/1.5 line-height, 보조 텍스트는 지나치게 작거나 옅지 않게 하고 WCAG AA 4.5:1 대비를 확인한다. 성공/주의/오답 색은 기존 semantic token을 쓰되 색상 외 라벨을 병행한다.
- **모션:** 전환은 150~300ms의 짧은 의미 있는 피드백만 사용한다. 채점 pulse/스크롤/종료 countdown은 `prefers-reduced-motion`에서 animation과 smooth scroll을 끄거나 즉시 상태 전환한다.
- **코드 문항:** prompt/description의 fenced code를 평문으로 노출하지 말고 안전한 `<pre><code>`로 렌더링해 기술 학습 문항의 스캔성을 높인다.
- **답안 안전성:** localStorage 저장 여부와 마지막 저장 상태를 작게 표시하고, 제출 전에는 답안을 수정할 수 있으며 제출 후에는 입력을 잠가 채점 결과와 “내 답”이 일치하게 한다. 새 attempt는 이전 attempt와 저장 키를 격리한다.
- **결과 이해:** 결과 상단에서 `통과/미통과`, 점수, 통과 기준, 취약 개념, 권장 다음 행동을 한눈에 보여준다. 각 문항은 내 답 → 정답 → 해설 → 보완 순서를 유지하고, 결과 CTA는 점수에 맞는 하나의 primary action만 강조한다.

## Files to modify

- `pi/extensions/study/index.ts`
  - test session/tool/routes, marker 추출, 제출/ack prompt, cleanup 추가
  - diagnosis/test 공통 assessment helper로 중복 축소
- `pi/extensions/study/assets/assessment-template.html`
  - 기존 diagnosis 템플릿을 rename하고 diagnosis 전용 상수·문구·bridge를 mode config 기반으로 일반화
  - diagnosis와 test tool이 공유
- `pi/extensions/study/prompts/study-chapter.md`
  - test schema, 출제/채점 marker, 결과 handoff, attempt 기록, 상태 감지 규칙 추가
- `pi/extensions/study/prompts/study-init.md`
  - 챕터 산출물에 `test.html`과 인터랙티브 test 생성 규칙 반영
- `pi/extensions/study/README.md`
  - `study_test_open`과 전체 test lifecycle 문서화
- `pi/README.md`
  - study extension tool/asset 목록 갱신
- `AGENTS.md`
  - study extension mapping 설명에 인터랙티브 test 추가
- `pi/extensions/study/assessment-core.ts` (신규, 필요 시)
  - framework 의존성이 없는 question validation, marker parsing, pass/next-action 판정 helper
- `pi/extensions/study/assessment-core.test.ts` (신규)
  - Node test runner 기반 protocol/validation 단위 테스트

## Reuse

- `pi/extensions/study/index.ts`
  - `study_diagnosis_open`, session-scoped HTTP server, `pi.sendUserMessage()` + follow-up fallback
  - assistant message text/grade marker 추출, CORS/body parsing, `openBrowser`, shutdown cleanup
- `pi/extensions/study/assets/assessment-template.html`
  - 기존 diagnosis UI에서 재사용한 모든 문항 타입 렌더링, 답안 저장/복원, 진행률, 제출 대기/polling, 점수 요약, 정답·해설·보완점 렌더링, 종료 화면
- `pi/extensions/study/prompts/study-chapter.md`
  - 기존 “diagnosis보다 높은 난이도”, “lab 직접 반복 금지”, “미달 개념만 재학습” 정책
- `pi/extensions/cliproxyapi-sync.test.ts`
  - 저장소의 `node:test` + `node:assert/strict` 테스트 스타일과 실행 방식

## Steps

- [ ] 공통 `AssessmentQuestionSet`과 test 전용 필드(`passScore`, `attempt`) 및 grade/handoff JSON 계약을 정의한다.
- [ ] 기존 diagnosis template을 mode-config 기반 공통 assessment template으로 일반화하면서 diagnosis 동작을 보존하고, 접근 가능한 label/error/status, 44px target, reduced-motion, fenced-code 렌더링을 추가한다.
- [ ] `index.ts`에 `study_test_open`, test session/routes, `TEST_SUBMISSION_RECEIVED`, `TEST_GRADE_JSON`, `TEST_RESULTS_REVIEWED` bridge를 추가한다.
- [ ] 제출/ack endpoint에 idempotency guard를 넣고 assessment별 grade가 정확한 session에만 연결되게 한다.
- [ ] test 결과 화면에 통과/미달 상태와 점수별 CTA를 렌더링한다.
- [ ] `/study-chapter`가 test JSON 생성 → tool 호출 → 채점 → `test.md` attempt 기록 → 결과별 후속 행동을 수행하도록 지침을 교체한다.
- [ ] 최신 attempt 상태를 기준으로 test/relearn/review를 선택하도록 단계 감지 규칙을 갱신한다.
- [ ] `study-init.md`, extension README, Pi README, AGENTS 문서를 새 tool/artifact 흐름에 맞춘다.
- [ ] 순수 helper 단위 테스트와 브라우저 수동 end-to-end 검증을 수행한다.

## Verification

### Automated

- `node --test --experimental-strip-types pi/extensions/study/assessment-core.test.ts`
- diagnosis/test 문항 validation 차이: diagnosis는 최소 10문항과 비율을 유지하고 test는 5~8문항 권장/`passScore` 유효성만 검사한다.
- `DIAGNOSIS_GRADE_JSON`과 `TEST_GRADE_JSON`이 각각 올바른 session ID로만 배정되는지 확인한다.
- 점수 경계값(69/70 등), 명시적 `passed`, `nextAction` 판정을 테스트한다.
- 중복 submit/ack가 두 번째 Pi 메시지를 만들지 않는 상태 전이를 테스트한다.

### Manual end-to-end

1. diagnosis를 기존 방식으로 끝까지 수행해 공통 template 전환으로 회귀가 없는지 확인한다.
2. lab 완료 챕터에서 test 진입 시 `test.html`과 브라우저가 자동으로 열리는지 확인한다.
3. 객관식/복수선택/단답/서술/code/sql 입력, fenced-code 표시, 새로고침 답안 복원/저장 상태, 필수문항 inline 오류를 확인한다.
4. 키보드만으로 전체 문항 작성·제출·결과 확인·다음 CTA 수행이 가능하고 focus-visible/aria-live가 동작하는지 확인한다.
5. 375/768/1024/1440px에서 수평 스크롤이나 sticky dock 가림이 없고 선택지/버튼 hit area가 44px 이상인지 확인한다.
6. `prefers-reduced-motion: reduce`에서 pulse, smooth scroll, countdown animation이 제거되거나 즉시 완료되는지 확인한다.
7. light mode의 본문/보조 텍스트/상태 색 대비가 WCAG AA를 만족하고, 정오답/누락이 색상 외 텍스트로도 구분되는지 확인한다.
8. 제출 후 입력이 잠기고 Pi 세션에 답안이 한 번만 전달되며, 같은 탭에 통과 상태·점수·기준·내 답·정답·해설·보완점이 표시되는지 확인한다.
9. `test.md`에 문제·답안·채점 결과가 attempt 단위로 남는지 확인한다.
10. 70점 이상은 review CTA/신호로, 70점 미만은 targeted relearn CTA/신호로 분기되는지 확인한다.
11. 미달 후 재학습과 새 변형 재시험을 진행해 이전 localStorage/grade가 섞이지 않고 attempt가 추가되는지 확인한다.
12. diagnosis와 test 세션을 순차 또는 동시에 열어 route/session/grade가 서로 섞이지 않는지 확인한다.
