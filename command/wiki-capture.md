---
description: 현재 대화나 작업에서 지식을 추출해 wiki에 저장한다
---

# Wiki Capture

현재 세션에서 발생한 결정, 발견, 수정, 예외 케이스를 wiki에 자동으로 포착해 저장한다.
**인간이 따로 정리하지 않아도** 대화 흐름에서 가치 있는 지식을 추출하는 것이 목적이다.

## Config 로드

`~/.config/opencode/wiki-config.json` 을 읽어 `wiki_root` 경로를 가져온다.
파일이 없으면 중단하고 안내한다:

```
wiki-config.json 이 없습니다. 먼저 /wiki-setup 을 실행해 wiki를 초기화하세요.
```

이후 모든 경로는 `{wiki_root}` 변수를 기반으로 구성한다.

**Wiki 경로**: `{wiki_root}` (wiki-config.json에서 읽음)

## 사용법

```
/wiki-capture
/wiki-capture $HINT
```

- 인자 없이 실행: 현재 대화 전체를 분석해 포착할 지식을 자동 판단
- `$HINT`: 포착 방향 힌트 (예: "방금 결정한 DB 스키마", "해결된 빌드 오류")

---

## 워크플로우

### 0. Config 및 Schema 확인

`~/.config/opencode/wiki-config.json` 에서 `wiki_root` 를 읽는다.
`{wiki_root}/AGENTS.md` 를 읽어 위키 구조와 규칙을 확인한다.

### 1. 대화 분석 — 포착 대상 식별

현재 세션 전체를 돌아보며 아래 신호를 탐지한다:

#### 포착 우선순위 (높음 → 낮음)

| 신호 | 예시 | 포착 type |
|------|------|-----------|
| **결정 + 이유** | "A 대신 B를 쓰기로 했다, 왜냐면..." | `decision` |
| **수정/정정** | "처음엔 X라고 했는데 틀렸고 실제론 Y" | `concept` 업데이트 |
| **예외 케이스** | "보통은 이렇지만, 이 경우엔 다르다" | `concept` (edge case 섹션) |
| **실패한 시도** | "이 방법은 안 됐다, 이유는..." | `decision` 또는 `concept` |
| **발견한 사실** | 새로 알게 된 시스템 동작, API 특성 등 | `concept` 또는 `entity` |
| **해결된 문제** | 버그 원인 + 해결책 | `concept` |
| 단순 Q&A | 질문하고 답을 얻은 것 | 낮은 우선순위, 반복 가능성 있을 때만 |

#### 포착하지 않는 것

- 일회성 단순 작업 (파일 열기, 실행 결과 확인 등)
- 이미 위키에 있는 내용과 동일한 내용
- 불확실하거나 추측성인 내용 (단, 불확실성 자체를 기록할 수 있음)

### 2. 포착 목록 초안 작성

탐지된 항목을 사용자에게 먼저 보여준다:

```
## 포착 예정 항목

1. [decision] DB 인덱스 전략 — B-tree 대신 GIN 선택 (이유: JSONB 쿼리 성능)
2. [concept] Redis TTL 동작 — 키 만료 시 keyspace notification 발생 조건
3. [concept/edge-case] 페이지네이션 예외 — total_count가 -1인 경우 처리

포착할까요? (전부/번호 선택/취소)
```

사용자 확인 후 진행한다. "전부" 또는 응답 없이 계속 진행하면 전체 저장.

### 3. 기존 위키 확인

각 포착 항목에 대해:
- `{wiki_root}/wiki/index.md`에서 관련 페이지 탐색
- 관련 concept/entity 페이지가 있으면 읽어서 중복·모순 여부 확인
- **수정이 필요한 경우**: 기존 페이지 업데이트 (신규 생성보다 우선)
- **새 내용인 경우**: 신규 페이지 생성

### 4. 저장 — Decision

결정 사항은 `{wiki_root}/wiki/decisions/YYYY-MM-DD-slug.md` 로 저장:

```markdown
---
type: decision
title: "결정 제목"
aliases: []
sources: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
status: active
superseded_by: null
---

# 결정 제목

**결정일**: YYYY-MM-DD
**맥락**: (어떤 상황에서 이 결정이 필요했는가)

## 결정 내용

(무엇을 선택했는가)

## 이유

(왜 이것을 선택했는가 — 가장 중요한 부분)

## 고려했던 대안

- **대안 A**: (왜 선택하지 않았는가)
- **대안 B**: (왜 선택하지 않았는가)

## 실패한 시도

(이 결정에 도달하기까지 시도했다가 안 됐던 것들)

## 유효 조건

(이 결정이 언제까지, 어떤 조건에서 유효한가)

## 메모

(추가 맥락, 재검토 트리거 등)
```

### 5. 저장 — Concept 업데이트 또는 신규

기존 concept 페이지가 있으면 아래를 추가/수정:

```markdown
## Edge Cases  ← 예외 케이스 전용 섹션

- **상황**: (어떤 조건에서 예외가 발생하는가)
  **동작**: (예외 상황에서 실제로 어떻게 되는가)
  **출처**: [[wiki/summaries/xxx]] 또는 (세션 날짜)

## 주의 사항 / 알려진 함정

- (실패했던 시도, 흔한 오해 등)
```

신규 concept이면 `{wiki_root}/wiki/concepts/slug.md` 생성 (wiki-ingest의 concept 템플릿 준수).

### 6. Provenance 표시

저장하는 모든 항목에 출처를 명시한다:

- **소스 파일이 있는 경우**: `sources:` 프론트매터에 추가
- **대화에서 발생한 경우**: `sources: ["session/YYYY-MM-DD"]` 로 기록
- **사용자 직접 확인 내용**: `sources: ["direct/YYYY-MM-DD"]` 로 기록

출처 신뢰도를 구분한다:
- `source-of-truth`: 공식 문서, 코드, 사용자 직접 확인
- `heuristic`: 경험적 발견, 관찰된 동작 패턴

프론트매터에 `confidence: source-of-truth | heuristic | uncertain` 을 추가한다.

### 7. index.md 업데이트

신규 생성된 페이지를 `{wiki_root}/wiki/index.md` 해당 섹션 테이블에 추가한다.

### 8. log.md append

```
## [YYYY-MM-DD] capture | 세션 요약 한 줄

- 결정: wiki/decisions/xxx.md (신규)
- 개념 업데이트: wiki/concepts/yyy.md (edge case 추가)
- 개념 신규: wiki/concepts/zzz.md
- 포착 근거: (세션에서 어떤 맥락으로 발생했는가)
```

### 9. Git commit (config의 git: true인 경우)

```bash
cd {wiki_root}
git add -A
git commit -m "capture: YYYY-MM-DD 세션 — 포착 항목 요약"
```

---

## 완료 보고

```
## Capture 완료

**세션 날짜**: YYYY-MM-DD
**포착 항목**: N개

### 저장된 내용
- [신규] wiki/decisions/xxx.md — 결정 제목
- [업데이트] wiki/concepts/yyy.md — edge case 추가
- [신규] wiki/concepts/zzz.md — 개념명

### 위키에 없어서 포착하지 못한 것
(관련 entity/concept이 없어서 저장을 보류한 것이 있다면 명시)

### 다음에 확인 필요
(불확실해서 confident하게 저장하지 못한 항목)
```
