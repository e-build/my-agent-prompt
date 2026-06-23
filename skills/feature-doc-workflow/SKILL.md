---
name: feature-doc-workflow
description: >
  Docs-first, stage-gated feature development workflow. Drives a feature through
  6 stages — requirements → plans/policy → screens → API+error-codes → design →
  implementation — with mandatory agreement gates between stages, using an
  8-file standard document set per feature version under
  docs/features/{feature}/v{version}/. Scaffolds the feature directory, maintains
  a root PROGRESS.md matrix, and keeps decisions/progress logs. Defaults to a
  REST envelope (result/data/error), cursor pagination, and UPPERCASE_SNAKE
  error codes — all overridable per project. Use when starting a new feature,
  scaffolding feature docs, writing an API spec with error codes, or tracking
  multi-stage feature progress. Triggers: '새 기능 문서', 'feature 스캐폴드',
  '기능 작업 시작', '요구사항부터 구현까지', 'API 명세 + 에러 코드 정의',
  '6단계 절차', 'new feature docs'.
---

# Feature Doc Workflow

문서가 코드보다 선행하고, 각 단계 합의 없이 다음 단계로 넘어가지 않는 **단계별 게이트 기반 기능개발 방법론**. 하나의 기능을 6단계로 진행하며, 단계마다 표준 산출물을 남긴다.

## 언제 사용하나

- 새 기능을 시작할 때 (요구사항 정의부터)
- 기능 문서 디렉토리를 스캐폴드할 때
- API 명세 + 에러 코드를 정의할 때
- 여러 단계에 걸친 기능 진행을 추적할 때
- 기존 기능 문서를 표준 구조로 재정리할 때

단일 임시 작업이나 문서 하나만 가볍게 고칠 때는 이 스킬 전체가 필요 없다.

## 핵심 원칙 (절대 규칙)

1. **문서가 코드보다 선행** — 정책·화면·API 합의 없이 구현 단계로 건너뛰지 않는다
2. **단계 게이트** — 이전 단계 합의 없이 다음 단계로 넘어가지 않는다
3. **책임 분리** — 요구사항 문서에 API 스펙 금지, API 문서에 구현 구조 과혼합 금지
4. **에러 코드는 API 정의 시점에 확정** — 구현 단계로 미루지 않는다
5. **검증 없는 완료 주장 금지** — 테스트 없으면 완료 아님

## 6단계 절차

| 단계 | 이름 | 산출물 |
|---|---|---|
| 1 | 요구사항 수집 및 정의 | `01-requirements.md` — 무엇을/왜 만드는가 |
| 2 | 기획 및 정책 수립 | `02-plans.md` — 어떻게 처리하는가 |
| 3 | 화면정의서 | `03-screens.md` — 화면/상태/CTA |
| 4 | API 명세 (에러 코드 포함) | `04-api.md` — 클라이언트·서버 계약 |
| 5 | 백엔드 시스템 설계 | `05-design.md` (선택) — 도메인·계층·테스트 포인트 |
| 6 | 구현 및 검증 | 코드 + `07-progress.md` 검증 메모 |

단계별 상세 절차·체크리스트는 [references/procedure.md](references/procedure.md) 참조.

## 신규 기능 스캐폴드 절차

새 기능을 시작할 때 아래 순서로 디렉토리와 파일을 생성한다. 템플릿은 이 스킬의 `templates/` 디렉토리에 있다.

1. 디렉토리 생성: `docs/features/{feature}/v{version}/` (최초 버전은 `v0`)
2. `templates/feature-index-template.md` → `index.md` 복사 후 기능 정보 채우기
3. `templates/feature-01..07-template.md` → `01-requirements.md` ... `07-progress.md` 복사
4. 루트에 아직 없으면 `templates/AGENTS.md`, `templates/PROGRESS.md`, `templates/screen-definitions.md`, `templates/engineering/api-conventions.md` 로부터 초기화
5. 변수 치환: `Feature Name` → 실제 기능명, `F-XX` → 기능 ID, `S-FEATURE-*` → 화면 ID
6. 파일 간 상대경로 링크(`./`, `../../../`)는 그대로 유지 — 디렉토리 구조가 방법론의 일부임

복사 후 예시/플레이스홀더 값은 반드시 실제 기능 기준으로 교체한다.

## 문서 작성 규칙 (요약)

- 모든 본문형 Markdown에 **H1 바로 아래 목차** 포함
- 문체는 **명사형/기준형** 우선 (`~함`, `~기준`, `~필요`)
- 긴 줄글 지양, **목록/표/절차** 중심
- 파일명은 **소문자 + 하이픈**, 날짜 포함 금지
- 같은 내용을 여러 문서에 **중복 정의 금지**
- 이모티콘 사용 금지

상세 규칙은 [references/doc-rules.md](references/doc-rules.md) 참조.

## 규약 오버라이드

기본값은 REST envelope(`result`/`data`/`error`), 커서 페이지네이션, `DOMAIN_REASON` 대문자 스네이크 에러 코드. 프로젝트가 다른 규약을 쓰면 `docs/engineering/api-conventions.md`에서 한 곳만 수정하면 된다 — 기능별 문서는 이 규약을 참조만 하므로 자동 반영된다.

## 산출물 위치 요약

| 종류 | 위치 |
|---|---|
| 기능 문서 | `docs/features/{feature}/v{version}/` |
| 공통 규약 | `docs/engineering/` |
| 화면 ID 레지스트리 | `docs/screen-definitions.md` (루트) |
| 전체 진행판 | `PROGRESS.md` (루트) |
| 작업 절차 기준 | `AGENTS.md` (루트, 프로젝트 부착용 템플릿 제공) |
