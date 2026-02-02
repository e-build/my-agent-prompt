---
description: Brainstorm design documentation structure for a feature or system
agent: doc-manager
---

# Design 문서 브레인스토밍

새로운 기능이나 시스템의 design/ 문서 구조를 브레인스토밍합니다.

**입력**: $ARGUMENTS (기능 설명, feature 번호, 또는 경로)

---

## 문서화 규칙 참조

@~/.config/opencode/refs/docs-rules.md

---

## 실행 절차

### Phase 1: 대상 파악

입력 형태에 따라 브레인스토밍 대상 식별:

**Case A - 자연어 기능 설명**
```
/docs-brainstorm-design "회의 검색 재설계"
/docs-brainstorm-design "화자 등록 시스템"
```
→ 기능 요구사항 파악

**Case B - 기존 feature 번호/이름**
```
/docs-brainstorm-design 21
/docs-brainstorm-design meeting-search-redesign
```
→ docs/21-xxx/ 또는 해당 feature 확인

**Case C - 코드 경로 기반**
```
/docs-brainstorm-design src/meeting/search/
```
→ 해당 코드 영역의 설계 문서 필요성 파악

**명확하지 않은 경우**: question 도구로 구체화
```
Q: "어떤 기능/시스템의 설계 문서를 작성하시겠습니까?"
   (자유 입력)

Q: "이 기능은 새로 설계하는 건가요, 기존 기능인가요?"
   1. 새로운 기능 (처음부터 설계)
   2. 기존 기능 (설계 문서 보완)
```

---

### Phase 2: 브레인스토밍 깊이 선택

question 도구로 사용자 선호 확인:

```
Q: "어느 수준의 브레인스토밍을 원하시나요?"
   
   1. 가벼운 제안 (필요한 문서 종류만)
      → 빠른 개요 파악
      
   2. 중간 수준 (각 문서의 목차/개요 포함)
      → 구체적인 구조 제안
      
   3. 즉시 초안 생성 (문서 파일 생성)
      → 바로 작성 시작
```

---

### Phase 3: Design 문서 구조 제안

선택된 깊이에 따라 제안:

#### 레벨 1: 가벼운 제안

```
"{기능명}" 설계 문서 구조 제안:

필요한 design/ 문서:
1. database-schema.md - DB 설계
2. api-specification.md - API 정의
3. data-flow.md - 데이터 흐름
4. architecture.md - 시스템 구조

추정 작업량: 약 X시간
```

#### 레벨 2: 목차 포함

```
"{기능명}" 설계 문서 구조 제안:

1. database-schema.md - DB 설계
   목차:
   - 개요
   - 테이블 설계
     - speakers 테이블
     - speaker_samples 테이블
   - 관계 설계
   - 인덱스 전략
   
2. api-specification.md - API 정의
   목차:
   - 개요
   - Endpoints
     - POST /api/speakers
     - GET /api/speakers/:id
   - Request/Response 스키마
   - 에러 처리
   
3. data-flow.md - 데이터 흐름
   목차:
   - 개요
   - 화자 등록 플로우
   - 화자 인식 플로우
   - 외부 시스템 연동
   
4. architecture.md - 시스템 구조
   목차:
   - 개요
   - 컴포넌트 구조
   - 레이어 분리
   - 의존성 관리
```

#### 레벨 3: 즉시 초안 생성

```
다음 파일을 생성합니다:

docs/{feature}/design/
├── database-schema.md (초안)
├── api-specification.md (초안)
├── data-flow.md (초안)
└── architecture.md (초안)

각 파일에는 기본 구조와 작성 가이드가 포함됩니다.
```

---

### Phase 4: 설계 문서 카테고리

브레인스토밍 시 고려할 일반적인 design/ 문서 유형:

#### 시스템 구조
- `architecture.md` - 전체 시스템 구조
- `component-diagram.md` - 컴포넌트 관계
- `layer-design.md` - 레이어 아키텍처

