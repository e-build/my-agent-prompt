# Study Extension Learning Artifacts & Handoff UX Plan

## Context

현재 `study` extension은 사전진단 UX가 많이 좋아졌다.

완료된 흐름:

1. `/study-chapter {chapter} diagnosis`
2. 브라우저 사전진단 자동 open
3. 학습자 답안 제출
4. Pi가 채점
5. 브라우저에 점수/정답/해설/보완 포인트 표시
6. 결과 화면에서 `Pi에서 개념 학습 시작 →` 버튼으로 Pi 세션에 handoff

남은 UX/학습 설계 문제:

- handoff 이후 브라우저가 그냥 남아 있어 종료감이 약하다.
- 개념 학습은 현재 Pi TUI 대화로만 진행되어, 끝나고 나면 복습용 산출물이 명확히 남지 않는다.
- `diagnosis.md`, `test.md`, `review/`는 있는데 개념 학습 결과를 담는 canonical 문서가 없다.
- 사용자는 나중에 여러 챕터의 `concept.md`만 모아도 교과서처럼 읽히기를 원한다.

## Approach

두 가지를 추가한다.

### 1. Diagnosis result handoff 종료 UX

브라우저 결과 화면에서 `Pi에서 개념 학습 시작 →` 버튼을 누르면:

1. 기존처럼 `/ack` endpoint로 `DIAGNOSIS_RESULTS_REVIEWED` 신호를 Pi에 보낸다.
2. 성공하면 3초 카운트다운을 보여준다.
3. 카운트다운 종료 시 `window.close()`를 best-effort로 시도한다.
4. 브라우저가 탭 닫기를 막아도 UX가 깨지지 않도록 `data-state="closed"` 종료 화면으로 전환한다.
5. 종료 화면에는 다음 메시지를 보여준다.

```text
Pi로 넘겼습니다.
개념 학습은 Pi에서 이어집니다.
이 탭은 닫으셔도 됩니다.
```

핵심은 실제 탭 close 성공 여부에 의존하지 않는 것이다. 탭이 남아 있어도 기능적으로 끝난 화면이 되어야 한다.

### 2. Concept learning artifact: `concept.md`

개념 학습은 계속 Pi TUI 대화 중심으로 유지한다.

이유:

- diagnosis는 측정/채점이 핵심이라 브라우저 HTML이 적합하다.
- 개념 학습은 열린 대화, 질문, 비유, 속도 조절이 핵심이므로 TUI가 더 유연하다.
- 진짜 문제는 HTML 부재가 아니라, 학습 후 남는 복습 산출물이 없다는 점이다.

따라서 개념 학습이 lab/test로 전환되기 전, Pi가 `ch-{slug}/concept.md`를 반드시 생성한다.

`concept.md`는 단순 채팅 요약이 아니라, 나중에 여러 챕터의 `concept.md`를 모아도 교과서처럼 읽히는 독립 문서로 작성한다.

## `concept.md` structure

```md
# {챕터 제목}

- 챕터: ch-01-...
- 생성: YYYY-MM-DD
- 기반: diagnosis.md 약점 + 개념 학습 대화

## 이 장에서 배우는 것
이 개념이 왜 필요한지, 어떤 문제를 푸는지를 2~3문장으로 설명한다.

## 핵심 개념
진단 약점과 실제 학습 대화에서 다룬 핵심 개념을 교과서처럼 정리한다.
각 개념은 하위 절로 나눈다.

### {개념명}
- 한 줄 정의
- 일상어 설명
- 구체 예시
- 중간 상태
- 필요 시 mermaid 다이어그램

## 단계별 작동 원리
before → step 1 → step 2 → after 순서로 중간 상태를 생략하지 않고 설명한다.

## 핵심 비유 / 모델
학습 중 나온 비유와 머릿속 모델을 정리한다.
비유가 어디까지 맞고 어디서 깨지는지도 함께 쓴다.

## 흔한 함정
진단 오답, 대화 중 오해, 실무에서 틀리기 쉬운 부분을 정리한다.
왜 틀렸는지까지 설명한다.

## 정리
핵심 내용을 3~5개 bullet로 압축한다.
```

## Concept writing rules

`concept.md` 작성 시 반드시 지킬 규칙:

- 직접적이고 구체적으로 쓴다.
- 모든 중간 상태를 보여준다.
- 12살에게 설명하듯 쉽게 쓴다.
- 추상 용어를 쓰기 전에는 일상어로 먼저 풀어준다.
- SQL/코드/데이터 예시가 가능한 경우 반드시 구체 예시를 넣는다.
- 구조, 흐름, 순서가 이해에 도움이 되면 mermaid 다이어그램을 사용한다.
- 채팅 기록을 복붙하지 않는다. 복습 가능한 독립 문서로 재작성한다.
- `자기 점검` 섹션은 만들지 않는다. 이 문서는 문제지가 아니라 교과서형 개념 노트다.

