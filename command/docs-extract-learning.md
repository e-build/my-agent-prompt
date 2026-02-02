---
description: Extract general concepts from code/docs and generate learning/ documentation
agent: doc-manager
---

# 개념 추출 및 Learning 문서 생성

기존 코드와 문서에서 범용 기술/개념을 추출하여 learning/ 문서로 정리합니다.

**입력**: $ARGUMENTS (파일 경로, 디렉토리, 또는 주제)

---

## 문서화 규칙 참조

@~/.config/opencode/refs/docs-rules.md

---

## 실행 절차

### Phase 1: 범위 결정

입력에 따라 분석 범위 결정:

**Case A - 파일/디렉토리 지정**
```
/docs-extract-learning src/search/HybridSearchService.kt
/docs-extract-learning docs/02-context-search/design/
```
→ 해당 경로만 분석

**Case B - 주제 지정 (자연어)**
```
/docs-extract-learning "검색 기능"
/docs-extract-learning "AI 에이전트"
```
→ 관련 코드/문서 탐색

**Case C - 인자 없음**
```
/docs-extract-learning
```
→ question 도구로 범위 확인:
- 전체 프로젝트 스캔할까요?
- 특정 영역을 지정하시겠습니까?

**범위가 모호한 경우**: question 도구로 점진적 범위 좁히기
```
Q: "어느 영역을 분석할까요?"
   1. src/search/ (검색 기능)
   2. src/agent/ (AI 에이전트)
   3. 전체 프로젝트
   
Q: "src/search/ 중 구체적인 부분은?"
   1. HybridSearchService.kt
   2. embedding 관련 전체
   3. 검색 전체
```

---

### Phase 2: 개념 추출

다음 대상에서 범용 개념 탐색:

#### 1. 코드 분석 (src/)
- 사용된 알고리즘 (예: RRF, BM25)
- 외부 라이브러리/프레임워크 (예: pgvector, MLX)
- 디자인 패턴 (예: Strategy, Factory)
- 데이터 구조 (예: HNSW, IVFFlat)

#### 2. 기존 design/ 문서
- design/ 안에 섞여있는 이론/개념
- "우리 시스템" 결정과 분리 가능한 범용 지식
- 예: "우리는 RRF를 쓴다" → RRF 알고리즘 자체는 learning/

#### 3. 기존 learning/ 문서
- 중복 체크
- 부족한 부분 보완 제안

#### 추출 기준
| 포함 | 제외 |
|------|------|
| 범용 알고리즘/이론 | 프로젝트 특화 설정값 |
| 기술 비교/분석 | 우리 시스템 아키텍처 |
| 외부 라이브러리 개념 | 비즈니스 로직 |
| 디자인 패턴 | 구현 코드 |

---

### Phase 3: 사용자 확인

발견된 개념 나열 후 question 도구로 확인:

```
발견된 범용 개념:

1. RRF (Reciprocal Rank Fusion)
   - 위치: src/search/HybridSearchService.kt:45
   - 현황: learning/ 문서 없음
   - 제안: docs/02-context-search/learning/reciprocal-rank-fusion.md

2. IVFFlat 인덱스
   - 위치: docs/02-context-search/design/database-schema.md
   - 현황: design/에 이론 설명 섞여있음
   - 제안: learning/으로 분리

3. BGE-M3 임베딩 모델
   - 위치: src/embedding/EmbeddingService.kt:12
   - 현황: learning/ 문서 있음 (local-embedding-on-m1-mac.md)
   - 제안: 보완 필요 (모델 비교 부족)

---

question: "어떤 개념을 정리하시겠습니까?"
1. 모두 정리 (1, 2, 3)
2. 특정 개념만 (번호 선택)
3. 취소
```

---

### Phase 4: Learning 문서 생성

확인된 개념에 대해 learning/ 문서 생성:

#### 생성 프로세스

1. **Feature 결정**
   - 적절한 feature 디렉토리 선택/생성
   - 예: `docs/02-context-search/learning/`

2. **파일명 결정**
   - 소문자, 하이픈 구분
   - 예: `reciprocal-rank-fusion.md`

3. **문서 작성**
   ```markdown
   # {개념명}
   
   ## 목차
   - [개요](#개요)
   - [작동 원리](#작동-원리)
   - [장단점](#장단점)
   - [참고 자료](#참고-자료)
   
   ---
   
   ## 개요
   {개념 설명}
   
   ## 작동 원리
   {알고리즘/메커니즘 설명}
   
   ## 장단점
   | 장점 | 단점 |
   |------|------|
   
   ## 참고 자료
   > 출처: [문서명](URL)
   ```

4. **출처 수집**
   - 공식 문서 탐색 (librarian 활용)
   - 논문, 신뢰할 수 있는 기술 블로그
   - 코드 주석/문서

5. **index.md 업데이트**
   - 새 문서 링크 추가

---

### Phase 5: Design 문서 정리 (필요시)

design/ 문서에서 이론 부분 제거한 경우:

```markdown
// Before (design/database-schema.md):
## IVFFlat 인덱스
IVFFlat은 벡터 검색을 위한 인덱싱 방법으로...
(이론 설명 3단락)

우리 시스템에서는 lists=100으로 설정...

// After:
## 벡터 인덱스
> 상세: [IVFFlat 인덱스](../learning/ivfflat-indexing.md)

우리 시스템에서는 lists=100으로 설정...
```

---

## 출력 형식

### 생성된 문서

```
생성된 learning/ 문서:

1. docs/02-context-search/learning/reciprocal-rank-fusion.md
   - RRF 알고리즘 이론
   - 하이브리드 검색에서의 활용
   - 출처: 3개 논문/문서

2. docs/02-context-search/learning/ivfflat-indexing.md
   - IVFFlat 인덱스 개념
   - HNSW와 비교
   - 출처: pgvector 공식 문서
```

### 수정된 문서

```
수정된 design/ 문서:

1. docs/02-context-search/design/database-schema.md
   - IVFFlat 이론 부분 제거
   - learning/ 문서로 링크 추가
```

### 업데이트된 index.md

```
docs/02-context-search/index.md:
- learning 섹션에 2개 문서 추가
```

---

## 사용 예시

### 예시 1: 특정 파일 분석
```
/docs-extract-learning src/search/HybridSearchService.kt
```
→ HybridSearch 관련 RRF, BM25 개념 추출

### 예시 2: 주제로 탐색
```
/docs-extract-learning "벡터 검색"
```
→ 벡터 검색 관련 코드/문서 탐색 → 개념 추출

### 예시 3: 전체 스캔
```
/docs-extract-learning
```
→ question으로 범위 확인 → 전체 분석

---

## 주의사항

1. **중복 방지**: 기존 learning/ 문서 확인 후 생성
2. **출처 필수**: 모든 개념에 신뢰할 수 있는 출처 포함
3. **범용성 유지**: 프로젝트 특화 내용 제외
4. **적절한 깊이**: 너무 얕지도, 깊지도 않게
