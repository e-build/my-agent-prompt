---
description: Documentation commands help and guide
agent: doc-manager
---

# docs/ 문서화 커맨드 가이드

프로젝트 문서화를 위한 모든 커맨드와 워크플로우를 설명합니다.

---

## 사용 가능한 커맨드

| 커맨드 | 용도 | 주요 사용 시점 |
|--------|------|---------------|
| `/docs-execute` | 주제/기능 문서화 실행 | 새로운 학습 내용이나 설계 작성 시 |
| `/docs-review` | 기존 문서 비판적 검토 | 문서 품질 개선 필요 시 |
| `/docs-make-book` | 전체 문서 종합본 생성 | 프로젝트 문서 통합 필요 시 |
| `/docs-status` | 문서화 현황 대시보드 | 문서화 상태 파악 필요 시 |
| `/docs-extract-learning` | 코드에서 개념 추출 | 범용 개념 문서화 필요 시 |
| `/docs-brainstorm-design` | 설계 문서 구조 기획 | 새 기능 설계 문서 작성 전 |
| `/docs-help` | 커맨드 도움말 | 사용법이 궁금할 때 |

---

## 커맨드 상세 설명

### /docs-execute

**목적**: 자연어로 주제를 설명하면 적절한 문서를 생성

**사용법**:
```
/docs-execute {주제}
/docs-execute "벡터 검색 최적화"
/docs-execute "현재 구현된 AI 에이전트 아키텍처"
```

**동작**:
1. 주제 분석 (관련 코드, 기존 문서 확인)
2. 구조 결정 (feature, learning/ vs design/)
3. 문서 작성 (규칙 준수)
4. index.md 업데이트

**출력**: 생성된 문서 목록, 요약, 후속 제안

---

### /docs-review

**목적**: 기존 문서를 비판적으로 검토하고 개선점 제시

**사용법**:
```
/docs-review {경로}
/docs-review docs/08-opencode-pattern/
/docs-review docs/02-context-search/learning/
```

**검토 항목**:
- 구조 (목차, 파일명, 분류)
- 정확성 (출처, 기술 정확도, 일관성)
- 완성도 (범위, 깊이, 예시)
- 가치 (유용성, 중복, 유지보수성)

**출력**: 등급, 강점, 개선점 (우선순위별), 즉시 수정 가능한 것

---

### /docs-make-book

**목적**: docs/ 전체를 종합하여 체계적인 레퍼런스 북 생성

**사용법**:
```
/docs-make-book
```

**동작**:
1. 전체 문서 수집 및 분류
2. 학습 순서에 맞게 구조화
3. Part/Chapter로 재구성
4. 목차, 용어집, 학습 경로 생성

**출력 위치**: `docs/book/`

**구조**:
- README.md (책 소개)
- toc.md (전체 목차)
- glossary.md (용어집)
- learning-path.md (추천 학습 경로)
- part-N-xxx/ (Part별 챕터)
- appendix/ (부록)

---

### /docs-status

**목적**: 전체 문서화 현황을 대시보드 형태로 표시

**사용법**:
```
/docs-status
/docs-status docs/08-opencode-pattern  (특정 feature만)
```

**출력 내용**:
- 전체 현황 (Feature 수, 완료/진행/부실/미시작)
- Feature별 상태 (learning/design 수, 최근 수정)
- 주의 필요 항목 (TODO, 오래된 문서, 규칙 위반)
- 트렌드 (월별 작성량, 카테고리 분포)
- 권장 액션 (즉시 필요, 개선 권장, 다음 문서화 추천)

---

### /docs-extract-learning

**목적**: 코드나 문서에서 범용 개념을 추출하여 learning/ 문서 생성

**사용법**:
```
/docs-extract-learning                              (전체 스캔)
/docs-extract-learning src/search/                  (경로 지정)
/docs-extract-learning "검색 기능"                   (주제 지정)
```

**동작**:
1. 코드, design/, learning/ 분석
2. 범용 개념 추출 (알고리즘, 라이브러리, 패턴 등)
3. 사용자 확인 (question 도구)
4. learning/ 문서 생성

