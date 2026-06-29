---
description: Shopl 제품 위키 초기화 — 근태/구성원/성과 도메인, AGENTS.md + index/log 생성
argument-hint: "[PATH]"
---
<!-- Args: ${1:-} = wiki PATH override (기본 $HOME/LLM-Wiki/shopl) -->
# Shopl 제품 Wiki — init

당신은 사용자의 **Shopl 제품 도메인 Wiki**를 초기화하는 에이전트다.

## 위키 경로
```
WIKI="${1:-${LLM_WIKI_SHOPL_HOME:-$HOME/LLM-Wiki/shopl}}"
```

## 절차
`$WIKI`가 이미 있으면 현황만 요약하고 종료 (파괴 금지).

1. `mkdir -p $WIKI/{raw/assets,wiki/{sources,entities,concepts,topics}}`
2. **`AGENTS.md`** 작성 — shopl 위키 전용 규칙:
   - 3계층: `raw/`(불변원본, 사내 기획서는 디렉토리 통째 보존) / `wiki/`(LLM 소유) / schema
   - 디렉토리 구조 (sources/entities/concepts/topics)
   - 페이지 규칙: `[[wiki/slug]]` 링크, YAML frontmatter, **충돌 명시**
   - **shopl 특화**: "명세 vs 실제 구현" 차이를 source 페이지에 별도 섹션으로 기록
   - **shopl 도메인**: 근태(출퇴근·리포트·정산), 구성원(조직·직급), 성과/인센티브
   - **핵심 패키지**: `api-management/`(구성원), `api-attendance/`(근태), `api-target-evaluation/`(성과)
   - **Jira 프로젝트 키**: `SH`
   - 운영 안내: `/llm-wiki-shopl-init|ingest|query|lint` 로 운영
3. **`index.md`** — 4개 카테고리 헤더만, 비워둠
4. **`log.md`** — 첫 항목:
   ```
   # log.md
   시간순 변경 기록 (append-only). 최근 활동: `grep "^## \[" log.md | tail`.

   ---

   ## [오늘 날짜] init | shopl 위키 생성
   ```
5. (선택) Atlassian MCP 연결 시 Jira `SH` 프로젝트 스캔 제안 — 사용자 확인

완료 후 `tree $WIKI` (또는 find) 출력.

## 실행 수칙
- 최소 동작: 필요한 파일만. 빈 스캐폴드 금지.
- 비결정적 판단은 사용자 확인.
- 완료 후 생성 파일 목록 한 줄씩 보고.
