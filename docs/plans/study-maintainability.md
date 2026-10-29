# Study maintainability implementation plan

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** study 확장의 외부 동작을 유지하면서 책임 분리, 실제 중복 제거, 타입·테스트·문서 가독성 개선.

**Architecture:** `index.ts`는 세션과 의존성 조립 및 Pi lifecycle 등록에 집중. HTTP transport, study route 처리, 프롬프트 생성, 채점 연결, 도구 등록은 역할별 모듈로 분리. 기존 core 모듈의 책임과 공개 함수는 유지하며 범용 프레임워크는 도입하지 않음.

**Tech Stack:** TypeScript, Node.js built-in test runner, Pi Extension API, TypeBox.

## 목차

- [계약과 기준선](#계약과-기준선)
- [작업 단계](#작업-단계)
- [검증](#검증)
- [실행 결과](#실행-결과)

## 계약과 기준선

- 사용자 선택: study 전체 정리. 별도 `refactor/study-maintainability` 브랜치 사용.
- 기존 `docs/plans/learnharness-study/` 미추적 파일 보존.
- 명령·도구 이름/스키마, HTTP URL/응답, 프롬프트 내용, HTML UI, 저장 형식, phase 전환과 오류 처리 정책 유지.
- 기준선: `node --test *.test.ts` — 108 tests passed.
- `index.ts` 약 1,126줄. transport·route·prompt·tool·grading·lifecycle 혼재.
- 코드 추가가 아닌 추출도 회귀 테스트 우선. 기존 테스트가 있는 core 정리는 변경 전후 통과 확인.

## 작업 단계

### 1. Browser bridge 회귀 경계 확보

**Files:** `runtime/pi/extensions/study/browser-server.test.ts`, `study-routes.test.ts`, `study-sessions.ts`, `browser-server.ts`, `study-routes.ts`.

1. lazy server 시작/종료, HTTP HTML 주입, 알 수 없는 URL/ID, JSON 오류, 중복 제출/확인에 대한 테스트 작성.
2. 추출 API가 없는 상태에서 테스트 실패 확인.
3. 서버 수명과 HTTP 공통 응답을 transport로, 학습 분기를 route로 이동.
4. session 타입은 명시적 공유 타입으로 추출. validated grade 타입 사용.
5. 테스트 재실행. 실제 loopback HTTP로 상태·응답 확인.

### 2. 프롬프트·채점 처리 분리

**Files:** `study-prompts.ts`, `study-prompts.test.ts`, `agent-delivery.ts`, `agent-delivery.test.ts`, `grade-handler.ts`, `grade-handler.test.ts`.

1. 채점 marker/ID/attempt, 저장된 점수 우선, 학습 선호, 메시지 전송 fallback 테스트 작성.
2. prompt 생성 함수를 부수효과 없이 추출하고 전달 재시도만 공통화.
3. grade 검증·파일 기록·session 상태 연결을 handler로 추출. 잘못된 grade는 repair follow-up 유지.
4. 기존 core 채점 테스트와 신규 연결 테스트 재실행.

### 3. 도구 등록·진입점 정리

**Files:** `index.ts`, `assessment-tools.ts`, `curriculum-tool.ts`, `lab-tools.ts`, `review-tools.ts`, `preflight-tool.ts`, `phase-state.ts`, `assessment-page.ts`, `assessment-page.test.ts`.

1. HTML template 치환과 diagnosis/test config의 회귀 테스트 작성.
2. 공통 렌더러 추출. 문항 JSON의 단일 치환 계약 유지.
3. 도구 등록을 기능별로 이동. 외부 schema와 description은 그대로 유지.
4. index에서 의존성 조립, 명령 등록, assessment-open guard, shutdown만 담당.
5. 사용하지 않는 import와 불필요한 any 제거. Pi 설치 환경에서 entry point 로드/등록 smoke 검증.

### 4. Core·테스트·문서 정리

**Files:** study 최상위 `*.ts`, `README.md`.

1. 긴 한 줄 분기·객체·테스트를 일관된 포맷으로 정리. 문자열과 실행 의미 유지.
2. 반복되는 외부 실행 결과 변환은 실제 사용처만 공유.
3. 기존 테스트 fixture를 의미 없이 한 파일로 몰거나 도메인별 검증을 범용 validator로 통합하지 않음.
4. README에 모듈 책임, 수정 위치, 검증 명령 추가. 기존 운영·안전 계약 유지.

## 검증

- 각 단계: `cd runtime/pi/extensions/study && node --test *.test.ts`.
- 신규 테스트: 서버 cleanup, HTTP 오류/중복 요청, prompt 계약, grade 연결, template 치환.
- Pi 설치 환경: entry point import 및 명령/도구 등록 smoke check. 가능하면 TypeScript 검사 병행.
- 저장소: `bash scripts/check-resources`, `git diff --check`.
- 코드와 기계적 포맷 변경을 구분해 diff 검토. 학습 프로젝트 파일 변경 및 실행 중인 extension reload 없음.

## 실행 결과

- `index.ts`: 1,126줄 → 123줄. HTTP transport/routes, prompt/delivery, grade handler, 기능별 도구 등록 분리 완료.
- 신규 회귀 테스트 26개 추가. 기존 108개 포함 **134개 통과, skip 0** — Pi 전역 설치 경로를 `NODE_PATH`로 지정한 전체 실행 기준.
- 테스트 경계: 실제 loopback HTTP, JSON 오류·중복 제출/확인, test 통과/미달/근거 누락/페이지 경고, HTML 치환, 메시지 fallback, grade 검증·기록, Pi entry point 등록·세션 재사용.
- 기존/신규 entry point를 설치된 Pi `jiti`로 각각 로드해 비교: **도구 9개·명령 2개의 이름, 스키마, 설명, prompt guidelines, 등록 순서 동일**.
- TypeScript strict 검사 통과. 검사 도구는 `/tmp/study-refactor-tooling/`에만 설치, 저장소 의존성 추가 없음.
- 타입 보완: `DiagnosisQuestionSet` import, validated session grade 타입, 취소 결과의 `details: undefined`, review label map 타입.
- Prettier 검사, `scripts/check-resources`, `git diff --check` 통과.
- 기존 파일 33개는 기존 소스를 동일 Prettier 설정으로 변환한 결과와 완전히 일치. 나머지 core 변경은 타입 import/공유 runner alias/label map 타입에 한정.
- 실제 브라우저 UI 수동 검증·실행 세션 reload·학습 프로젝트 변경·커밋·푸시는 수행하지 않음.
