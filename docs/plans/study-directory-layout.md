# Study directory layout implementation plan

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** study 확장의 프로덕션 코드와 테스트 코드를 분리하고 기능별 디렉터리로 탐색성 개선.

**Architecture:** 루트 `index.ts`는 Pi 진입점으로 유지. 구현은 `src/{assessment,bridge,checkpoint,curriculum,lab,project,review,session}/`, 테스트는 동일 기능별 `tests/` 및 `tests/integration/`, 공통 fixture는 `tests/support/`로 이동. HTML·프롬프트·지침 위치와 외부 동작은 유지.

**Tech Stack:** TypeScript, Node.js 22 test runner, Pi jiti.

## 목차

- [범위](#범위)
- [단계](#단계)
- [검증](#검증)
- [실행 결과](#실행-결과)

## 범위

- 브랜치: `refactor/study-directory-layout`.
- 기존 미추적 `docs/plans/learnharness-study/` 보존. 커밋·병합·푸시는 별도 요청 없으면 미수행.
- 파일명·공개 함수·도구 schema·상태 형식·학습 흐름 변경 없음.
- 단순 `src/`와 `tests/`만 분리하는 방식은 파일 밀집 문제가 남음. 기능별 분류를 양쪽에 동일 적용.
- 기존 `docs/plans/`의 과거 구현 경로는 당시 기록으로 보존. 현행 README와 실행 명령은 갱신.

## 단계

### 1. 회귀 기준선과 구조 테스트

**TDD scenario:** 기존 테스트 확인 후 파일 이동. 구조 규칙은 신규 실패 테스트로 고정.

- 기존 `NODE_PATH="$(npm root -g)" node --test *.test.ts` 134개 통과 확인.
- `tests/integration/directory-layout.test.ts` 작성: 루트 TS는 index만, src 테스트 금지, tests 프로덕션 import 경계, 기능별 디렉터리, 리소스 로드 확인.
- 기존 flat 구조에서 구조 assertion 실패 확인.

### 2. 파일 이동 및 경로 갱신

**Files:** `runtime/pi/extensions/study/index.ts`, 기존 최상위 `*.ts`, `test-support/fixtures.ts`.

- 프로덕션 34개 모듈을 기능별 `src/`로 이동.
- 기존 테스트를 대응하는 `tests/`로 이동. extension 등록 테스트는 `tests/integration/`, fixture는 `tests/support/`.
- 각 상대 import/export 및 jiti import의 원래 대상 보존.
- phase 지침 로더의 `instructions/`, 테스트의 HTML/프롬프트/지침 URL을 실제 위치로 갱신.
- 복잡한 alias나 barrel export, 호환 stub 미추가.

### 3. 문서·검증

**Files:** `runtime/pi/extensions/study/README.md`, 본 계획.

- README 트리·유지보수 위치·테스트 명령을 새 구조로 교체.
- Node.js 22에서 `node --test 'tests/**/*.test.ts'` 실행. shell globstar 설정에 의존하지 않도록 인용.
- Pi host 전체 테스트, 일반 Node 테스트, strict TypeScript, 포맷, 저장소 무결성, diff whitespace 검증.
- 기계적 이동 전후 소스를 비교해 import/리소스 경로 외 실행 코드 변화 없는지 확인.

## 검증

```bash
cd runtime/pi/extensions/study
NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts'
node --test 'tests/**/*.test.ts'
prettier --check 'index.ts' 'src/**/*.ts' 'tests/**/*.ts'
```

저장소 루트: `bash scripts/check-resources`, `git diff --check`.

## 실행 결과

- 프로덕션 모듈 34개를 `src/`의 기능별 디렉터리로 이동. 루트 TS는 `index.ts` 하나만 유지.
- 기존 테스트 파일 27개를 기능별 `tests/`와 `tests/integration/`으로 이동. fixture는 `tests/support/fixtures.ts`로 분리.
- 디렉터리 회귀 테스트 3개 추가: 루트 진입점만 유지, 기능별 src/tests 대응, 프로덕션 → 테스트 의존 금지.
- Pi host 전체 실행: **137 tests passed, skip 0**. 일반 Node 실행: **135 passed, host 전용 2개 skipped**.
- strict TypeScript, Prettier, 저장소 무결성, whitespace 검사 통과.
- 기존 TS 파일 63개를 원본과 대조. import·jiti import·리소스 상대 경로와 그에 따른 포맷 외 차이 없음.
- README 트리·수정 위치·재귀 테스트/포맷 명령 갱신. HTML·프롬프트·지침 원본 변경 없음.
- 실제 학습 프로젝트·기존 미추적 문서 변경 없음. 커밋·병합·푸시·현재 실행 세션 reload 미수행.