#### 데이터 설계
- `database-schema.md` - DB 테이블, 관계
- `data-model.md` - 도메인 모델
- `migration-strategy.md` - 마이그레이션 계획

#### 인터페이스 설계
- `api-specification.md` - REST API
- `websocket-protocol.md` - WebSocket 메시지
- `event-schema.md` - 이벤트 구조

#### 흐름 설계
- `data-flow.md` - 데이터 흐름
- `user-flow.md` - 사용자 시나리오
- `sequence-diagram.md` - 시퀀스 다이어그램

#### 결정 사항
- `decision-log.md` - 설계 결정 및 근거
- `tradeoff-analysis.md` - 트레이드오프 분석
- `configuration.md` - 설정 전략

---

### Phase 5: 브레인스토밍 원칙

순수 브레인스토밍 (코드 분석 없음):

#### 고려 사항

1. **기능 특성**
   - CRUD 중심? → DB 스키마, API 설계 중심
   - 실시간 처리? → 데이터 흐름, 이벤트 설계
   - 복잡한 비즈니스 로직? → 아키텍처, 결정 로그

2. **시스템 규모**
   - 소규모 기능: 2-3개 문서
   - 중규모 기능: 4-6개 문서
   - 대규모 시스템: 7개 이상

3. **팀 협업**
   - API 설계: 프론트엔드와 공유
   - DB 스키마: DBA 리뷰 필요
   - 아키텍처: 전체 팀 검토

4. **유지보수성**
   - 자주 변경되는 부분: 간결하게
   - 핵심 설계: 상세하게
   - 일시적 결정: decision-log에

---

### Phase 6: 문서 생성 연결

제안 후 /docs-execute로 연결:

```
제안된 설계 문서:
1. database-schema.md
2. api-specification.md
3. data-flow.md
4. architecture.md

---

question: "이 설계 문서들을 작성하시겠습니까?"

1. 모두 작성 (1, 2, 3, 4)
2. 일부만 선택 (번호 입력)
3. 나중에

→ 선택 시 각 문서별로 /docs-execute 호출:
   /docs-execute "database-schema for {기능}"
   /docs-execute "api-specification for {기능}"
   ...
```

---

## 출력 형식

### 레벨 1 출력 (가벼운 제안)

```
"{기능명}" Design 문서 브레인스토밍

필요한 문서 (4개):
1. database-schema.md
2. api-specification.md
3. data-flow.md
4. architecture.md

예상 작업량: 6-8시간
```

### 레벨 2 출력 (목차 포함)

```
"{기능명}" Design 문서 브레인스토밍

1. database-schema.md
   - 개요
   - 테이블 설계
   - 관계 설계
   - 인덱스 전략
   
2. api-specification.md
   - 개요
   - Endpoints
   - 스키마
   - 에러 처리

...
```

### 레벨 3 출력 (초안 생성)

```
다음 파일 생성 완료:

docs/21-{feature}/design/
├── database-schema.md
├── api-specification.md
├── data-flow.md
└── architecture.md

각 파일은 기본 구조가 포함되어 있습니다.
index.md에 링크가 추가되었습니다.
```

---

## 사용 예시

### 예시 1: 새 기능 설계
```
/docs-brainstorm-design "화자 등록 및 인식 시스템"
```
→ 기능 분석 → 필요 문서 제안 → 작성 선택

### 예시 2: 기존 feature 보완
```
/docs-brainstorm-design 08
```
→ docs/08-xxx/ 확인 → 부족한 문서 제안

### 예시 3: 코드 영역 기반
```
/docs-brainstorm-design src/meeting/search/
```
→ 검색 기능 파악 → 설계 문서 제안

---

## 주의사항

1. **순수 브레인스토밍**: 코드 분석하지 않음 (추측/제안만)
2. **추상화 유지**: design/ 문서는 구현 독립적
3. **필요한 것만**: 과도한 문서화 방지
4. **팀 협업 고려**: 공유/리뷰 필요한 문서 우선
5. **유지보수성**: 자주 변경되는 부분은 간결하게
