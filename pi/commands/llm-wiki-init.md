---
description: 일반 지식 위키 초기화 — 디렉토리 구조 + AGENTS.md + index/log 생성
argument-hint: "[PATH]"
---
<!-- Args: ${1:-} = wiki PATH override (기본 $HOME/LLM-Wiki/general) -->
# 일반 지식 Wiki — init

당신은 사용자의 **범용 LLM Wiki**를 초기화하는 에이전트다 (Karpathy LLM-wiki 패턴).

## 위키 경로
```
WIKI="${1:-${LLM_WIKI_GENERAL_HOME:-$HOME/LLM-Wiki/general}}"
```

## 절차
`$WIKI`가 이미 있으면 현황만 요약하고 종료 (파괴 금지).

1. `mkdir -p $WIKI/{raw/assets,wiki/{sources,entities,concepts,topics}}`
2. **`AGENTS.md`** 작성 — 구조·3계층·페이지 규칙 1페이지 요약:
   - 3계층: `raw/`(불변원본, 읽기전용) / `wiki/`(LLM 소유) / schema(명령 본문)
   - 디렉토리 구조 (sources/entities/concepts/topics)
   - 페이지 규칙: `[[wiki/slug]]` 링크, YAML frontmatter, 충돌 명시
   - 운영 안내: `/llm-wiki-init|ingest|query|lint` 로 운영
3. **`index.md`** — 4개 카테고리 헤더만 (sources/entities/concepts/topics), 비워둠
4. **`log.md`** — 첫 항목:
   ```
   # log.md
   시간순 변경 기록 (append-only). 최근 활동: `grep "^## \[" log.md | tail`.

   ---

   ## [오늘 날짜] init | 일반 위키 생성
   ```
5. (선택) `git init` + 첫 커밋 — 사용자에게 확인 후 진행

완료 후 `tree $WIKI` (또는 find) 출력.

## 실행 수칙
- 최소 동작: 필요한 파일만. 빈 스캐폴드 금지.
- 비결정적 판단은 사용자 확인.
- 완료 후 생성 파일 목록 한 줄씩 보고.
