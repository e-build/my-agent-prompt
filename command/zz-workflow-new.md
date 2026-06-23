---
description: 새 기능을 시작하거나 기존 기능을 고도화한다. 기능 디렉토리를 생성하고 8개 표준 템플릿을 복사하며 PROGRESS.md 매트릭스를 갱신한다.
---

# zz-workflow:new

신규 기능을 시작할 때, 또는 기존 기능을 고도화할 때 사용한다.
버전은 자동 결정하며, 템플릿을 복사하고 PROGRESS.md에 기능 행을 추가한다.

## 사용법

```
/zz-workflow:new $FEATURE_NAME
```

- `$FEATURE_NAME`: 기능 식별자. 소문자+하이픈. (예: `auth`, `order-management`, `record`)

---

## 버전 자동 결정 규칙

1. `docs/features/{name}/` 디렉토리가 **없음** → `v0` (신규 기능)
2. `docs/features/{name}/v0/` **만** 있음 → 사용자에게 질문: `v0.1` (소규모 개선) 또는 `v1` (첫 안정 버전)
3. `docs/features/{name}/v1/` 까지 있음 → 사용자에게 질문: `v1.1` (확장) 또는 `v2` (대규모 변경)
4. 일반 규칙:
   - `v0` → `v0.1`(patch) → `v1`(major) → `v1.1`(patch) → `v2`(major) → ...

질문 형식:

> `docs/features/{name}/` 디렉토리가 이미 존재합니다. 다음 버전을 선택해주세요:
> - v{next_patch} — 소규모 개선/버그픽스
> - v{next_major} — 대규모 변경/새 범위

---

## 실행 절차

### Phase 1: 대상 확인

1. 현재 작업 디렉토리가 유효한 프로젝트 루트인지 확인 (`docs/` 디렉토리 존재)
2. `$FEATURE_NAME`이 유효한 소문자+하이픈 형식인지 확인 (숫자/언더스코어 있으면 `auth_order` → 안내 후 수정)
3. `docs/features/{name}/` 존재 여부 확인

### Phase 2: 버전 결정

상기 버전 자동 결정 규칙에 따라 대상 버전을 확정한다.

### Phase 3: 파일 생성

1. `docs/features/{name}/v{version}/` 디렉토리 생성
2. 아래 8개 템플릿을 리소스에서 읽어 대상 경로에 복사:

리소스 경로:
```
/Users/jimmylee/IdeaProjects/e-build/my-agent-prompt/docs/feature-workflow/templates/
```

| 템플릿 파일 | → 대상 파일 |
|---|---|
| `feature-index-template.md` | `docs/features/{name}/v{version}/index.md` |
| `feature-01-requirements-template.md` | `docs/features/{name}/v{version}/01-requirements.md` |
| `feature-02-plans-template.md` | `docs/features/{name}/v{version}/02-plans.md` |
| `feature-03-screens-template.md` | `docs/features/{name}/v{version}/03-screens.md` |
| `feature-04-api-template.md` | `docs/features/{name}/v{version}/04-api.md` |
| `feature-05-design-template.md` | `docs/features/{name}/v{version}/05-design.md` |
| `feature-06-decisions-template.md` | `docs/features/{name}/v{version}/06-decisions.md` |
| `feature-07-progress-template.md` | `docs/features/{name}/v{version}/07-progress.md` |

3. 각 템플릿의 `Feature Name`을 `$FEATURE_NAME`(사람용 표기)으로 치환
   - 사람용 표기: 하이픈을 공백으로, 첫 글자 대문자. 예: `order-management` → `Order Management`
4. `index.md`의 문서 맵 상태를 `작성 예정`으로 설정

### Phase 4: PROGRESS.md 갱신

루트 `PROGRESS.md`가 있으면 아래를 수행:

1. `PROGRESS.md` 읽기
2. **기능별 6단계 진행 매트릭스** 섹션 찾기
3. 새 기능 행 추가:
   ```
   | {Feature ID} | {Feature Name} | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
   ```
4. Feature ID는 기존 매트릭스의 마지막 ID + 1 (예: 기존 마지막이 F-03이면 F-04)
   - 신규 프로젝트면 F-01부터 시작
5. **분야별 주요 작업** 섹션에도 해당 기능 항목 추가 (기획 항목에 1단계 미착수로 표시)

`PROGRESS.md`가 없으면 생성하지 않는다. (init을 먼저 실행해야 함)

### Phase 5: 완료 확인

생성된 디렉토리 구조와 PROGRESS.md 갱신 결과를 출력한다.

---

## 스캐폴드 결과 예시

```
/zz-workflow:new auth

→ docs/features/auth/ 없음 → v0 생성
→ 8개 파일 생성 완료
→ PROGRESS.md에 F-01 Auth 행 추가

docs/features/auth/v0/
├── index.md
├── 01-requirements.md
├── 02-plans.md
├── 03-screens.md
├── 04-api.md
├── 05-design.md
├── 06-decisions.md
└── 07-progress.md

다음 단계: /zz-workflow:new 명령어로 첫 기능을 시작했습니다.
AGENTS.md의 6단계 절차에 따라 01-requirements.md부터 작업을 시작하세요.
```
