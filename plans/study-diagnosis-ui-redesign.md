# Study Diagnosis HTML UI/UX Redesign Plan

## Context

- 현재 `pi/extensions/study/assets/diagnosis-template.html`은 동작은 하도록 고쳤지만, UI가 여전히 촌스럽고 텍스트가 많다.
- 목표는 study extension에서 재사용하는 사전진단 HTML 템플릿 자체를 개선하는 것이다.
- 사용자는 단순 색상 변경이 아니라, **평가 → 채점 → 사용자 확인**까지 이어지는 전체 UI/UX 구조를 다시 잡기를 원한다.

## Approach

현재 구조인 `sidebar + hero + questions + submit panel + grade panel`을 버리고, 상태 기반 단일 흐름으로 바꾼다.

핵심 상태:

1. `assess` — 진단 풀이
2. `waiting` — 제출 후 Pi가 채점 중
3. `results` — 점수/정답/해설/보완 포인트 확인

디자인 원칙:

- 사이드바 제거
- hero 제거
- submit/grade 패널 제거
- 질문 중심 single-column 레이아웃
- sticky topbar + sticky bottom submit dock
- 채점 결과는 별도 패널이 아니라 각 문항 아래 인라인으로 표시
- fallback 수동 제출/JSON 붙여넣기는 숨겨진 보조 UI로만 제공
- 템플릿은 `{{CHAPTER_SLUG}}`, `{{CHAPTER_TITLE}}`, `{{PHASE}}`, `{{QUESTIONS_JSON}}`만 교체해 재사용 가능해야 한다.

## Files to modify

- `pi/extensions/study/assets/diagnosis-template.html`
  - 전체 HTML/CSS/JS 구조 재작성
- `/Users/jimmylee/Playground/mysql-monitoring/ch-01-ddl-basics/diagnosis.html`
  - 기존 질문 JSON 유지한 채 새 템플릿으로 재생성하여 실제 화면 확인 가능하게 함

## Reuse

유지할 기존 기능:

- `DiagnosisQuestionSet` JSON schema
- 객관식 단일 선택, 객관식 복수 선택, 주관식, 서술형, code/sql 입력
- localStorage 답변 임시 저장
- `study_diagnosis_open` bridge의 `window.DIAGNOSIS_SUBMIT_URL`
- `window.DIAGNOSIS_RESULT_URL` polling
- `DIAGNOSIS_GRADE_JSON` 파싱
- 문항별 `correctAnswer`, `explanation`, `advice` 렌더링

버릴 기존 구조:

- 좌측 sidebar
- 큰 hero card
- 제출 패널
- 채점 결과 패널
- 여러 개의 badge/pill 중심 장식
- 긴 내부 구현 설명 텍스트

## UX Flow

### 1. Assessment mode

- 상단 sticky topbar:
  - phase
  - chapter title
  - `answered / total`
  - 총점
  - 진행률 bar
- 본문:
  - `introText` 1문장
  - 섹션별 문항
  - 문항은 카드가 아니라 여백과 구분선 중심의 block
- 하단 sticky dock:
  - 상태 메시지
  - `제출하기` 버튼
- 필수 문항 누락 시:
  - 첫 누락 문항으로 scroll
  - 해당 문항 prompt만 빨간색 강조

### 2. Waiting mode

- 제출 성공 시 `body[data-state="waiting"]`
- 답변 입력 비활성화
- top progress bar pulse
- dock 버튼은 `채점 중`으로 disabled
- 중앙에 “Pi가 채점 중입니다” 표시
- result polling으로 grade 수신 대기

### 3. Results mode

- `body[data-state="results"]`
- dock 숨김
- intro 숨김
- topbar는 score mode로 변환
- 상단 grade summary 표시:
  - total score
  - summary
  - recommendation
  - weaknesses chips
- 각 문항 아래 inline feedback:
  - status
  - score/max
  - 내 답
  - 정답
  - 해설
  - 보완 포인트
- 문항 왼쪽 bar 색:
  - correct: green
  - partial: amber
  - wrong/unanswered: red

## Visual System

- Theme: light, minimal, developer-productivity
- Background: `#fafaf9`
- Surface: `#ffffff`
- Text: `#171717`
- Muted: `#737373`
- Border: `#e7e5e4`
- Accent: `#4f46e5`
- Success: `#16a34a`
- Warning: `#d97706`
- Danger: `#dc2626`
- Typography:
  - system sans for Korean/readability
  - ui-monospace for question numbers, phase, points, metadata
- No external fonts, no remote assets, no emoji icons.

## Steps

- [ ] Replace `diagnosis-template.html` with topbar + content + dock structure.
- [ ] Reimplement CSS with minimal single-column layout and state-based styling.
- [ ] Reimplement JS render functions for section/question blocks.
- [ ] Rewire submit flow: `assess → waiting → results`.
- [ ] Rewire grade rendering as inline question feedback.
- [ ] Preserve manual fallback in hidden fallback section.
- [ ] Regenerate current mysql-monitoring diagnosis HTML using existing JSON.
- [ ] Validate:
  - template JS with `node --check`
  - regenerated HTML JS with `node --check`
  - JSON contains expected question count
  - no broad `{{QUESTIONS_JSON}}` replacement issue

## Verification

Expected after refresh:

- Questions are visible immediately.
- No sidebar.
- No hero card.
- No submit/grade panels.
- Submit button is in sticky bottom dock.
- After submit, UI enters waiting state.
- After grade, UI enters results state and displays inline feedback per question.
