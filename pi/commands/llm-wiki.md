---
description: 중앙 LLM Wiki 유지보수 — init/ingest/query/lint. 원본은 읽기 전용, 위키는 LLM이 쓰고 갱신 (Karpathy LLM-wiki 패턴)
argument-hint: "[init|ingest SOURCE|query Q|lint] [PATH]"
---
<!-- Args: $1 = subcommand (init|ingest|query|lint, 기본 help) · $2 = ingest 대상(raw경로|URL|-) 또는 init의 PATH · $3+ = query 질문 / ingest 보조 -->
# 중앙 LLM Wiki 유지보수

당신은 사용자의 **중앙 LLM Wiki**를 유지보수하는 에이전트다. 철학은 Karpathy의 LLM-wiki 패턴:
원본은 RAG처럼 매번 재발견하지 않고, **한 번 컴파일해 위키로 누적하고 계속 갱신**한다.
위키는 복리 효과(compounding artifact)를 내는 자산 — 교차참조·모순표시·종합이 이미 들어있고,
소스를 추가할수록 풍성해진다. 사용자는 소싱·탐색·질문을 담당하고, 당신은 요약·교차참조·정리·북키핑을 전담한다.

## 허브 경로 해석
```
WIKI="${LLM_WIKI_HOME:-$HOME/LLM-Wiki}"
```
- 기본 `~/LLM-Wiki`. env `LLM_WIKI_HOME`로 덮어쓰기(Obsidian vault 경로 등).
- `init`만 `$2`로 다른 PATH를 받는다. 그 외 서브커맨드는 위 경로를 그대로 쓴다.
- 아래 본문의 `$WIKI`는 이 경로로 치환해 동작한다.

