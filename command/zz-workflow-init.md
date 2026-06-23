---
description: 대상 프로젝트에 zz-workflow 방법론을 설치한다. AGENTS.md + 8개 표준 템플릿 + API 규약 + 대시보드 + 레지스트리를 생성.
---

# zz-workflow:init

대상 프로젝트에 **문서-선행, 단계별 게이트 기반 기능개발 방법론**을 설치한다.
설치 후 해당 프로젝트에서 pi를 열면 AGENTS.md가 자동 로딩되어 모든 작업이 6단계 절차를 따르게 된다.

## 사용법

```
/zz-workflow:init $PROJECT_PATH
```

- `$PROJECT_PATH`: 설치할 프로젝트의 루트 경로 (절대경로). 생략 시 현재 작업 디렉토리.

---

## 설치하는 파일

설치 명령은 아래 파일들을 대상 프로젝트에 생성한다. 각 파일은 `docs/feature-workflow/` 리소스 디렉토리의 템플릿에서 복사되며, 중괄호 플레이스홀더(`{Project Name}`, `{project-name}`)는 대상 프로젝트명으로 자동 치환한다.

```
{project}/
├── AGENTS.md                        # 6단계 절차 + 게이트 + 규칙 (★핵심)
├── PROGRESS.md                      # 루트 대시보드 + 진행 매트릭스
│
├── docs/
│   ├── screen-definitions.md        # 화면 ID 레지스트리
│   ├── engineering/
│   │   └── api-conventions.md       # API 응답/에러/페이지네이션 규약
│   └── templates/                   # 기능별 표준 템플릿
│       ├── README.md
│       ├── feature-index-template.md
│       ├── feature-01-requirements-template.md
│       ├── feature-02-plans-template.md
│       ├── feature-03-screens-template.md
│       ├── feature-04-api-template.md
│       ├── feature-05-design-template.md
│       ├── feature-06-decisions-template.md
│       └── feature-07-progress-template.md
```

## 추가 옵션 (init 후 수동 또는 선택 실행)

아래 파일들은 `zz-workflow:init`의 기본 설치 대상이 아니다. 필요에 따라 `docs/feature-workflow/extras/`에서 복사하거나, 별도로 생성한다.

| 파일 | 용도 | 복사 위치 |
|------|------|----------|
| `extras/PRD.md` | 제품 요구사항 정의서 | `{project}/docs/PRD.md` |
| `extras/ROADMAP.md` | 개발 로드맵 | `{project}/docs/ROADMAP.md` |
| `extras/ARCHITECTURE.md` | 기술 아키텍처 | `{project}/docs/ARCHITECTURE.md` |

디자인 시스템 초기화는 별도 명령어 사용: `/zz-workflow:design-system $PROJECT_PATH`

---

## 실행 절차

### Phase 1: 대상 준비

1. `$PROJECT_PATH`가 유효한 디렉토리인지 확인. 없으면 생성.
2. 대상 프로젝트명 추출: 경로 마지막 디렉토리명 (예: `/path/to/my-app` → `my-app`)
3. 프로젝트명의 표기 변형 준비:
   - `{Project Name}`: 사람용 표기 (예: `My App`)
   - `{project-name}`: 파일명/디렉토리용 (예: `my-app`)

### Phase 2: 파일 생성

리소스 디렉토리 경로:
```
/Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/docs/feature-workflow/
```

아래 순서대로 각 파일을 생성한다. 각 템플릿 파일을 Read로 읽고, 플레이스홀더(`{Project Name}`, `{project-name}`)를 치환한 뒤 대상 경로에 Write한다.

1. `AGENTS.md` → `{project}/AGENTS.md`
2. `PROGRESS.md` → `{project}/PROGRESS.md`
3. `screen-definitions.md` → `{project}/docs/screen-definitions.md`
4. `engineering/api-conventions.md` → `{project}/docs/engineering/api-conventions.md`
5. `templates/README.md` → `{project}/docs/templates/README.md`
6. `templates/feature-index-template.md` → `{project}/docs/templates/feature-index-template.md`
7. `templates/feature-01-requirements-template.md` → `{project}/docs/templates/feature-01-requirements-template.md`
8. `templates/feature-02-plans-template.md` → `{project}/docs/templates/feature-02-plans-template.md`
9. `templates/feature-03-screens-template.md` → `{project}/docs/templates/feature-03-screens-template.md`
10. `templates/feature-04-api-template.md` → `{project}/docs/templates/feature-04-api-template.md`
11. `templates/feature-05-design-template.md` → `{project}/docs/templates/feature-05-design-template.md`
12. `templates/feature-06-decisions-template.md` → `{project}/docs/templates/feature-06-decisions-template.md`
13. `templates/feature-07-progress-template.md` → `{project}/docs/templates/feature-07-progress-template.md`

각 파일 생성 시 **읽기 → 치환 → 쓰기** 순서를 지킨다. 치환할 플레이스홀더가 없으면 있는 그대로 복사한다.

### Phase 3: 완료 확인

생성된 파일 목록을 출력하고, `{project}/AGENTS.md`의 처음 10줄을 읽어 정상 치환되었는지 확인한다.

---

## 파일별 치환 대상 (템플릿 내 `{placeholder}`)

현재 템플릿 파일들에는 플레이스홀더가 거의 없으며, 프로젝트별 도메인명은 설치 후 AGENTS.md에서 수동 수정한다. 추후 템플릿에 `{Project Name}` 플레이스홀더가 추가되면 본 명령어도 함께 업데이트한다.

---

## 설치 후 첫 액션

설치가 끝나면 다음 안내를 출력한다:

> zz-workflow 설치 완료.
> 
> 다음 단계:
> 1. `AGENTS.md`를 열어 프로젝트 도메인 예시를 실제에 맞게 수정
> 2. 필요시 `docs/templates/`의 템플릿을 프로젝트에 맞게 커스터마이즈
> 3. 첫 기능 시작: `/zz-workflow:new {first-feature-name}`
