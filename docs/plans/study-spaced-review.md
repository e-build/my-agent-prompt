# 고정 회차형 복습 Implementation Plan

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** 핵심 개념의 지연 회상을 반복하고 입력 방식을 회차별로 선택하며, 중복 study-pack 대신 정답 비노출 복습 시작 페이지 제공.

**Architecture:** README는 단권화 교재로 유지. schedule.md는 핵심 개념 이름과 고정 회차 일정의 원본, 회차별 문서는 답변·평가 원본. 증거 검증은 문서 생성과 분리. 시작 페이지는 파생된 길 안내이며 시험 완료를 막지 않음.

**Tech Stack:** TypeScript, Node.js node:test, Pi extension API, Markdown.

## 목차

- [범위와 정책](#범위와-정책)
- [Task 1 — 증거 검증 분리](#task-1--증거-검증-분리)
- [Task 2 — 복습 시작 페이지](#task-2--복습-시작-페이지)
- [Task 3 — 완료 판정과 호환](#task-3--완료-판정과-호환)
- [Task 4 — 복습 프롬프트와 회귀](#task-4--복습-프롬프트와-회귀)

## 범위와 정책

- 브랜치: feat/study-spaced-review. 학습 프로젝트 수정 제외.
- 매 지연 회차 STT/텍스트 선택 및 중간 전환. STT 엔진 구현 제외.
- 일정 간격 미합의: 학습자에게 확인 전 날짜 자동 배정 금지.
- 반복 대상 개념 유지, 회차별 강조점만 변경. 교정 직후 성공과 독립 지연 회상 분리.
- 시작 페이지에 정의·정답·오답 교정·원본 본문 미노출.
- 기존 pack은 삭제하지 않고 복습 회상 기록을 legacy-recall.md에 멱등 보존. 출처 문서 원본 유지.
- 기존 tool 이름 study_pack_refresh는 호환 alias만 유지하며 새 pack 생성 금지.
- 완료 의미: 예정된 복습 주기 완료. 장기 기억 정착 인증 아님.

## Task 1 — 증거 검증 분리

**TDD scenario:** Modifying tested code — 기존 46개 테스트 GREEN 확인 완료.

**Files:** study-pack.ts/test.ts → chapter-evidence.ts/test.ts.

1. 기존 검증 테스트를 validateChapterEvidence 호출로 변경. 문서 생성 없이 검증 결과 제공 기대.
2. `node --test chapter-evidence.test.ts` RED 확인.
3. README 개념·최종 시험·lab step 증거 검증을 별도 함수로 추출. findLabRecordGaps 유지.
4. 같은 명령 GREEN 확인. 이전 study-pack 생성기 제거.

## Task 2 — 복습 시작 페이지

**TDD scenario:** New feature — full TDD cycle.

**Files:** review-page.ts, review-page.test.ts.

1. test fixture: 교재 정답, lab 증거, 오답 기록이 페이지에 미포함. schedule.md의 회차와 개념 링크만 표시.
2. 추가 fixture: 빈 일정의 날짜 자동 생성 금지, 미래/당일/과거 회차 구분, 일정만 등록해 완료 처리 금지.
3. legacy pack의 회상 구역 보존·반복 갱신 멱등·원본 유지·위험 링크 거부 테스트.
4. `node --test review-page.test.ts` RED 확인.
5. buildReviewStartPage, scheduleProgress 및 안전한 일정 읽기 구현.
6. 같은 명령 GREEN 확인.

## Task 3 — 완료 판정과 호환

**TDD scenario:** Modifying tested code + missing coverage 추가.

**Files:** index.ts, study-state.ts/test.ts, study-recover.ts, test-completion.ts/test.ts.

1. 통과+ack 시 페이지 생성 실패에도 시험 completed 유지 테스트. 증거 실패는 별도 blocked 검증.
2. test-completion helper 구현 후 ack handler 연결. ack 기록은 await.
3. study_review_refresh 등록. study_pack_refresh는 deprecated alias로 새 page 생성.
4. CLI는 증거 검증→시험 복구→선택적 page 생성. 페이지 생성 오류로 복구 무효화 금지.
5. state migration은 일정 존재/날짜만으로 review completed 처리 금지. 명시적 주기 완료와 완료된 회차로 판정.
6. `node --test *.test.ts` GREEN 확인.

## Task 4 — 복습 프롬프트와 회귀

**TDD scenario:** 지시 문서 변경 및 contract tests.

**Files:** prompts/study-review.md, prompts/study-init.md, instructions/review.md, instructions/test.md, instructions/legacy-study-chapter.md, README.md.

1. 복습 지시를 고정 회차 + 공통 회상 + 회차별 강조점으로 변경.
2. 시작마다 STT/텍스트 질문. 입력 방식과 설명 활동 구분. self-lecture는 구두 설명 의미 유지.
3. schedule.md 원본 표 형식과 append-only 회차 기록 구조 명시. 초기 간격 질문, 실제 경과 기록, 초과 기한·STT 불가 처리.
4. STRONG은 이번 보충 불필요 의미. 같은 개념·기준 질문 반복 허용. 범위 가드 유지.
5. 새 안내판 구조·tool·호환·진도 정책 문서화.
6. 전체 node:test 회귀, Pi jiti factory 로딩 및 등록 tool 실행 fixture로 wiring 검증, git diff --check.
7. 변경 커밋. 기존 학습 데이터 자동 변경 및 브랜치 merge/push는 수행하지 않음.