## 3계층 (절대 원칙)
1. **raw/** — 불변 원본. 당신은 **읽기만** 하고 절대 수정/삭제하지 않는다. 진실의 원천.
2. **wiki/** — 당신이 **온전히 소유**하는 LLM 생성 마크다운. 페이지를 만들고, 소스가 들어오면 갱신하고, 교차참조를 유지한다.
3. **schema** — 이 템플릿 본문. 호출마다 재주입되므로 별도 파일 복제 불필요(드리프트 없음).

## 디렉토리 구조
```
$WIKI/
├── README.md        # 구조·규칙 요약 (Obsidian 탐색용)
├── raw/             # 불변 원본
│   └── assets/      # 이미지
├── wiki/
│   ├── sources/     # 원본 1개당 요약 페이지 1개  (파일명: {slug}.md)
│   ├── entities/    # 인물·조직·제품·장소
│   ├── concepts/    # 개념·기법·이론
│   └── topics/      # 주제 종합·개요·비교
├── index.md         # 콘텐츠 카탈로그 (카테고리별, 매 ingest 갱신)
└── log.md           # 시간순 변경 기록 (append-only)
```

## 페이지 규칙
- 마크다운. Obsidian 호환 `[[페이지명]]` 위키링크(링크 대상 = 파일명 확장자 제외).
- 요약/개념 페이지 상단에 YAML frontmatter(선택): `updated: YYYY-MM-DD`, `sources: N`, `tags: [...]`.
- 모든 인용은 해당 소스 페이지(`[[sources/xxx]]`)로 연결.
- 새 사실이 기존 주장과 충돌하면 **충돌을 숨기지 말고 페이지에 명시**하고 log에 기록.

## index.md / log.md
- **index.md** — 카테고리(sources/entities/concepts/topics) 섹션별로 페이지 링크 + 한 줄 요약. query 시 가장 먼저 읽는 진입점. 매 ingest 갱신.
- **log.md** — append-only. 항목 형식(접두어 일치 → `grep "^## \[" log.md | tail` 로 최근 활동 파싱):
  ```
  ## [2026-06-24] ingest | Attention Is All You Need
  - raw/paper-attention.pdf → wiki/sources/attention-is-all-you-need.md
  - 갱신: [[concepts/transformer]], [[entities/google-brain]]; 신규: [[concepts/self-attention]]
  ```

---

## 서브커맨드 분기: `$1` (기본 `help`)

### `init [PATH]`
`$WIKI`(또는 `$2`)가 없으면 구조를 생성한다. 이미 있으면 현황만 요약하고 종료(파괴 금지).
1. `mkdir -p $WIKI/{raw/assets,wiki/{sources,entities,concepts,topics}}`
2. `README.md` — 구조·3계층·페이지 규칙 한 페이지 요약 + "/llm-wiki 로 운영" 안내.
3. `index.md` — 4개 카테고리 헤더만 만들고 비워둠.
4. `log.md` — 첫 항목: `## [오늘] init | 위키 생성`
5. (선택) `git init` + 첫 커밋. 사용자에게 확인.
완료 후 트리 출력.

### `ingest <SOURCE> [TOPIC]`  (`$2` = 대상)
SOURCE 형태:
- **raw/ 경로**(예: `raw/article.md`, `raw/paper.pdf`) — 그대로 읽는다.
- **URL** — fetch 후 `$WIKI/raw/{slug}.{ext}`로 저장(불변 원본화). 슬러그: 제목을 kebab-case.
- **`-`** — 사용자가 대화에 붙여넣은 텍스트. `$WIKI/raw/{slug}.md`로 저장 후 처리.

흐름(한 소스는 보통 10~15개 페이지를 건드린다):
1. **읽기 + 토론** — 원본을 읽고 핵심을 3~5줄로 요약해 사용자와 확인. 강조점·TOPIC 방향을 맞춘다.
2. **소스 페이지** — `wiki/sources/{slug}.md`: 메타(제목·저자·날짜·원본 경로), 핵심 요약, 주요 발견 불릿, 인용 가능한 구절, 연관 `[[페이지]]`.
3. **엔티티/개념 통합** — 등장하는 인물·조직·개념마다 `wiki/entities|concepts/{slug}.md`를 **만들거나 갱신**. 새 정보 추가, 기존과 충돌하면 명시, 역링크(`[[sources/xxx]]`에서 참조됨) 유지.
4. **주제 종합** — TOPIC 또는 자연스러운 주제가 있으면 `wiki/topics/` 개요 페이지 갱신/생성.
5. **index.md 갱신** — 새/갱신 페이지를 해당 카테고리에 반영.
6. **log.md 추가** — 위 형식으로 한 항목 append.

### `query "<Q>"`  (`$2`+ = 질문)
1. `index.md`를 먼저 읽어 관련 페이지를 특정 → 해당 페이지 읽기(필요시 원본 raw/로 내려감).
2. 인용(`[[페이지명]]`)과 함께 답을 합성. 형태는 질문에 맞게: 마크다운 / 비교표 / 개요.
3. **환원 루프** — 답이 새로운 비교·분석·연결을 만들었다면, 사용자에게 "이걸 `wiki/topics/` 페이지로 저장할까?" 제안. 승인 시 저장 + index/log 갱신. 탐색이 채팅 히스토리에 사라지지 않고 위키로 복리화된다.

### `lint`
위키 건강검진 보고서 생성:
- 페이지 간 **모순** / 최신 소스가 대체한 **스테일 주장**
- 인바운드 링크 없는 **고아 페이지**
- 언급만 되고 페이지가 없는 **핵심 개념**
- 빠진 **교차참조**
- 웹 검색으로 채울 수 있는 **데이터 갭**
- 추천 **다음 질문** + **탐색할 소스**
각 항목: 위치 + 한 줄 제안. 심각도순 정렬.

### (없음 / `help`)
사용법·구조·4 연산을 한 화면에 출력. `$WIKI` 경로와 페이지 수도 표시.

---

## 실행 수칙
- raw/ 는 읽기 전용. 원본 보존이 최우선.
- 모든 ingest/query 종료 시 **index.md + log.md를 반드시 갱신**. 빠지면 위키가 부식된다.
- 최소한의 동작: 디렉토리/파일은 필요할 때만 만든다. 빈 스캐폴드 금지.
- 비결정적 판단(강조점·페이지 분리·충돌 해석)은 사용자와 확인 후 진행.
- 완료 후: 변경/생성된 파일 목록을 한 줄씩 보고.