## Lab artifact refinement

lab은 HTML로 만들지 않는다.

대신 `lab/README.md`를 표준 체크리스트로 만든다.

```md
# 실습 — {챕터 제목}

## 목표
이번 실습에서 확인할 것.

## 단계
- [ ] 1. ...
- [ ] 2. ...
- [ ] 3. ...

## 완료 조건
무엇을 제출/확인하면 완료인지.

## 산출물
- 파일 또는 실행 결과 위치
- 로그/스크린샷/쿼리 결과 등
```

이렇게 하면 lab도 복습 가능한 진입점이 생기고, Pi가 진행률을 추적하기 쉽다.

## Files to modify

### Required

- `pi/extensions/study/assets/diagnosis-template.html`
  - `acknowledgeResults()` 성공 후 3초 카운트다운과 `closed` 상태 추가
  - `window.close()` best-effort 시도
  - close 실패 시에도 종료 화면 유지

- `pi/extensions/study/prompts/study-chapter.md`
  - 개념 학습 단계에 `concept.md` 생성 규칙 추가
  - lab/test 전환 전 `concept.md`를 반드시 작성하도록 명시
  - `concept.md` 교과서형 구조 추가
  - 작성 원칙 추가
  - `lab/README.md` 체크리스트 규칙 추가

- `pi/extensions/study/prompts/study-init.md`
  - 챕터 기본 산출물 구조에 `concept.md` 추가
  - lab 디렉토리에 `README.md` 체크리스트가 포함되도록 업데이트

### Optional / if needed

- `pi/extensions/study/README.md`
  - study extension workflow 문서에 `concept.md`와 handoff 종료 UX 설명 추가

## Reuse

기존 구현에서 그대로 재사용한다.

- `study_diagnosis_open` bridge server
- `/api/study-diagnosis/:id/ack` endpoint
- `DIAGNOSIS_RESULTS_REVIEWED` prompt
- results mode dock
- `gradeResults` object
- `copyText()` helper
- state-driven template pattern: `body[data-state="..."]`

새 HTML tool이나 별도 concept HTML은 만들지 않는다.

## Steps

- [ ] Update diagnosis result handoff UI.
  - Add countdown state after ack success.
  - Show `3 → 2 → 1` before close attempt.
  - Attempt `window.close()` best-effort.
  - Add `closed` state fallback screen.

- [ ] Update `study-chapter.md` concept learning rules.
  - Require `concept.md` before moving from concept learning to lab/test.
  - Add textbook-style `concept.md` structure.
  - Add writing rules: direct, concrete, all intermediate states, explain like 12, mermaid when useful.
  - Remove self-check expectation.

- [ ] Update `study-init.md` project/chapter structure.
  - Add `concept.md` as a standard chapter artifact.
  - Add `lab/README.md` checklist convention.

- [ ] Optionally update `pi/extensions/study/README.md`.
  - Document the new artifact flow:
    - `diagnosis.md` → `concept.md` → `lab/README.md` + lab outputs → `test.md` → `review/`

- [ ] Regenerate current mysql-monitoring diagnosis HTML using the updated template.

- [ ] Validate.
  - Extract script from `diagnosis-template.html` and run `node --check`.
  - Extract script from regenerated diagnosis HTML and run `node --check`.
  - Confirm generated HTML has no unresolved `{{QUESTIONS_JSON}}` placeholder.
  - Confirm `closed` state exists in the template.
  - Confirm prompt files include `concept.md`, `lab/README.md`, and mermaid guidance.

## Verification

Manual browser verification:

1. Run `/study-chapter 01 diagnosis`.
2. Submit answers.
3. Wait for grading result.
4. Click `Pi에서 개념 학습 시작 →`.
5. Confirm Pi receives `DIAGNOSIS_RESULTS_REVIEWED`.
6. Confirm browser shows countdown.
7. Confirm browser either closes or transitions to closed fallback state.
8. Confirm Pi begins concept learning only after review handoff.

Prompt behavior verification:

1. During concept learning, Pi should not leave the chapter with only chat history.
2. Before moving to lab/test, Pi must create `ch-{slug}/concept.md`.
3. The generated `concept.md` must read like a textbook chapter, not a chat summary.
4. If the concept involves structure/flow/steps, Pi should include mermaid diagrams when helpful.
5. Before lab starts, Pi should create or update `lab/README.md` with a checklist.

## Non-goals

- Do not build a full interactive HTML concept-learning session yet.
- Do not create a separate `concept.html` renderer yet.
- Do not make the browser close behavior depend on guaranteed `window.close()` success.
- Do not add self-check questions to `concept.md`; review/test stages already cover active recall.
