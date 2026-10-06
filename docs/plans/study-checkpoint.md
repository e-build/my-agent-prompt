# Study Checkpoint Implementation Plan

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** `/study-checkpoint [chapter]`로 대화 기반 학습 진도를 기록하고 이번 기록만 커밋·푸시.

**Architecture:** 기존 챕터 resolver를 재사용하는 registered command가 대상과 일회성 request를 정하고 학습 기록 작성 지시를 agent에 전달. 전용 tool이 구조화된 내용을 검증하고 기존 checkpoint에 추가한 뒤 Git 작업 수행. 공식 phase·assessment·lab 완료 판정은 변경하지 않음.

**Tech Stack:** Pi Extension API, TypeBox, Node.js fs/child_process, node:test, 로컬 Git 및 bare remote integration tests.

---

## Task 1: 대상·기록 모델

- Create: `runtime/pi/extensions/study/checkpoint-core.ts`
- Test: `runtime/pi/extensions/study/checkpoint-core.test.ts`
- 기존 테스트 baseline: `node --test runtime/pi/extensions/study/*.test.ts` (65 passed).
- 새 테스트 먼저: active chapter 우선, 챕터 명시 선택, 모호한 대상 실패, 구조화된 항목 검증, 기존 기록 보존.
- 상태 구분: 답변 확인 / 이해 자기보고 / 설명 제공 / 건너뜀 / 미확인.
- 챕터 `checkpoint.md`에 snapshot 추가. 실행 검증이나 완료 상태를 추정하지 않음.

## Task 2: Git 격리와 실패 보고

- 같은 core/test 파일에 로컬 bare remote fixture 기반 integration tests 추가.
- 쓰기 전 대상의 기존 미커밋·스테이징·symlink 확인. detached HEAD, upstream 없음, 미푸시 커밋은 중단.
- Git index의 다른 파일은 보존. 해당 checkpoint만 `git commit --only` 후 일반 push. force/pull/stash 없음.
- 변경 전후 commit과 실제 변경 path 검증. 기록·커밋·푸시 실패를 단계별 결과로 반환.
- push 실패는 로컬 기록과 commit을 유지하며 자동 성공 보고 금지.

## Task 3: 명령과 도구 연결

- Create: `runtime/pi/extensions/study/checkpoint-command.ts`
- Test: `runtime/pi/extensions/study/checkpoint-command.test.ts`
- Modify: `runtime/pi/extensions/study/index.ts`
- idle command가 pending request를 만들어 `pi.sendUserMessage` 실행. 대상 확인 및 검증을 완료한 tool만 Git 수행.
- requestId로 명령 호출 권한 연결. 다른 chapter/path는 tool에서 임의 입력하지 못함.
- 파일 read-modify-write는 `withFileMutationQueue`로 보호.
- 프롬프트는 실제 대화·주석 답변·기존 기록 기반, 미확인 항목 보존, 추가 퀴즈 시작 금지.

## Task 4: 문서·검증·배포

- Modify: `runtime/pi/extensions/study/README.md`
- 전체 suite 재실행, diff 검사, live module import/command registration smoke test.
- 익스텐션 변경만 커밋·푸시. 기존 unrelated skill 수정 제외.
- 현재 학습 기록도 별도 study repository에서 README·진도 기록·state 업데이트만 커밋·푸시.
- 실제 remote ref와 로컬 HEAD 일치 검증. 사용자에게 `/reload` 후 명령 사용 안내.
