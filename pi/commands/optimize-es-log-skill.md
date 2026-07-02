---
name: optimize-es-log-skill
description: >
  shopl-backend-log-query 스킬로 실제 운영 로그 조회 질의를 수행한 세션에서,
  발생한 마찰과 빈 곳을 수확해 스킬 최적화안을 도출한다. 기본은 보고만.
  인자로 apply 전달 시 승인된 안을 직접 반영하고 커밋·푸시.
  Trigger: ES 로그 스킬 최적화, 운영 질의 결과로 스킬 점검, skill 개선 가이드.
argument-hint: "[report|apply]"
---

# ES 로그 스킬 최적화 가이드

이 세션에서 `shopl-backend-log-query` 스킬을 써 실제 운영 로그 조회 질의를 수행했다.
그 과정에서 드러난 스킬의 빈 곳·틀린 곳·비효율을 수확해 최적화안을 도출한다.

## 스킬 위치 (canonical)
- `shopl-skills/shopl-backend-log-query/SKILL.md` — 필드 카탈로그, Recipe 1~10, ES 한계, 부하 가드
- `shopl-skills/shopl-backend-log-query/domain-catalog.md` — service_type → 도메인 → message_type 카탈로그
- `shopl-skills/shopl-backend-log-query/es-query.sh` — 조회 래퍼 (range 가드, _source 자동삽입, aggregation, size cap)

> 심링크: `~/.pi/agent/skills/shopl-backend-log-query` → 위 경로. 실제 작업/커밋은 위 경로에서.

## 단계

### 1. 이번 세션 질의 재생
이 세션에서 시도한 ES 로그 조회 질의를 전부 나열. 각각:
- 사용자 원문 질의
- 시도한 쿼리(Query DSL 또는 es-query.sh 호출)
- 결과 — 성공 / 실패 / 정제 후 성공 / 사용자 정정 필요했음

> 컨텍스트가 compaction 등으로 유실됐으면, 사용자에게 핵심 질의를 몇 개 붙여달라고 요청할 것.

### 2. 마찰 분류
각 질의를 아래 카테고리로 분류. 해당 없으면 스킵.

- **COVERAGE** — 카탈로그에 없는 도메인/message_type/필드가 필요했음. 사용자가 말한 개념이 스킬에 매핑 안 됨
- **INCORRECT** — 스킬 가이드가 실제와 달랐음 (예: rId 안 된다고 했는데 됨, 필드명 틀림, service_type 매핑 틀림)
- **INEFFICIENT** — 쿼리는 됐지만 느리거나 중복. 더 나은 패턴 존재 (집계 먼저, _source 더 좁게 등)
- **TOOL-FRICTION** — es-query.sh 가드/출력/포맷이 방해. range 가드 너무 엄격, aggregation 안 보임, size cap 막힘, JSON 에러 불친절
- **NL-MAPPING** — 사용자 자연어(“근태 마감”,“권한”,“소속 이동”)가 service_type/message_type으로 안 이어짐. 빠른 선택 표 부족
- **MISSING-CONTEXT** — env/기간/service_type을 에이전트가 잘못 가정했거나, 사용자에게 너무 많이 물어봄
- **ES-LIMIT** — ES로는 안 되는 질의를 ES에서 파려 함 (“값/복구/현재상태”). 한계 섹션 매핑 부족

### 3. 현재 스킬과 대조
스킬 파일 3개를 읽고, 각 마찴을 **정확한 파일·섹션**에 매핑:
- 빠진 message_type/필드 → `domain-catalog.md` 해당 service_type 섹션
- 빠진/틀린 Recipe → `SKILL.md` Recipe N
- 래퍼 문제 → `es-query.sh` 해당 가드/포맷
- 자연어 매핑 부족 → `domain-catalog.md` "빠른 선택" 표 또는 `SKILL.md` Trigger

### 4. 최적화안 도출 (파일 그룹, 우선순위)
마찴을 파일별로 묶고, 우선순위(높음/중간/낮음) 부여. 각 안에는:
- **증거**: 이번 세션의 구체적 질의/결과 (원문 인용)
- **현재 상태**: 스킬이 지금 어떻게 되어 있는지
- **제안 변경**: 파일·섹션·추가/수정 내용 (실제 문장/Query DSL 수준)
- **근거**: 왜 이게 실제 운영 질의를 더 잘 푸는지

## 출력 형식

```
## 최적화 보고

### 세션 질의 요약
- (N건, 성공 X건, 정제 성공 Y건, 실패 Z건)

### 마찴 분포
- COVERAGE: N, INCORRECT: N, INEFFICIENT: N, ...

### 파일별 최적화안 (우선순위순)

#### domain-catalog.md
[높음] ...
  - 증거: "사용자 질의 원문" → 결과
  - 현재: (비고)
  - 제안: (구체적 추가/수정)

#### SKILL.md
...

#### es-query.sh
...

### 반영 순서 제안
1. ...
```

## 모드
- 인자 없음 / `report` (기본): 보고만. 파일 수정 금지.
- `apply`: 보고 후, 승인된 안을 실제 파일에 반영하고 커밋·푸시.
  - shopl-skills/ 만 커밋 (다른 워킹트리 변경은 남김)
  - 커밋 메시지: `refactor(skill): <요약>`

## 주의
- 추측 금지. "이번 세션에서 관측된" 마찰만. 일반론 불가.
- Recipe/필드를 새로 제안할 때는, 가능하면 **실제 ES에 한 번 더 쿼리해 검증**한 뒤 안에 포함 (이전 rId 체인 사례처럼).
- 한 번에 전부 반영하려 하지 말고, 보고 → 승인 → 반영 단계 분리.
