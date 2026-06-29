---
description: 일반 지식 위키에 소스 ingest — 원본 보존 + 소스페이지 + 개념/엔티티 통합
argument-hint: "<SOURCE> [TOPIC]"
---
<!-- Args: $1 = SOURCE (raw/경로 | URL | -) · $2+ = TOPIC/보조 -->
# 일반 지식 Wiki — ingest

당신은 사용자의 **범용 LLM Wiki**에 소스를 ingest하는 에이전트다.

## 위키 경로
```
WIKI="${LLM_WIKI_GENERAL_HOME:-$HOME/LLM-Wiki/general}"
```

## 3계층 (절대 원칙)
1. **raw/** — 불변 원본. 읽기 전용. 진실의 원천.
2. **wiki/** — 당신이 온전히 소유하는 LLM 생성 마크다운.
3. schema — 각 명령 본문 (재주입, 드리프트 없음).

## SOURCE 형태
- **raw/ 경로** — 그대로 읽는다.
- **URL** — fetch 후 `$WIKI/raw/{slug}.{ext}` 저장 (불변 원본화). slug = 제목 kebab-case.
- **`-`** — 대화에 붙여넣은 텍스트. `$WIKI/raw/{slug}.md` 저장 후 처리.

## ingest 흐름 (한 소스는 보통 10~15개 페이지 건드림)
1. **읽기 + 토론** — 원본 읽고 핵심 3~5줄 요약 → 사용자와 강조점·TOPIC 확인.
2. **소스 페이지** → `wiki/sources/{slug}.md`: 메타(제목·저자·날짜·원본경로), 핵심 요약, 주요 발견, 인용 구절, 연관 `[[wiki/페이지]]`.
3. **엔티티/개념 통합** — 등장 인물·조직·개념마다 `wiki/entities|concepts/{slug}.md` 생성/갱신. 새 정보 추가, 기존과 충돌 시 명시, 역링크 유지.
4. **주제 종합** — TOPIC 또는 자연스러운 주제 → `wiki/topics/` 개요 페이지 갱신/생성.
5. **index.md 갱신** — 새/갱신 페이지를 해당 카테고리에 반영.
6. **log.md append** — 형식:
   ```
   ## [오늘] ingest | <소스명>
   - raw/xxx → wiki/sources/xxx.md
   - 갱신: [[wiki/concepts/xxx]]; 신규: [[wiki/concepts/yyy]]
   ```

## 페이지 규칙
- 마크다운. `[[wiki/slug]]` 위키링크 (slug = `sources/xxx`, 파일명 확장자 제외).
- YAML frontmatter: `updated`, `sources`, `tags`.
- 모든 인용은 `[[wiki/sources/xxx]]`로 연결.
- 새 사실이 기존 주장과 충돌하면 **충돌 명시** + log 기록.

## 실행 수칙
- raw/ 읽기 전용. 원본 보존 최우선.
- 종료 시 **index.md + log.md 반드시 갱신** (빠지면 위키 부식).
- 비결정적 판단(강조점·페이지 분리·충돌 해석)은 사용자 확인.
- 완료 후 변경/생성 파일 목록 한 줄씩 보고.
