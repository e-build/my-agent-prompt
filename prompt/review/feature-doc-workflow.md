# feature-doc-workflow 스킬팩 리뷰

## 개요

kkiri 프로젝트의 기능개발 절차(AGENTS.md + 8개 템플릿 + 4계층 방법론)를 추출해 **범용 에이전트 스킬팩**으로 재패키징한 자산.
다른 프로젝트에서도 동일한 "docs-first, stage-gated" 워크플로우를 쓸 수 있도록 `feature-doc-workflow` 스킬로 만들었다.

## 리뷰 대상: `skills/feature-doc-workflow/`

```
SKILL.md                              # 메인 진입점 (트리거/6단계요약/게이트/스캐폴드)
references/procedure.md               # 6단계 상세 절차 + 체크리스트
references/doc-rules.md               # 문서 작성 규칙
templates/README.md                   # 템플릿 사용 가이드
templates/feature-index-template.md
templates/feature-01-requirements-template.md
templates/feature-02-plans-template.md
templates/feature-03-screens-template.md
templates/feature-04-api-template.md
templates/feature-05-design-template.md
templates/feature-06-decisions-template.md
templates/feature-07-progress-template.md
templates/engineering/api-conventions.md   # kkiri 기본값 + 오버라이드 가이드
templates/AGENTS.md                        # 프로젝트 부착용
templates/PROGRESS.md                      # 루트 대시보드
templates/screen-definitions.md            # 화면 ID 레지스트리
```

---

## 리뷰 체크리스트

### 1. 구조/컨벤션 확인

- [ ] `write-a-skill` 스킬 컨벤션 준수: SKILL.md ≤ 100줄, 파일 분리 기준 만족
- [ ] 기존 스킬들(`docs-readability`, `shopl-dev-*`, `ckm-*`)과 일관된 구조
- [ ] 번들 자원(templates/, references/) 위치와 참조 경로 일관성
- [ ] 템플릿 파일명: 기존 kkiri와 일관성 (01~07 넘버링)

### 2. SKILL.md

- [ ] Description(트리거)이 실제 에이전트가 판단 가능한 키워드를 포함하는가
- [ ] 한국어 트리거 키워드가 충분한가
- [ ] 6단계 요약이 빠르게 이해되는가
- [ ] 게이트 원칙이 명확히 전달되는가
- [ ] "Scaffolding a new feature" 절차가 구체적이고 따라가기 쉬운가
- [ ] 오버라이드 안내가 적절한가
- [ ] `references/`로의 포인터가 정확한가

### 3. references/procedure.md

- [ ] 6단계 각각의 목적/산출물/완료기준/시작전체크가 균일하게 정리되었는가
- [ ] 게이트 요약표가 각 단계간 조건을 한눈에 알려주는가
- [ ] kkiri 특정 내용이 남아있진 않은가 (예: F-01~F-10, kkiri 기능명)

### 4. references/doc-rules.md

- [ ] 문서작성 규칙이 모호하지 않은가
- [ ] AGENTS.md의 문서 규칙과 중복되지 않는가 (중복이면 한쪽 정리)

### 5. 8개 feature 템플릿

- [ ] 각 템플릿이 kkiri 특정 내용 없이 중립적인가
- [ ] 파일 간 상대경로 링크(`../../../engineering/api-conventions.md`)가 `docs/features/{feature}/v{version}/` 기준으로 올바른가
- [ ] 예시 코드(`DomainNotFound`, `S-FEATURE-LIST`)가 프로젝트에 맞게 치환되어야 한다는 힌트가 명확한가
- [ ] 각 템플릿의 필수 항목이 너무 많지는 않은가 (최소 필요한 선)
- [ ] 템플릿 간 내용 중복은 없는가 (요구사항 vs 기획 경계)

### 6. templates/engineering/api-conventions.md

- [ ] 오버라이드 가이드(상단 notice)가 명확한가
- [ ] kkiri의 4단계 인증게이트가 그대로인데, "예시입니다"가 충분히 눈에 띄는가
- [ ] envelope(`result`/`data`/`error`), HTTP status, error code naming, pagination이 일관성 있게 정의되었는가
- [ ] 페이지네이션 기본값(limit 20, max 100, cursor-based)이 다른 프로젝트에서도 적절한 기본값인가

### 7. templates/AGENTS.md

- [ ] 프로젝트 루트에 복사했을 때 "이걸 이제 뭘 더 해야 하지"가 아니라 "도메인명만 바꾸면 된다"는 느낌인가
- [ ] 디렉토리 구조 설명이 직관적인가
- [ ] 크로스 레퍼런스 규칙이 명확한가
- [ ] "적용 방법" 안내가 충분한가

### 8. templates/PROGRESS.md

- [ ] 루트 대시보드의 역할(개요+매트릭스 → 기능별 progress.md)이 명확한가
- [ ] 매트릭스 표에 상태 범례와 용도가 충분히 설명되었는가

### 9. templates/screen-definitions.md

- [ ] 화면 ID 체계가 명확한가
- [ ] 화면별 상세 템플릿이 충분한가
- [ ] `03-screens.md`와의 관계 설명이 있는가

### 10. 전체 정합성

- 이 문서들 간의 **상호참조 정합성**:
  - [ ] SKILL.md → references/procedure.md, references/doc-rules.md 링크 정상
  - [ ] templates/AGENTS.md 내 모든 `../../../` 경로가 실제 디렉토리 구조와 일치
  - [ ] templates/README.md가 8개 템플릿 각각의 위치와 용도를 설명
  - [ ] templates/engineering/api-conventions.md가 AGENTS.md에서 참조하는 경로와 일치
- [ ] kkiri 도메인명이 빠진 흔적 없이 모두 `{feature}`/`{placeholder}`로 대체되었는가
- [ ] "이건 프로젝트에서 채워야 한다" vs "이건 방법론의 일부라 그대로 간다"의 경계가 명확한가

---

## 잠재적 문제 포인트 (우선 검토)

1. **AGENTS.md의 프로젝트 적용 복잡도**: 6페이지 분량. 새 프로젝트에 붙였을 때 부담스럽지 않은가? 더 얇은 버전이 필요한가?
2. **api-conventions.md 인증게이트**: kkiri의 4단계 게이트(auth→email→nickname→domain)가 너무 kkiri-specific한가? 범용 "로그인 여부 → 도메인 권한" 2단계로 단순화할 필요가 있는가?
3. **templates 수**: 8개 템플릿 + README + AGENTS + PROGRESS + screen-definitions + api-conventions = **13개 템플릿 파일**. 첫 프로젝트 세팅 비용이 너무 크지는 않은가?
4. **OS/editor 중립성**: macOS + VS Code 환경을 가정한 설명이 있는가?
5. **에러 코드 리스트 길이**: api-conventions의 예시 코드가 충분히 많은가? 혹은 너무 많은가?
6. **SKILL.md와 AGENTS.md 중복**: 둘 다 6단계를 설명한다. AGENTS.md는 프로젝트용, SKILL.md는 에이전트용으로 역할이 명확히 분리되는가?

---

## 검증 시나리오 (에이전트로 테스트)

실제 에이전트를 실행해서 아래 문장으로 트리거가 잘 동작하는지 확인:

1. `"새 기능 만들어줘"`
2. `"API 명세랑 에러 코드 같이 정의해야 해"`
3. `"요구사항부터 구현까지 6단계로 진행해줘"`
4. `"feature 스캐폴드 해줘"`

각각에서 올바른 스킬이 로딩되는지, 첫 응답이 적절한지 확인.
