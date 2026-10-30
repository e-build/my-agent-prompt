# Study LearnHarness 통합 — 구현 검증 기록

## 목차

- [요약](#요약)
- [실행한 검증 명령과 결과](#실행한-검증-명령과-결과)
- [테스트 수 변화](#테스트-수-변화)
- [설계 요구 추적](#설계-요구-추적)
- [계획 대비 파일 구성 차이](#계획-대비-파일-구성-차이)
- [기존 동작에서 바뀐 점](#기존-동작에서-바뀐-점)
- [하지 않은 것과 한계](#하지-않은-것과-한계)
- [다음 단계 — 별도 승인 필요](#다음-단계--별도-승인-필요)

## 요약

- 범위: [구현 계획](2026-10-30-study-learnharness-implementation.md) Phase A–G, Task 1–22
- 브랜치: `main`, 사용자 지시대로 별도 브랜치 없음. 계획 커밋 `6711a0e` 이후 작업별 커밋(검증 기록 포함), 모두 **푸시 안 함**
- 결과: 자동 테스트 **306개 모두 통과**, 기준선 137개 포함
- 실제 학습 저장소 `/Users/jimmylee/IdeaProjects/study`: **변경 없음**. 등록·이전·일정 생성 모두 미실행

## 실행한 검증 명령과 결과

기준일 2026-10-30, 작업 디렉터리 `runtime/pi/extensions/study`.

| 명령 | 결과 |
|---|---|
| `NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts'` | tests 306 / pass 306 / fail 0 / skipped 0. 3회 반복 실행 동일 |
| `node --test 'tests/**/*.test.ts'` (Pi host 없이) | tests 306 / pass 300 / fail 0 / skipped 6. skip은 Pi host가 필요한 등록 테스트 6개 |
| `bash scripts/check-resources` (저장소 루트) | All checks passed |
| `git diff --check` | 문제 없음 |
| Markdown 목차 앵커·코드 펜스 검사 (README, study-review, review-integration) | 모두 정상 |
| 실제 study 저장소 `git status` | 기존에 있던 `study-thread-pool-from-scratch/.study/state.json` 수정 1건만. 이번 작업으로 생긴 파일 없음 |

- **Prettier·tsc 미실행**: 이 PC에 설치돼 있지 않음(`command -v prettier tsc` 결과 없음). 계획대로 새로 설치하지 않음. 타입 오류는 Node 22의 type stripping 실행과 Pi host 로드(jiti) 테스트로만 간접 확인
- 등록 테스트는 실제 Pi entry point(`index.ts`)를 jiti로 로드한 mock host 기준. **실제 Pi 세션에서 `/reload` 후 사용한 검증은 아직 안 함**

## 테스트 수 변화

| 기능 | 테스트 수 | 비고 |
|---|---:|---|
| workspace | 43 | 신규. 탐색·쓰기 범위·원자적 쓰기·변경 계획·잠금·복구·등록·이전 |
| knowledge | 33 | 신규. 명제 계약·저장·병합·교재 영역·지도·무결성·출처 위치 |
| evidence | 17 | 신규. 출제 전 기준·원 응답·지식별 판정·기존 기록 연결 |
| review | 39 | 기존 + 통합 일정·병합·조회·시험 완료 연결 |
| session | 56 | 기존 + 대화형 진단·개념 완료·guard·위젯·phase 저장 결과 |
| integration | 21 | 기존 + 전체 흐름·이식성·쓰기 복구·지침 계약·entry point |
| 그 외 기존 기능 | 97 | assessment 22·bridge 21·checkpoint 15·lab 12·project 21·curriculum 6 |
| **합계** | **306** | |

- 기준선 137개 중 **삭제한 테스트 없음**
- 기존 테스트를 바꾼 곳: 등록 도구·명령 목록에 새 이름 추가, `workspace-lock` 순서 단정을 “겹치지 않음” 단정으로 수정(잠금 획득 순서는 보장 대상이 아니어서 간헐 실패했음)

## 설계 요구 추적

| 설계 절 | 구현 위치 | 대표 검증 |
|---|---|---|
| 1 진단 — 대화, 경로 결정 시 종료, 상한 8, 재개 시 유지 | `session/dialogue-state.ts`, `dialogue-store.ts`, `learning-route-tools.ts`, `instructions/diagnosis.md` | `dialogue-state.test.ts`, `dialogue-store.test.ts` |
| 1 개념 학습 → 실습 순서, 실습 도움 수준 | `session/concept-completion.ts`, `instructions/concept.md`, `lab.md` | `concept-completion.test.ts`, `learning-instructions.test.ts` |
| 1 HTML 완료 시험 유지 | `session/assessment-open-guard.ts`, 기존 assessment | `assessment-open-guard.test.ts`, `study-routes.test.ts` |
| 2 명제·공동 전제·버전·보수적 병합·해제 | `knowledge/knowledge-*.ts` | `knowledge-validation.test.ts`, `knowledge-changes.test.ts` |
| 2 미확정 지식은 교재·채점 기준 금지 | `textbook-regions.ts`, `question-store.ts` | `textbook-regions.test.ts`, `question-store.test.ts` |
| 3 원 응답 보존·도움 구분·지식별 판정·사슬 별도 | `evidence/evidence-store.ts` | `evidence-store.test.ts` |
| 3 출제 전 기준 저장·정답 비노출·정정 보존 | `evidence/question-store.ts` | `question-store.test.ts`, entry point 테스트 |
| 4 교재 관리 영역·직접 수정 보류·표시 밖 불변 | `knowledge/textbook-regions.ts`, `textbook-refresh.ts` | `textbook-regions.test.ts`, `write-recovery.test.ts` |
| 5 통합 복습 규칙 전부 | `review/review-schedule.ts`, `review-store.ts`, `review-query.ts` | `review-schedule.test.ts`, `integrated-learning.test.ts` |
| 6–7 저장 구조·변경 계획·잠금·복구 | `workspace/change-plan.ts`, `workspace-lock.ts`, `recovery.ts` | `change-plan.test.ts`, `write-recovery.test.ts` |
| 8 루트 탐색·상대 경로·쓰기 범위·PC별 자료 | `workspace/workspace-root.ts`, `safe-path.ts`, `knowledge/source-locator.ts` | `workspace-portability.test.ts`, `source-locator.test.ts` |
| 8 PC 간 충돌 후 검사 | `knowledge/knowledge-integrity.ts` + `/study-workspace check` | `knowledge-integrity.test.ts` |
| 9 상태 위젯·읽기 전용 지도 | `session/study-widget.ts`, `knowledge/knowledge-view.ts`, `bridge/knowledge-routes.ts` | `study-widget.test.ts`, `knowledge-view.test.ts` |
| 11 실패 처리·보안 경계 | 저장 실패 반환, CSP, HTML escape, 경로 검사 | `phase-state.test.ts`, `knowledge-routes.test.ts` |
| 12 기존 기록 이전 — 미리 보기·승인·원본 불변·되돌리기 | `workspace/migration-plan.ts` | `migration-plan.test.ts`, `migration-tools.test.ts` |
| 14-7 지침 정리 | `instructions/*`, `prompts/*`, study-dialogue 스킬 | `learning-instructions.test.ts` |

## 계획 대비 파일 구성 차이

계획에 적은 파일 이름과 다르게 묶은 경우. 동작은 오른쪽 파일에 구현·검증됐고, 빈 파일은 만들지 않았다.

| 계획의 파일 | 실제 위치 | 이유 |
|---|---|---|
| `src/workspace/workspace-tools.ts` | `workspace-command.ts`(Pi 등록), `workspace-command-core.ts`·`workspace-actions.ts`(순수 로직) | typebox 없이 테스트하려고 등록과 로직 분리 |
| `src/workspace/migration-tools.ts` | `migration-plan.ts` + `/study-workspace migrate` (`workspace-command-core.ts`) | 쓰기 동작을 사용자 명령으로만 노출. 별도 agent 도구 없음 |
| `src/evidence/evidence-validation.ts`, `answer-tools.ts` | `evidence-store.ts`(검증 포함), `question-tools.ts`(`study_answer_record` 등록) | 검증이 저장과 한 곳에서만 쓰여 분리 이득 없음 |
| `tests/evidence/evidence-validation.test.ts` | `tests/evidence/evidence-store.test.ts` | 위와 같음 |
| `tests/knowledge/knowledge-tools.test.ts`, `tests/evidence/question-tools.test.ts` | `tests/integration/extension-registration.test.ts`의 entry point 흐름 테스트 | 도구는 실제 Pi host 로드로 검증 |
| `tests/review/review-date.test.ts` | `tests/review/review-schedule.test.ts` | 날짜 계산과 일정 계산을 함께 검증 |
| `tests/review/integrated-review-page.test.ts` | `tests/review/review-query.test.ts` | 조회와 페이지를 함께 검증 |
| `assets/knowledge-template.html` | `src/knowledge/knowledge-view.ts`의 `renderKnowledgeMap` | 스크립트 없는 정적 HTML을 코드에서 만들고 escape·CSP를 테스트로 확인 |

## 기존 동작에서 바뀐 점

- **새 진단은 대화형.** test 단계에서만 `study_test_open` 호출을 1회 독촉. 이미 열려 있던 HTML 진단은 기존 안내 유지
- **손상된 `state.json`·`project.json`을 다시 만들지 않음.** 이전에는 조용히 Markdown에서 재생성해 진도가 초기화될 수 있었음. 이제 오류로 알림. 파일이 없을 때만 기존 migration 수행
- **phase 저장 실패를 결과로 반환.** lab 도구 출력에 경고 표시
- 시험 통과 시: 등록된 루트면 통합 복습 자동 등록, 미등록이면 기존 챕터 시작 페이지
- `study_review_refresh`: 등록된 프로젝트는 루트 통합 복습 페이지 갱신, 챕터 `schedule.md`를 만들지 않음
- `syncReviewPhase`가 사용자가 고른 `skipped_understood`를 덮어쓰지 않음

## 하지 않은 것과 한계

- 실제 Pi에서 `/reload` 후 브라우저·위젯 확인 안 함. mock host 테스트까지만 수행
- 의미가 같은지, 답이 맞는지는 **에이전트 판단**. 코드는 구조·버전·출처·원본 보존만 검증하며 판단의 정확성을 보증하지 않음
- 지도 배치는 단순 격자. 노드가 많으면 읽기 어려울 수 있어 표 보기를 함께 제공
- 같은 PC의 동시 실행은 잠금으로 막음. 두 PC가 Git으로 합친 뒤의 충돌은 자동 해결하지 않고 `/study-workspace check`로 찾아 보고
- 임의 프로세스가 검사와 쓰기 사이에 상위 폴더를 바꾸는 공격까지 막는다고 보장하지 않음
- Prettier·타입 검사 미실행

## 다음 단계 — 별도 승인 필요

1. 실제 Pi `/reload` 후 임시 study 루트에서 파일럿: 진단 → 개념 → 실습 → 시험 → 복습 연결 확인
2. 실제 study 저장소 이전
   - 먼저 `study-thread-pool-from-scratch/.study/state.json`의 커밋되지 않은 변경 정리(사용자 결정)
   - `/study-workspace migrate preview ~/IdeaProjects/study`로 미리 보기 확인
   - 승인 후 `migrate apply <digest>`. redis ch-03/04는 건너뜀 유지, ch-01/02는 요청할 때만 복습 시작
3. `main` 푸시
