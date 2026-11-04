# study 내 교과서 2단계(완료 연결) 구현 계획

> **Implement task-by-task with the test-driven-development skill.**
> 설계: [2026-11-03-study-my-textbook-design.md](2026-11-03-study-my-textbook-design.md) · 1단계: [phase1](2026-11-03-study-my-textbook-phase1.md) · 브랜치 `feat/study-my-textbook`

**Goal:** 챕터가 끝나면(시험 통과와 확인) agent가 재료를 개념 단위로 재구성해 book에 반영하게 만들고, 정리가 안 된 챕터를 다시 처리할 수 있게 하며, 첫 페이지 대시보드와 명제 merge 동기화를 붙인다.

**Architecture:** 완료 처리(`completeAcknowledgedTest`)는 바꾸지 않고, 그 결과가 completed일 때 bridge가 `# STUDY_BOOK_PENDING` follow-up 하나를 더 보낸다. 지시 본문은 `instructions/book.md`(정본)를 로더로 읽는다. "정리 대기"는 상태에 따로 저장하지 않고 **completed 챕터 중 어떤 개념의 `learnedIn`에도 없는 것**으로 계산한다(단일 출처). 대시보드는 book 변경 때마다 다시 만드는 생성물이다.

## 범위

| 포함 | 제외(3단계 이후) |
|---|---|
| `instructions/book.md` 재구성 지침 | HTML 렌더러, `/study-book`, 차이 링크 |
| 시험 완료 → `STUDY_BOOK_PENDING` follow-up | 링크 공유 |
| 정리 대기 계산 + `/study-chapter` 메뉴 항목 + 세션 시작 알림 | |
| `study_book plan` 응답에 재료 목록(문제·lab·README 경로) | |
| `book/README.md` 대시보드 생성 | |
| 명제 merge/unmerge 때 개념 `members` 동기화 | |
| `related` 연결 operation(`relate`/`unrelate`) | |

## 결정

- **follow-up은 completed일 때만**, 등록된 루트일 때만 보낸다. blocked·relearn은 보내지 않는다.
- 재료 목록에는 **경로와 id만** 넣고 정답 본문은 넣지 않는다. 에이전트가 필요한 것만 읽는다. 학습자 원래 답(`evidence`)은 재료에서 제외한다.
- 대시보드는 `book/README.md`에 둔다. frontmatter 없이 관리 영역 하나(`<!-- study:book region=dashboard -->`)와 메모로 구성한다. 생성 실패는 book 변경을 실패시키지 않는다.
- merge 동기화: 흡수된 명제가 어떤 페이지에 있으면 대상 명제로 바꾼다. 대상이 이미 다른 페이지에 있으면 흡수된 쪽을 빼기만 한다(한 페이지 원칙 유지). unmerge는 기록해 둔 원래 소속으로 되돌린다.

## Task 1: 재구성 지침 `instructions/book.md`
- Create: `instructions/book.md`, `src/book/book-instructions.ts`(로더), Test: `tests/book/book-instructions.test.ts`
- 지침은 설계 문서 "재구성 원칙" 6개 + 도구 사용 순서(plan → 재료 읽기 → apply 한 묶음 → 보고) + 금지(원래 답, 챕터 README 복사, 범위 밖)

## Task 2: 정리 대기 계산
- Create: `src/book/book-pending.ts` — `pendingChapters(root)`: 등록 프로젝트별 `state.json`의 `chapterCompletions`(없으면 `test.status===completed`) 중 `learnedIn`에 없는 것
- Test: `tests/book/book-pending.test.ts`

## Task 3: plan 재료 목록
- Modify: `src/book/book-query.ts` `planChapter` — `materials: { readme, lab: string[], questions: [{id,purpose,path}], tests: string[] }`
- 질문은 `<project>/.study/dialogue/questions/*.json` 중 `context.chapterSlug` 일치, 시험은 `.study/assessments/*.json` 중 `kind==="test"`이고 해당 챕터이며 `grade.passed`
- Test: `tests/book/book-integrity.test.ts`의 plan 테스트 확장

## Task 4: 완료 follow-up
- Create: `src/book/book-followup.ts` — `bookFollowUp(root, projectSlug, chapterSlug, completedOn)` → 메시지 문자열(지침 + 대상)
- Modify: `src/bridge/study-routes.ts` — completion.status==="completed"이고 `completion.review`가 있을 때(=등록 루트) follow-up 전송
- Test: `tests/bridge/study-routes.test.ts` passed 모드에 `STUDY_BOOK_PENDING` 확인, 미등록 하네스는 보내지 않음 확인

## Task 5: 메뉴·세션 알림
- Modify: `src/session/chapter-catalog.ts` `MenuAction`에 `{type:"book-pending"}`, `buildChapterMenu` context에 `bookPending?: number`
- Modify: `src/session/study-command.ts` hooks에 `bookPending`, `startBookPending`(follow-up 전송)
- Modify: `src/review/chapter-review-start.ts` hooks 구현
- 세션 시작 알림: `checkBookIntegrity`와 별개로 `workspaceHealthNotice`에 넣지 않고, book extra check가 "교과서 정리 대기 N개"를 문제로 보고하지 않도록 **정보 알림**을 `registerBookTools`의 session_start에서 보낸다
- Test: `tests/session/chapter-catalog.test.ts`, `tests/session/chapter-menu.test.ts`

## Task 6: 대시보드
- Create: `src/book/book-dashboard.ts` — 영역별 페이지·지식·챕터 수, 개념 트리 목차(링크), 프로젝트별 챕터 진행, 오늘·밀린 복습 수, 미배치 명제 수, 정리 대기, 검토할 제안 수, 최근 book 변경 5개
- Modify: `applyBookChange` 성공 후 대시보드 갱신(실패는 결과의 `dashboardWarning`)
- Test: `tests/book/book-dashboard.test.ts`

## Task 7: merge 동기화와 related
- Create: `src/book/book-merge.ts` — `bookMergeChanges(root, record)`: `ChangeRecord` → 개념 파일 PlannedChange
- Modify: `index.ts` — `extraChanges`에서 review와 book 변경을 합침
- Modify: `book-changes.ts` — `relate`/`unrelate` operation
- Test: `tests/book/book-merge.test.ts`

## Task 8: 문서
- README(extension) 갱신, 설계 문서 상태 줄
