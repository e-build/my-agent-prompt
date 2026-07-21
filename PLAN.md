# 인터랙티브 사전진단 HTML 템플릿 계획

## Context

- 사용자는 `pi/commands/me-study-chapter.md`의 `diagnosis` 단계가 pi-plannotator처럼 브라우저에서 인터랙티브하게 진행되기를 원한다.
- 현재 `me-study-chapter.md`에는 이미 `project_root/diagnosis-template.html`을 기준으로 `ch-{slug}/diagnosis.html`을 생성하고, `{{QUESTIONS_JSON}}`로 문항 데이터를 주입한다는 흐름이 존재한다.
- 원하는 방향은 객관식, 주관식, 서술형 문항을 표현하는 HTML 템플릿을 미리 정의해두고, 챕터별 학습 내용에 따라 문항 데이터만 교체하면서 재사용하는 방식이다.
- 사용자는 UI 방식으로 **Hybrid**를 선택했다.
  - 한 문제씩만 강제하는 wizard는 아님.
  - 모든 문항을 밋밋하게 나열하는 single page도 아님.
  - 섹션/카드 기반으로 진행률과 답변 상태를 보여주되, 사용자가 자유롭게 문항을 오갈 수 있는 방식이다.
- Plannotator 구현 조사 결과:
  - Pi extension은 빌드된 브라우저 UI를 정적 HTML asset으로 포함한다. 예: `apps/pi-extension/plannotator-browser-runtime.ts`가 `plannotator.html`, `review-editor.html`을 읽는다.
  - 플래너 리뷰는 로컬 HTTP 서버를 띄우고, 브라우저 UI가 `/api/plan`, `/api/done` 같은 JSON API와 통신한다. 예: `apps/pi-extension/server/serverPlan.ts`.
  - HTML artifact는 raw HTML로 렌더링할 수 있고, 로컬 CSS/image는 `/api/html-assets/...`로 rewrite하거나 공유 시 inline 처리한다. 예: `packages/server/html-assets.ts`, `packages/shared/html-assets-node.ts`.
  - 이번 학습 진단 기능은 Plannotator의 전체 서버 구조까지 가져올 필요는 없다. 핵심 아이디어인 **정적 브라우저 UI + 데이터 주입 + 명시적 제출 패키징**만 가져오는 것이 적절하다.

## Approach

- Plannotator의 구조를 그대로 복제하지 않고, 원칙만 축소 적용한다.
  - Plannotator: 정적 브라우저 UI + 로컬 서버 API.
  - Study diagnosis: 서버 없이 self-contained HTML + JSON 문항 데이터 주입.
- repo 안에 표준 HTML 템플릿 asset을 추가한다.
  - 새 파일: `pi/templates/diagnosis-template.html`
  - `/study-init` 실행 시 각 `study-{slug}/diagnosis-template.html`로 복사하거나 동일 내용을 생성하도록 한다.
  - `/study-chapter diagnosis`는 이 템플릿에 챕터별 JSON만 주입해 `ch-{slug}/diagnosis.html`을 만든다.
- 문항 JSON schema를 고정한다.
  - 시험 메타데이터: 챕터 slug/title, phase, 총점, 안내문
  - 섹션: 제목, 설명, 예상 소요 시간, 포함 문항 ID
  - 문항: `single-choice`, `multiple-choice`, `short-answer`, `essay`, 필요 시 `code`/`sql`
  - 점수/채점 기준은 포함하되, 학습자 HTML에는 정답 key를 노출하지 않는다.
- HTML 템플릿은 Hybrid UI를 제공한다.
  - 개요 화면
  - 섹션별 카드
  - 문항별 답변 상태 표시
  - 전체 진행률/미답변 수 표시
  - 필수 문항 검증
  - `localStorage` 기반 임시 저장
  - 마지막에 “AI에게 제출” 패널에서 답안을 구조화 텍스트로 패키징하고 클립보드 복사
- `me-study-init.md`와 `me-study-chapter.md`의 사전진단 설명을 같은 흐름으로 맞춘다.
- Pi 리소스 배포 구조에 맞게 `pi/templates/`를 문서화하고, 필요 시 install/sync 스크립트에 포함한다.

## Files to modify

- `pi/commands/me-study-chapter.md`
  - diagnosis 단계의 HTML 생성 규칙, JSON schema, 제출 방식 명확화
- `pi/commands/me-study-init.md`
  - 새 학습 프로젝트 생성 시 `diagnosis-template.html` 생성/복사 규칙 추가
  - 기존 markdown-only 사전평가 설명을 HTML-first 흐름으로 정리
- `pi/templates/diagnosis-template.html`
  - 새 표준 self-contained HTML 템플릿 asset
- `pi/README.md`
  - `pi/templates/` 디렉토리 역할 문서화
- `pi/install.sh`
  - `--restore` 시 `pi/templates/`를 `~/.pi/agent/templates/`로 설치하도록 추가
- `pi/sync.sh`
  - 로컬 `~/.pi/agent/templates/` 변경분을 repo의 `pi/templates/`로 동기화하도록 추가

## Reuse