**추출 대상**: 알고리즘, 기술 이론, 외부 라이브러리, 디자인 패턴

**제외**: 프로젝트 특화 설정, 비즈니스 로직

---

### /docs-brainstorm-design

**목적**: 새 기능의 design/ 문서 구조 브레인스토밍

**사용법**:
```
/docs-brainstorm-design "화자 등록 시스템"          (자연어)
/docs-brainstorm-design 21                          (feature 번호)
/docs-brainstorm-design src/meeting/search/         (코드 경로)
```

**동작**:
1. 기능/시스템 파악
2. 브레인스토밍 깊이 선택 (question 도구)
   - 가벼운 제안 (문서 종류만)
   - 중간 (목차 포함)
   - 즉시 초안 생성
3. 필요한 design/ 문서 제안
4. /docs-execute로 연결

**제안 문서 유형**: 
- 시스템 구조 (architecture, component-diagram)
- 데이터 설계 (database-schema, data-model)
- 인터페이스 (api-specification, event-schema)
- 흐름 (data-flow, sequence-diagram)
- 결정 사항 (decision-log, configuration)

---

## 일반적인 워크플로우

### 워크플로우 1: 새 기능 문서화 시작

```
1. 설계 문서 구조 기획
   /docs-brainstorm-design "새 기능명"
   
2. 설계 문서 작성
   /docs-execute "database schema for 새 기능"
   /docs-execute "API specification for 새 기능"
   
3. 개념 추출
   /docs-extract-learning src/new-feature/
   
4. 현황 확인
   /docs-status
```

---

### 워크플로우 2: 기존 문서 개선

```
1. 현황 파악
   /docs-status
   
2. 특정 문서 검토
   /docs-review docs/08-opencode-pattern/
   
3. 개선점 반영
   /docs-execute "개선 내용"
   
4. 재검토
   /docs-review docs/08-opencode-pattern/
```

---

### 워크플로우 3: 프로젝트 전체 문서화 점검

```
1. 전체 현황 확인
   /docs-status
   
2. 부족한 개념 추출
   /docs-extract-learning
   
3. 각 feature 검토
   /docs-review docs/01-xxx/
   /docs-review docs/02-xxx/
   
4. 종합본 생성
   /docs-make-book
```

---

### 워크플로우 4: 코드 기반 문서화

```
1. 코드에서 개념 추출
   /docs-extract-learning src/main/kotlin/
   
2. 설계 문서 보완
   /docs-brainstorm-design src/main/kotlin/
   
3. 현황 확인
   /docs-status
```

---

## 문서화 규칙 요약

### 디렉토리 구조

```
docs/{번호}-{feature-name}/
├── index.md              ← Tasks 체크리스트
├── learning/             ← 범용 개념 (영구)
└── design/               ← 프로젝트 설계 (영구)
```

### learning/ vs design/ 판단

| 내용 | learning/ | design/ |
|------|:---------:|:-------:|
| 범용 기술 이론 | ✅ | |
| 알고리즘 설명 | ✅ | |
| 기술 비교/분석 | ✅ | |
| 우리 시스템 설계 | | ✅ |
| DB 스키마 | | ✅ |
| API 설계 | | ✅ |
| 설정값/결정 근거 | | ✅ |

**핵심 질문**: "다른 프로젝트에서도 유용한가?"
- Yes → learning/
- No → design/

### 파일 규칙

- **파일명**: 소문자, 하이픈 구분 (예: `vector-embedding.md`)
- **목차**: 모든 md에 H1 바로 아래 필수
- **언어**: 한국어 기본, 기술용어 영어 허용

### learning/ 규칙

- **출처 필수**: 공식문서, 논문 등 신뢰할 수 있는 출처
- **허용**: 개념, 이론, 비교 분석, 트레이드오프
- **금지**: 프로젝트 특화 설계, 구체적 구현 코드

### design/ 규칙

- **추상화 유지**: 구현 독립적으로 작성
- **다이어그램 활용**: Mermaid flowchart, sequence, class diagram
- **허용**: DB 스키마, API, 아키텍처, 결정 근거
- **금지**: 범용 기술 개념

---

## FAQ

