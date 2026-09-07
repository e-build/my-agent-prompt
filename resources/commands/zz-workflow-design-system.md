# zz-workflow:design-system

대상 프로젝트에 디자인 시스템 문서 뼈대를 생성한다.
실제 디자인 토큰과 컴포넌트 정의는 이 구조 위에 `ckm-design-system` 스킬 등으로 채워넣는다.

## 사용법

```
/zz-workflow:design-system $PROJECT_PATH
```

- `$PROJECT_PATH`: 디자인 시스템을 초기화할 프로젝트 루트 경로 (절대경로). 생략 시 현재 작업 디렉토리 — 대상에 이미 설치 파일이 있으면 Phase 1 게이트를 통과해야 한다.

## 실행 타이밍 (권장)

이 명령은 언제든 실행할 수 있지만, **요구사항(01)·기획(02)이 확정되고 화면 정의(03)를 시작하기 직전**이 가장 안전하다.

- 조기에 토큰/컴포넌트를 구체적으로 채워두면 UI 방향 변경 시 전면 재작성 위험이 커진다 (기존 프로젝트에서 디자인 시스템 전체를 폐기한 사례 있음).
- 이 명령은 뼈대만 생성하므로 부담은 적지만, 내용을 채우는 작업은 화면 정의와 병행할 것.
- UI 방향이 아직 열려 있는 프로젝트라면 실행을 보류하고 안내만 한다.

---

## 생성하는 파일

리소스 경로:
```
/Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/resources/templates/feature-workflow/design/
```

```
{project}/docs/design-system/
├── index.md              # 디자인 시스템 문서 안내 (진입점)
├── principles.md         # 디자인 원칙
├── tokens.md             # 디자인 토큰 (색상/타이포/간격)
├── components.md         # 컴포넌트 명세
└── patterns.md           # 디자인 패턴
```

---

## 실행 절차

### Phase 1: 대상 준비 + 기존 디렉토리 게이트

1. `$PROJECT_PATH` 디렉토리 확인. 없으면 생성.
2. `docs/design-system/` 디렉토리가 이미 있는지 확인:
   - **있으면**: 기존 파일 목록을 출력하고, 절대 덮어쓰지 않는다. 사용자에게 선택지를 제시한다:
     - 중단 (기본 권장) — 기존 문서 보존
     - 없는 파일만 생성 — 기존 파일은 그대로 두고 누락된 템플릿만 추가
   - **없으면**: 디렉토리 생성 후 진행.

### Phase 2: 파일 생성

리소스 디렉토리의 각 템플릿을 대상 경로에 복사한다. `{Project Name}` 플레이스홀더는 프로젝트명으로 치환한다.

| 템플릿 파일 | → 대상 파일 |
|---|---|
| `design-index-template.md` | `{project}/docs/design-system/index.md` |
| `design-principles-template.md` | `{project}/docs/design-system/principles.md` |
| `design-tokens-template.md` | `{project}/docs/design-system/tokens.md` |
| `design-components-template.md` | `{project}/docs/design-system/components.md` |
| `design-patterns-template.md` | `{project}/docs/design-system/patterns.md` |

각 템플릿을 Read로 읽고, 플레이스홀더를 치환한 뒤 Write로 대상 경로에 생성한다.

### Phase 3: 완료 확인

생성된 파일 목록과 구조를 출력한다.

---

## 설치 후 안내

> zz-workflow:design-system 설치 완료.
>
> 디자인 시스템 구조가 생성되었습니다. 다음 단계:
> 1. `docs/design-system/principles.md` — 프로젝트 디자인 원칙 정의
> 2. `docs/design-system/tokens.md` — 색상/타이포/간격 등 시각 토큰 입력
> 3. `docs/design-system/components.md` — UI 컴포넌트 명세 작성
> 4. `docs/design-system/patterns.md` — 화면 구성 패턴 정리
>
> 실제 디자인 토큰/컴포넌트 정의는 `ckm-design-system` 스킬 등을 활용하세요.
