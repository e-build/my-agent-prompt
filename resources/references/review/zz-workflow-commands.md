# zz-workflow commands 리뷰

## 개요

kkiri 프로젝트의 기능개발 절차를 추출해 **4개의 공유 command** + **AGENTS.md** 로 재패키징한 자산.
다른 프로젝트에서 동일한 "docs-first, stage-gated feature development" 워크플로우를 쓸 수 있도록 설계.

## 리뷰 대상

```
resources/commands/                     # 정본 명령 본문
├── zz-workflow-init.md                 # 프로젝트에 방법론 설치
├── zz-workflow-new.md                  # 기능·버전 스캐폴드 + PROGRESS 갱신
├── zz-workflow-continue.md             # 기존 기능 재개 — 상태 진단·단계 진행·상태 동기화
└── zz-workflow-design-system.md        # 디자인 시스템 뼈대 초기화

resources/templates/feature-workflow/                # command가 참조하는 리소스들
├── AGENTS.md                         # → 프로젝트 루트 (기능 시작·재개 규칙 포함)
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

- [ ] 4개 command의 책임 분리가 명확한가 (init / new / continue / design-system 간 중복 없음)
- [ ] `new`와 `continue`의 역할 구분이 양쪽 본문과 AGENTS.md에서 동일하게 안내되는가 (new=새 디렉토리, continue=기존 작업 재개)
- [ ] 리소스 디렉토리(`resources/templates/feature-workflow/`) 경로가 command 본문에 올바르게 기재되었는가
- [ ] `AGENTS.md`는 command로 설치되며, 설치 후 pi가 자동 로딩하는 구조인가

### 2. command/zz-workflow-init.md

- [ ] `$PROJECT_PATH` 변수 설명이 명확한가
- [ ] 설치하는 13개 파일 목록이 정확한가
- [ ] **Phase 0 설치 전 확인 게이트** — 기존 설치 감지 시 중단/`--sync`/강제 선택지를 제시하며, 게이트 통과 전 어떤 파일도 쓰지 않는가
- [ ] `--sync`가 루트 문서·기능 문서를 건드리지 않는 범위로 정의되어 있는가
- [ ] 파일 생성 절차가 실행 가능한 수준인가 (Read → 치환 → Write)
- [ ] 옵션 파일(extras/)과의 관계가 명확한가

### 3. command/zz-workflow-new.md

- [ ] 버전 자동 결정 로직이 직관적인가
- [ ] `$FEATURE_NAME` 입력 형식 검증 규칙이 있는가
- [ ] **init 선행 확인** — AGENTS.md·PROGRESS.md 없으면 안내 후 중단하는가 (하프-설치 방지)
- [ ] 기존 기능 재개 목적 호출 시 `continue` 사용을 안내하는가
- [ ] 8개 템플릿 → 대상 경로 매핑이 정확한가
- [ ] **PROGRESS.md 매트릭스 갱신 로직** — `매트릭스` 패턴 헤더 탐색, 기존 행 열 수 적응, 섹션 없을 때 신규 생성 fallback, `F-(\d+)` 최대값+1 Feature ID 규칙이 구체적인가

### 4. command/zz-workflow-continue.md

- [ ] 상태 진단이 PROGRESS.md·기능 index.md·07-progress.md 3종으로 한정되는가 (이 시점에 다른 문서를 미리 읽지 않는가)
- [ ] 현재 단계 판정에서 index 문서 맵과 07-progress 불일치 시 사용자 판단을 구하는가
- [ ] 요약 보고(게이트) 후 확인 없이 단계 작업을 시작하지 않는가
- [ ] 산출물 확정 시 3개 상태 문서를 동시에 갱신하며, 동기화 직후 교차 확인(매트릭스↔문서 맵, 죽은 참조, 다음 작업 모순)을 수행하는가
- [ ] 결정 기록은 기존 `06-decisions.md` 포맷을 따르고, 세션 중단은 기존 `handoff` 스킬을 안내하는가 (별도 포맷 재발명 없음)

### 5. command/zz-workflow-design-system.md

- [ ] 5개 파일이 올바른 경로에 생성되는가
- [ ] 기존 `docs/design-system/`이 있을 때 덮어쓰지 않고 중단/없는 파일만 생성 선택지를 제시하는가
- [ ] 실행 타이밍 가이드(화면 정의 직전 권장·조기 구축 경고)가 포함되어 있는가
- [ ] ckm-design-system 스킬과의 관계 설명이 명확한가 (뼈대만 생성, 실제 정의는 별도)

### 6. resources/templates/feature-workflow/ 리소스 파일들

- [ ] **AGENTS.md** — 도메인 의존성 없이 중립적이며 `zz-workflow-version` 등 정본 고유 표기를 포함하지 않는가
- [ ] **AGENTS.md** — "기능 시작·재개 규칙" 섹션이 new/continue 역할 분리와 3개 상태 문서 동시 갱신 규칙을 담고 있는가
- [ ] **AGENTS.md 산출물 표** — 번호 문서 경로(`01-requirements.md` 등)로 일관되는가 (무번호 잔여 없음)
- [ ] **8개 템플릿** — 프로젝트 의존성 없이 중립적인가
- [ ] **api-conventions.md** — 오버라이드 안내(상단 notice)가 명확한가
- [ ] **design/ 5개 템플릿** — 첫 프로젝트에서 바로 채울 수 있을 수준의 스캐폴드인가
- [ ] **extras/ 3개 템플릿** — init의 선택 옵션으로 적절한가

### 7. 전체 정합성

- [ ] command 4개의 파일명과 호출명(`zz-workflow-init.md` → `/zz-workflow:init`) 일치
- [ ] 각 command가 참조하는 리소스 경로가 실제 파일 위치와 일치
- [ ] Pi adapter stub이 `~/.pi/agent/commands/<name>.md` 절대경로를 참조하는가 ("in this repo" 모호성 제거)
- [ ] init이 만든 구조를 new·continue가 동일하게 해석하는가 (상태 문서 3종 정의 일치)
- [ ] 기존 스킬(ckm-design-system, handoff 등)과의 충돌 없음

---

## 잠재적 문제 포인트 (2026-09-06 갱신)

1. **리소스 경로 하드코딩** — command 본문의 템플릿 루트 경로는 여전히 절대경로 고정. **부분 해결**: pi adapter stub은 `~/.pi/agent/commands` 심링크(install-pi가 구축)를 참조하므로 명령 본문 탐색 실패는 없음. 저장소 이전 시 본문 경로 수정 필요.
2. **PROGRESS.md 파싱** — **해결**: 정확한 섹션 제목 대신 `매트릭스` 패턴 탐색 + 기존 행 열 수 적응 + 섹션 신규 생성 fallback 적용.
3. **init 없이 new 호출** — **해결**: Phase 1에서 AGENTS.md·PROGRESS.md 확인 후 안내·중단.
4. **커스터마이즈 프로젝트 덮어쓰기** — **해결**: init Phase 0 게이트(중단/`--sync`/강제)와 design-system 기존 디렉토리 게이트 적용.
5. **기능 재진입 혼란** — **해결**: `continue` 명령 추가. 상태 문서 3종 진단 → 요약 보고 → 승인 후 진행 → 동시 갱신.
6. **버전 결정 UX** — **부분 해결**: 구조화 질문 도구 사용 및 선택지 의미 표기 명시. 실사용 피드백 지속 수집 필요.
7. **결정 채번 충돌(병행 세션)** — **미해결**: kkiri에서 D-32 채번 충돌 사고 이력 존재. `decide` 신규 명령 후보로 제안서(kkiri `docs/plans/zz-workflow-upgrade-proposal.md`)에 보류 중.

---

## 테스트 시나리오

1. 빈 디렉토리에서 `/zz-workflow:init /tmp/test-project` 실행 → 파일 13개 생성 확인
2. init된 프로젝트에 대해 init 재실행 → Phase 0 게이트 동작 확인 (조용한 덮어쓰기 없음)
3. init된 프로젝트에서 `/zz-workflow:new auth` 실행 → v0 생성 + PROGRESS 갱신 확인
4. 같은 프로젝트에서 `/zz-workflow:new auth` 다시 실행 → v0.1 질문 + `continue` 안내 확인
5. `/zz-workflow:continue auth` 실행 → 현재 단계·미결정·다음 작업 요약 확인 (요약 보고 전 작업 시작 없음)
6. 1단계 산출물 승인 → `07-progress.md`·기능 `index.md`·`PROGRESS.md` 3종 동시 갱신 확인
7. `/zz-workflow:design-system /tmp/test-project` 실행 → 5개 파일 생성 + 기존 디렉토리 존재 시 게이트 확인
