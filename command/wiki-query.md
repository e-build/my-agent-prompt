---
description: jimmy-working wiki에서 질문에 답하고 관련 지식을 합성한다
---

# Wiki Query

jimmy-working wiki를 검색하고 질문에 답하는 워크플로우를 실행한다.

**Wiki 경로**: `/Users/donggeollee/Obsidian/jimmy-working`

## 사용법

```
/wiki-query $QUESTION
```

- `$QUESTION`: 답을 찾고 싶은 질문 (생략 시 대화에서 질문을 파악)

---

## 워크플로우

### 0. Schema 확인

`/Users/donggeollee/Obsidian/jimmy-working/AGENTS.md` 를 읽어 위키 구조를 파악한다.

### 1. 질문 분석

질문에서 핵심 키워드와 관련 가능한 type(entity/concept/project/decision)을 파악한다.

### 2. index.md 탐색

`wiki/index.md` 를 읽어 관련 있어 보이는 페이지 목록을 추린다.

### 3. qmd 검색 (BM25 + 벡터 하이브리드)

qmd MCP를 사용해 wiki/ 디렉토리에서 키워드 검색을 수행한다:

```
qmd_search: 질문의 핵심 키워드
qmd_vector_search: 질문의 의미 기반 검색
```

index.md 탐색과 qmd 결과를 합쳐 가장 관련성 높은 페이지 목록을 만든다.

### 4. 관련 페이지 읽기

후보 페이지들을 읽는다. 페이지 내 `related:` 프론트매터와 `[[링크]]`를 따라 추가 페이지도 읽는다.
최대 10~15개 페이지까지 읽는다. 그 이상이면 가장 관련성 높은 것만 선택.

### 5. 소스 검증 (필요 시)

위키 페이지의 주장에 의문이 있거나 더 깊은 맥락이 필요하면, `sources:` 프론트매터를 참조해 원본 소스 파일을 읽는다.

### 6. 답변 합성

읽은 내용을 바탕으로 답변을 작성한다:
- 각 주장마다 출처 위키 페이지 명시
- 불확실한 정보는 명시적으로 표시
- 서로 상충되는 정보가 있으면 양쪽 모두 제시

### 7. 새 인사이트 저장 (선택적)

답변 과정에서 위키에 없는 유의미한 합성 인사이트가 나왔다면:
- 새 concept 또는 summary 페이지로 저장
- index.md 업데이트
- log.md append (`## [YYYY-MM-DD] query | 질문 요약`)

---

## 답변 형식

```markdown
## 답변

(합성한 답변 내용)

## 근거

- [[wiki/concepts/xxx]] — 인용한 내용
- [[wiki/projects/yyy]] — 인용한 내용

## 불확실한 부분

(위키에 정보가 없거나 상충되는 부분)

## 관련 페이지

- [[wiki/xxx]] — 추가로 읽어볼 만한 페이지
```