- 기존 `pi/commands/me-study-chapter.md`의 diagnosis 흐름을 재사용한다.
  - `project_root/diagnosis-template.html`
  - `ch-{slug}/diagnosis.html`
  - 템플릿 변수: `{{CHAPTER_SLUG}}`, `{{CHAPTER_TITLE}}`, `{{PHASE}}`, `{{QUESTIONS_JSON}}`
  - “AI에게 제출” 버튼으로 답안 패키징
- 기존 `pi/commands/me-study-init.md`의 학습 프로젝트 생성 흐름을 재사용한다.
  - `study-{slug}/` 루트에 공통 학습 자산을 생성하는 위치가 이미 있다.
  - 여기에 `diagnosis-template.html`을 추가하면 자연스럽다.
- Plannotator에서 가져올 개념:
  - 브라우저에서 보는 정적 UI asset
  - HTML artifact 중심 검토/입력 경험
  - 사용자가 명시적으로 최종 결정을 제출하는 흐름
- 이 repo의 기존 구조:
  - Pi 전용 리소스는 `pi/` 아래에 둔다.
  - 명령어는 `pi/commands/`에 둔다.
  - 배포 가능한 보조 asset은 새 `pi/templates/`에 두는 방식이 가장 일관적이다.

## Steps

- [ ] `pi/templates/diagnosis-template.html`을 추가한다.
  - CSS/JS를 inline으로 넣어 파일 하나만으로 동작하게 한다.
  - placeholder를 지원한다: `{{CHAPTER_SLUG}}`, `{{CHAPTER_TITLE}}`, `{{PHASE}}`, `{{QUESTIONS_JSON}}`.
  - Hybrid UI를 구현한다: 개요, 섹션 카드, 자유 이동, 진행률, 검증, 최종 제출 패널.
- [ ] `me-study-chapter.md`에 문항 JSON schema를 명시한다.
  - `sections[]`: `id`, `title`, `description`, `questionIds[]`
  - `questions[]`: `id`, `type`, `sectionId`, `prompt`, `description`, `points`, `required`, `options`, `placeholder`, `rubric`, `constraints`
  - 지원 타입: `single-choice`, `multiple-choice`, `short-answer`, `essay`, `code`, `sql`
- [ ] `me-study-chapter.md`의 diagnosis 단계를 업데이트한다.
  - 먼저 `study-{slug}/diagnosis-template.html`을 찾는다.
  - 없으면 `pi/templates/diagnosis-template.html` 내용 기준으로 생성하도록 지시한다.
  - `ch-{slug}/diagnosis.html`은 템플릿 + 문항 JSON 주입만으로 생성한다.
  - 학습자용 HTML에는 정답 key를 넣지 않는다.
  - 학습자는 HTML을 열고 답변한 뒤 “AI에게 제출” 결과를 채팅에 붙여넣는다.
  - AI는 붙여넣은 구조화 답안을 채점하고 `diagnosis.md` 하단에 결과를 기록한다.
- [ ] `me-study-init.md`를 업데이트한다.
  - 생성되는 학습 프로젝트 트리에 `diagnosis-template.html`을 추가한다.
  - 사전평가 설명을 HTML-first 방식으로 바꾼다.
  - 기존 “객관식/주관식/서술형 비율” 설명과 `me-study-chapter.md`의 점수 배분 설명이 충돌하지 않게 정리한다.
- [ ] 설치/동기화 문서를 업데이트한다.
  - `pi/README.md`에 `pi/templates/` 설명을 추가한다.
  - `pi/install.sh --restore`가 `pi/templates/`를 `~/.pi/agent/templates/`로 설치하게 한다.
  - `pi/sync.sh`가 `~/.pi/agent/templates/`를 `pi/templates/`로 동기화하게 한다.
- [ ] command 문서 안에 짧은 예시 JSON을 추가한다.
  - 새 챕터 진단을 만들 때 에이전트가 schema를 추측하지 않고 그대로 따르게 하기 위함이다.

## Verification

- `/study-init <학습주제>` 흐름을 수동으로 dry-run한다.
  - 생성될 프로젝트 루트에 `diagnosis-template.html`이 포함되는지 확인한다.
- `/study-chapter <챕터> diagnosis` 흐름을 수동으로 dry-run한다.
  - `ch-{slug}/diagnosis.html`이 템플릿 placeholder 치환 + JSON 주입만으로 생성되는지 확인한다.
- 문항 타입 표현을 확인한다.
  - 객관식 단일 선택
  - 객관식 다중 선택
  - 주관식 짧은 답변
  - 서술형 긴 답변
  - 선택적으로 code/sql 답변
- 브라우저 동작을 확인한다.
  - 섹션 카드 표시
  - 진행률 표시
  - 미답변 필수 문항 검증
  - localStorage 임시 저장
  - “AI에게 제출” 텍스트 생성
  - 클립보드 복사
- 제출 텍스트를 확인한다.
  - 챕터 메타데이터
  - 문항 ID/type/points
  - 학습자 답변
  - 채점 기준/rubric
  - AI가 `diagnosis.md`에 기록할 수 있는 결과 포맷

## Decisions

- 실제 재사용 HTML 템플릿 파일을 repo에 추가한다.
- UI는 Hybrid 방식으로 한다.
- Plannotator처럼 로컬 서버/API를 새로 만들지는 않는다.
- 진단 HTML은 self-contained 정적 artifact로 유지한다.
- 학습자에게 정답 key를 노출하지 않는다.
