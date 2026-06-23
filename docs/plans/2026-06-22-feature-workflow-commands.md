# zz-workflow commands — 프로젝트 작업 워크플로우 표준화 도구

## 목차
- [목적](#목적)
- [전체 아키텍처](#전체-아키텍처)
- [명령어 목록](#명령어-목록)
- [디렉토리 구조](#디렉토리-구조)
- [파일 목록](#파일-목록)
- [작업 순서](#작업-순서)
- [의존성 / 주의사항](#의존성--주의사항)

## 목적

- kkiri의 기능개발 방법론(AGENTS.md 6단계 절차 + 8개 표준 템플릿 + 규약)을 **범용 재사용 가능한 command**로 패키징
- 새 프로젝트 초기 설정 → 기능 추가/고도화 → 디자인 시스템 초기화까지 한 command로 처리
- 설치는 `zz-workflow:init`, 기능 추가는 `zz-workflow:new`, 디자인 시스템은 `zz-workflow:design-system`
- AGENTS.md는 설치되면 항상 켜져 있는 규칙, command는 필요시 명시적 호출

## 전체 아키텍처

```
Layer 1: AGENTS.md (always-on — zz-workflow:init이 설치)
  → 6단계 절차 + 게이트 + 규칙
  → 매 세션마다 pi가 자동 로딩

Layer 2: Commands (on-demand — 사용자가 명시적 호출)
  ├── zz-workflow:init           → AGENTS.md + 템플릿 + 규약을 대상 프로젝트에 설치
  ├── zz-workflow:new {feature}  → 새 기능 or 기존 기능 고도화 (버전 자동 결정)
  └── zz-workflow:design-system → 디자인 시스템 디렉토리 구조 초기화

Layer 3: Resource files (docs/feature-workflow/ — command가 참조)
  → 템플릿 파일, 규약 템플릿, AGENTS.md/PROGRESS.md/screen-definitions.md 스타터
```

## 명령어 목록

### 1. `zz-workflow:init`

**기능**: 대상 프로젝트에 워크플로우 방법론을 설치한다. AGENTS.md + 템플릿 + 규약 + 대시보드 + 레지스트리를 한 번에 생성.

**변수**:
- `$PROJECT_PATH` (필수) — 설치할 프로젝트 루트 경로

**생성하는 파일**:
- `{target}/AGENTS.md`
- `{target}/PROGRESS.md`
- `{target}/docs/screen-definitions.md`
- `{target}/docs/engineering/api-conventions.md`
- `{target}/docs/templates/README.md`
- `{target}/docs/templates/feature-index-template.md`
- `{target}/docs/templates/feature-01-requirements-template.md`
- `{target}/docs/templates/feature-02-plans-template.md`
- `{target}/docs/templates/feature-03-screens-template.md`
- `{target}/docs/templates/feature-04-api-template.md`
- `{target}/docs/templates/feature-05-design-template.md`
- `{target}/docs/templates/feature-06-decisions-template.md`
- `{target}/docs/templates/feature-07-progress-template.md`

**옵션 사항**: `--with-prd`, `--with-roadmap`, `--with-architecture` 플래그로 docs/PRD.md, ROADMAP.md, ARCHITECTURE.md 추가 생성 가능

### 2. `zz-workflow:new`

**기능**: 신규 기능을 시작하거나 기존 기능을 고도화한다. 기능 디렉토리를 생성하고 8개 표준 템플릿을 복사하며, PROGRESS.md 매트릭스를 갱신한다.

**변수**:
- `$FEATURE_NAME` (필수) — 기능 식별자 (소문자+하이픈, 예: auth, order-management)
- `$VERSION` (선택, 생략 가능) — 버전 지정. 생략 시 자동 결정

**버전 자동 결정 로직 (command 본문에 명시)**:
1. `docs/features/{name}/` 없음 → `v0` 신규
2. `docs/features/{name}/v0/`만 있음 → 사용자에게 질문: "v0.1(소규모 개선) or v1(대규모)"
3. `docs/features/{name}/v0.1/`까지 있음 → 사용자에게 질문: "v1 or v1.1"
4. 규칙: patch(0→0.1) → minor(0.1→1) → patch(1→1.1) → ...

**수행 작업**:
1. `docs/features/{name}/v{version}/` 디렉토리 생성
2. 리소스의 8개 템플릿을 복사 (index.md + 01..07)
3. 템플릿 내 플레이스홀더 치환 (`Feature Name`, `F-XX`, `DOMAIN_REASON` 등)
4. `{target}/PROGRESS.md` 매트릭스에 새 기능 행 추가
5. `{target}/docs/screen-definitions.md`는 등록 안 함 (화면 ID는 3단계에서 결정)

### 3. `zz-workflow:design-system`

**기능**: 대상 프로젝트에 디자인 시스템 구조를 초기화한다. 빈 디렉토리 구조 + 스타터 템플릿을 생성.

**변수**:
- `$PROJECT_PATH` (필수) — 설치할 프로젝트 루트 경로

**생성하는 구조**:
- `{target}/docs/design-system/index.md` — 디자인 시스템 문서 안내
- `{target}/docs/design-system/tokens.md` — 디자인 토큰 (색상/타이포/간격)
- `{target}/docs/design-system/components.md` — 컴포넌트 명세
- `{target}/docs/design-system/patterns.md` — 패턴 명세
- `{target}/docs/design-system/principles.md` — 디자인 원칙

**참고**: 이 command는 구조(뼈대)만 생성한다. 실제 디자인 토큰/컴포넌트 정의는 `ckm-design-system` 스킬 등으로 작성.

## 디렉토리 구조

### command 파일들

```
my-agent-prompt/
├── command/
│   ├── zz-workflow-init.md          # /zz-workflow:init
│   ├── zz-workflow-new.md           # /zz-workflow:new
│   └── zz-workflow-design-system.md        # /zz-workflow:design-system
```

### 리소스 파일들 (command가 읽어서 복사/참조)

```
docs/feature-workflow/              # command의 resource 디렉토리
├── AGENTS.md                       # → {target}/AGENTS.md
├── PROGRESS.md                     # → {target}/PROGRESS.md
├── screen-definitions.md           # → {target}/docs/screen-definitions.md
├── engineering/
│   └── api-conventions.md          # → {target}/docs/engineering/api-conventions.md
│
├── templates/                      # → {target}/docs/templates/
│   ├── README.md
│   ├── feature-index-template.md
│   ├── feature-01-requirements-template.md
│   ├── feature-02-plans-template.md
│   ├── feature-03-screens-template.md
│   ├── feature-04-api-template.md
│   ├── feature-05-design-template.md
│   ├── feature-06-decisions-template.md
│   └── feature-07-progress-template.md
│
├── design/                         # zz-workflow:design 전용 (선택)
│   ├── design-index-template.md
│   ├── design-tokens-template.md
│   ├── design-components-template.md
│   ├── design-patterns-template.md
│   └── design-principles-template.md
│
└── extras/                         # init --with-* 옵션 전용 (선택)
    ├── PRD.md
    ├── ROADMAP.md
    └── ARCHITECTURE.md
```

### 정리 대상 (기존 skill 잔여물)

```
skills/feature-doc-workflow/          ← 삭제 (전체 디렉토리)
prompt/review/feature-doc-workflow.md  ← 업데이트 또는 삭제
~/.pi/agent/skills/feature-doc-workflow/  ← 삭제 (pi 스킬 등록 해제)
```

## 파일 목록

### 새로 생성 (17개)

| # | 파일 | 비고 |
|---|------|------|
| 1 | `command/zz-workflow-init.md` | init command 본문 |
| 2 | `command/zz-workflow-new.md` | new command 본문 |
| 3 | `command/zz-workflow-design-system.md` | design-system command 본문 |
| 4 | `docs/feature-workflow/AGENTS.md` | → project root |
| 5 | `docs/feature-workflow/PROGRESS.md` | → project root |
| 6 | `docs/feature-workflow/screen-definitions.md` | → project docs/ |
| 7~15 | `docs/feature-workflow/templates/*` (9개) | 8개 + README |
| 16~20 | `docs/feature-workflow/design/*` (5개) | design system 스타터 |
| 21~23 | `docs/feature-workflow/extras/PRD/ROADMAP/ARCHITECTURE.md` (3개) | 선택 옵션 |

### 정리 (2개)

| 항목 | 처리 |
|------|------|
| `skills/feature-doc-workflow/` | 디렉토리 삭제 |
| `~/.pi/agent/skills/feature-doc-workflow/` | 디렉토리 삭제 |
| `prompt/review/feature-doc-workflow.md` | design-system 변경 반영해서 갱신 or 삭제 |

## 작업 순서

### Phase 1: 리소스 파일 준비

1. `docs/feature-workflow/` 디렉토리 생성
2. 기존 `skills/feature-doc-workflow/templates/AGENTS.md` → `docs/feature-workflow/AGENTS.md`로 이동
3. 기존 templates(8개 + README) → `docs/feature-workflow/templates/`로 이동
4. 기존 engineering/api-conventions.md → `docs/feature-workflow/engineering/api-conventions.md`로 이동
5. 기존 PROGRESS.md, screen-definitions.md → `docs/feature-workflow/`로 이동
6. `docs/feature-workflow/design/` 하위 5개 템플릿 작성
7. (선택) `docs/feature-workflow/extras/` 하위 3개 템플릿 작성

### Phase 2: Command 파일 작성

8. `command/zz-workflow-init.md` 작성
9. `command/zz-workflow-new.md` 작성
10. `command/zz-workflow-design-system.md` 작성

### Phase 3: 정리

11. `skills/feature-doc-workflow/` 디렉토리 삭제
12. `~/.pi/agent/skills/feature-doc-workflow/` 디렉토리 삭제
13. `prompt/review/feature-doc-workflow.md` 업데이트

### Phase 4: 검증 및 푸시

14. 최종 파일 구조 확인
15. Git add / commit / push

## 의존성 / 주의사항

- 각 command는 `docs/feature-workflow/`를 리소스 디렉토리로 사용. 절대경로는 `{my-agent-prompt 프로젝트 경로}/docs/feature-workflow/`
- `zz-workflow:new`는 PROGRESS.md를 수정하므로, init이 설치한 PROGRESS.md 형식과 동기화 유지 필요
- `zz-workflow:design`은 ckm-design-system 스킬과 충돌하지 않음 (뼈대만 제공)
- 모든 command는 OpenCode command 포맷 준수 (YAML frontmatter, $VARIABLE, @참조)
