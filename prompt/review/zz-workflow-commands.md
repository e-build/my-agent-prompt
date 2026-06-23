# zz-workflow commands 리뷰

## 개요

kkiri 프로젝트의 기능개발 절차를 추출해 **3개의 OpenCode command** + **AGENTS.md** 로 재패키징한 자산.
다른 프로젝트에서 동일한 "docs-first, stage-gated feature development" 워크플로우를 쓸 수 있도록 설계.

## 리뷰 대상

```
command/
├── zz-workflow-init.md               # 프로젝트에 방법론 설치
├── zz-workflow-new.md                # 기능 스캐폴드 + PROGRESS 갱신
└── zz-workflow-design-system.md      # 디자인 시스템 뼈대 초기화

docs/feature-workflow/                # command가 참조하는 리소스들
├── AGENTS.md                         # → 프로젝트 루트
├── PROGRESS.md                       # → 프로젝트 루트
├── screen-definitions.md             # → 프로젝트 docs/
├── engineering/
│   └── api-conventions.md
├── templates/ (9개)                  # 8개 feature 템플릿 + README
├── design/ (5개)                     # 디자인 시스템 스타터
└── extras/ (3개)                     # PRD / ROADMAP / ARCHITECTURE
```

---

## 리뷰 체크리스트

### 1. 전체 아키텍처

- [ ] **스킬 → command 전환**이 완전히 이루어졌는가 (pi 스킬 디렉토리 잔여물 없음)
- [ ] 3개 command의 책임 분리가 명확한가 (init/new/design-system 간 중복 없음)
- [ ] 리소스 디렉토리(`docs/feature-workflow/`)의 절대경로가 command 본문에 올바르게 기재되었는가
- [ ] `AGENTS.md`는 command로 설치되며, 설치 후 pi가 자동 로딩하는 구조인가

### 2. command/zz-workflow-init.md

- [ ] `$PROJECT_PATH` 변수 설명이 명확한가
- [ ] 설치하는 13개 파일 목록이 정확한가
- [ ] 파일 생성 절차가 실행 가능한 수준인가 (Read → 치환 → Write)
- [ ] 플레이스홀더 치환 규칙이 명확한가
- [ ] 리소스 경로가 `/Users/jimmylee/...` 절대경로로 하드코딩되었는데, 환경 변경 시 대응 방안이 필요한가
- [ ] 옵션 파일(extras/)과의 관계가 명확한가

### 3. command/zz-workflow-new.md

- [ ] 버전 자동 결정 로직이 직관적인가
- [ ] `$FEATURE_NAME` 입력 형식 검증 규칙이 있는가
- [ ] 8개 템플릿 → 대상 경로 매핑이 정확한가
- [ ] `Feature Name` 치환(하이픈→공백, 첫글자 대문자) 규칙이 명확한가
- [ ] **PROGRESS.md 매트릭스 갱신 로직** — 기존 매트릭스를 파싱해서 행을 추가하는 방식이 구체적인가
  - Feature ID 자동 증가 로직: 기존 마지막 F-XX + 1?
  - 매트릭스 섹션이 없으면?
  - PROGRESS.md가 없으면?
- [ ] `docs/features/` 디렉토리가 없는데 PROGRESS.md만 있는 엣지 케이스는?

### 4. command/zz-workflow-design-system.md

- [ ] 5개 파일이 올바른 경로에 생성되는가
- [ ] ckm-design-system 스킬과의 관계 설명이 명확한가 (뼈대만 생성, 실제 정의는 별도)
- [ ] 이미 `docs/design-system/`이 있을 때 덮어쓰지 않는 처리

### 5. docs/feature-workflow/ 리소스 파일들

- [ ] **AGENTS.md** — kkiri 도메인명이 모두 제거되고 중립적 플레이스홀더로 대체되었는가
- [ ] AGENTS.md의 "설치 방법" 안내가 init command 사용을 가리키고 있는가 (옳음: init이 이미 수행)
- [ ] **8개 템플릿** — kkiri 의존성 없이 중립적인가
- [ ] **api-conventions.md** — 오버라이드 안내(상단 notice)가 명확한가
- [ ] **design/ 5개 템플릿** — 첫 프로젝트에서 바로 채울 수 있을 수준의 스캐폴드인가
- [ ] **extras/ 3개 템플릿** — init의 선택 옵션으로 적절한가

### 6. 전체 정합성

- [ ] command 3개의 파일명과 호출명(`zz-workflow-init.md` → `/zz-workflow:init`) 일치
- [ ] 각 command가 참조하는 리소스 경로가 실제 파일 위치와 일치
- [ ] init과 new 사이의 인터페이스 일관성 (init이 만든 구조를 new가 사용)
- [ ] zz-workflow-new.md의 리소스 경로가 zz-workflow-init.md와 일관됨
- [ ] 기존 스킬(ckm-design-system 등)과의 충돌 없음

---

## 잠재적 문제 포인트

1. **리소스 경로 하드코딩** — command 본문에 `/Users/jimmylee/...` 절대경로가 박혀 있음. 이 프로젝트를 다른 위치로 옮기거나 다른 사용자가 쓰려면 수정 필요.
2. **PROGRESS.md 파싱** — `zz-workflow:new`가 기존 PROGRESS.md의 매트릭스 표를 파싱해서 행을 추가하는 로직. Markdown 표를 정확히 파싱하기 어려우므로, 실제 테스트 필요.
3. **버전 결정 UX** — 사용자에게 v0.1 vs v1 질문을 던지는 타이밍과 형식이 애매하면 혼란을 줄 수 있음.
4. **플레이스홀더 치환** — 현재 템플릿들에 `{placeholder}` 형식의 플레이스홀더가 거의 없음 (Feature Name 등은 자연어). init/new가 실제로 치환해야 할 대상이 명확한지 확인.
5. **중간에 init 없이 new 호출** — PROGRESS.md가 없는 프로젝트에서 `zz-workflow:new` 호출 시 엣지 케이스 처리.
6. **command가 OpenCode 포맷 준수** — frontmatter에 `allowed-tools`, `disable-model-invocation` 등 OpenCode 전용 필드 없이 `description`만 있는데, 현재 다른 command들과 일관성 확인.

---

## 테스트 시나리오

1. 빈 디렉토리에서 `/zz-workflow:init /tmp/test-project` 실행 → 파일 13개 생성 확인
2. init된 프로젝트에서 `/zz-workflow:new auth` 실행 → v0 생성 + PROGRESS 갱신 확인
3. 같은 프로젝트에서 `/zz-workflow:new auth` 다시 실행 → v0.1 질문 확인
4. `/zz-workflow:design-system /tmp/test-project` 실행 → 5개 파일 생성 확인
