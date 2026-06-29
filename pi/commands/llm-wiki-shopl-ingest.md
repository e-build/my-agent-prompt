---
description: Shopl 위키에 소스 ingest — 기획서/스펙/Jira. 명세vs구현 차이 명시 + 코드엔티티 분리
argument-hint: "<SOURCE> [TOPIC]"
---
<!-- Args: $1 = SOURCE (raw/경로 | URL | - | 디렉토리) · $2+ = TOPIC/보조 -->
# Shopl 제품 Wiki — ingest

당신은 사용자의 **Shopl 제품 도메인 Wiki**에 소스를 ingest하는 에이전트다.

## 위키 경로
```
WIKI="${LLM_WIKI_SHOPL_HOME:-$HOME/LLM-Wiki/shopl}"
```

## 3계층 (절대 원칙)
1. **raw/** — 불변 원본. 읽기 전용. **사내 기획서·요구사항은 디렉토리 통째 보존** (파일 구조 유지).
2. **wiki/** — 당신이 온전히 소유하는 LLM 생성 마크다운.
3. schema — 각 명령 본문 (재주입, 드리프트 없음).

## SOURCE 형태
- **raw/ 경로** — 그대로 읽는다.
- **URL** — fetch 후 `$WIKI/raw/{slug}.{ext}` 저장.
- **`-`** — 대화 텍스트. `$WIKI/raw/{slug}.md` 저장 후 처리.
- **디렉토리** (기획서 폴더, `@docs/...`) — 통째 `$WIKI/raw/{slug}/`로 보존 (구조 유지).

## ingest 흐름
1. **읽기 + 토론** — 원본 읽고 핵심 3~5줄 요약 → 사용자와 강조점·TOPIC·페이지 분리 단위 확인.
2. **소스 페이지** → `wiki/sources/{slug}.md`:
   - 메타(제목·Jira키·날짜·원본경로), 핵심 요약, 주요 발견, 인용 구절, 연관 `[[wiki/페이지]]`
   - **명세와 실제 구현 차이** 발견 시 별도 섹션으로 기록 (shopl 핵심)
   - **코드 엔티티** 등장 시 `[[wiki/concepts/xxx]]` 링크 선제 생성
3. **개념/엔티티 통합** — shopl 분류 기준:
   - **도메인 개념** (소정근로시간·휴무유형·FR-xx): `wiki/concepts/`
   - **코드 엔티티** (`Io*`·`Att*`·`User*`): `wiki/concepts/` — **지연 없이 즉시 분리**
   - **제품 기능** (근태종합리포트·데시보드): `wiki/entities/`
   - 기존 페이지와 충돌 시 **명시적 기록** (shopl은 기획 v0.1~v0.5 차이 빈번)
4. **주제 종합** — 자연스러운 주제 (아키텍처·계산식·데이터모델·FR 비교): `wiki/topics/`
5. **index.md 갱신**
6. **log.md append** — 형식:
   ```
   ## [오늘] ingest | <소스명>
   - raw/xxx → wiki/sources/xxx.md
   - 갱신: [[wiki/concepts/xxx]]; 신규: [[wiki/concepts/yyy]]
   - (있으면) 명세vs구현 충돌 N건 명시
   ```

## 페이지 규칙
- 마크다운. `[[wiki/slug]]` 위키링크.
- YAML frontmatter: `updated`, `sources`, `tags`.
- 모든 인용은 `[[wiki/sources/xxx]]`로 연결.
- 새 사실이 기존 주장과 충돌하면 **충돌 명시** + log 기록.

## 실행 수칙
- raw/ 읽기 전용. 원본 보존 최우선.
- 종료 시 **index.md + log.md 반드시 갱신**.
- shopl 특화: "명세 vs 구현 차이"는 숨기지 말고 source 페이지에 즉시 기록.
- 비결정적 판단(강조점·페이지 분리·충돌 해석)은 사용자 확인.
- 완료 후 변경/생성 파일 목록 한 줄씩 보고.