### Q1. learning/과 design/ 중 어디에 써야 할지 헷갈려요.

**A**: 다음 질문으로 판단하세요:
- "이 내용이 다른 프로젝트에서도 유용한가?" → Yes: learning/
- "이것은 우리 시스템 고유의 결정인가?" → Yes: design/
- "출처가 공식문서/논문인가?" → Yes: learning/
- "우리가 직접 결정한 설정값/구조인가?" → Yes: design/

**예시**:
- "RRF 알고리즘이란?" → learning/
- "우리 시스템에서 RRF 가중치를 60/40으로 한 이유" → design/

---

### Q2. 어떤 순서로 문서를 작성해야 하나요?

**A**: 일반적인 순서:
1. 설계 문서 구조 기획 (`/docs-brainstorm-design`)
2. 핵심 설계 문서 작성 (`/docs-execute`)
3. 필요한 개념 추출 (`/docs-extract-learning`)
4. 검토 및 개선 (`/docs-review`)

---

### Q3. 너무 많은 문서가 필요한 것 같아요.

**A**: 꼭 필요한 것만 작성하세요:
- 소규모 기능: 2-3개 문서
- 중규모 기능: 4-6개 문서
- 대규모 시스템: 7개 이상

과도한 문서화는 유지보수 부담만 늘립니다.

---

### Q4. 코드가 자주 바뀌는데 문서도 계속 수정해야 하나요?

**A**: design/ 문서는 **추상화 수준을 유지**하세요:
- 구체적인 코드 X
- 인터페이스/계약 중심
- Mermaid 다이어그램 활용
- 자주 변경되는 부분은 간결하게

이렇게 하면 코드 변경 시 문서 수정이 최소화됩니다.

---

### Q5. 이미 구현된 기능인데 문서가 없어요.

**A**:
1. `/docs-extract-learning src/path/` - 개념 추출
2. `/docs-brainstorm-design src/path/` - 설계 문서 구조 파악
3. `/docs-execute` - 각 문서 작성

---

### Q6. index.md는 언제 업데이트하나요?

**A**: 자동으로 업데이트됩니다:
- `/docs-execute` 실행 시 자동 링크 추가
- `/docs-extract-learning` 실행 시 자동 링크 추가

수동 관리 필요 없음.

---

### Q7. 문서 품질을 어떻게 확인하나요?

**A**:
1. `/docs-review` - 비판적 검토
2. `/docs-status` - 전체 현황 (오래된 문서, 규칙 위반)

---

### Q8. learning/ 문서에 출처가 없으면 어떻게 하나요?

**A**: `/docs-extract-learning`이 자동으로 출처를 찾습니다:
- librarian agent로 공식문서 탐색
- 신뢰할 수 있는 출처만 포함
- 출처 찾을 수 없으면 작성 보류

---

### Q9. 종합본 (book/)은 언제 만드나요?

**A**: 다음 시점에 유용합니다:
- 프로젝트 온보딩 자료 필요 시
- 전체 문서 통합 리뷰 시
- 외부 공유용 문서 필요 시

---

### Q10. 어떤 커맨드를 가장 자주 쓰게 되나요?

**A**: 사용 빈도 순:
1. `/docs-execute` (가장 자주)
2. `/docs-status`
3. `/docs-review`
4. `/docs-extract-learning`
5. `/docs-brainstorm-design`
6. `/docs-make-book` (가끔)

---

## 추가 도움

- 상세 규칙: `~/.config/opencode/refs/docs-rules.md`
- 문서 탐색: `docs/README.md`
- 프로젝트 가이드: `CLAUDE.md`

---

## 빠른 참조

### 자주 쓰는 패턴

```bash
# 새 기능 문서화
/docs-brainstorm-design "기능명"
/docs-execute "설계 문서"
/docs-extract-learning src/path/

# 현황 파악
/docs-status

# 품질 개선
/docs-review docs/XX/
```

### 커맨드 체이닝 (순서)

```
설계 → 실행 → 추출 → 검토 → 현황
  ↓      ↓      ↓      ↓      ↓
brainstorm → execute → extract → review → status
```

---

더 자세한 내용은 각 커맨드의 도움말을 참조하세요.
