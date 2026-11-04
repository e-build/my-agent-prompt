# study 내 교과서 3단계(HTML 렌더러와 /study-book) 구현 계획

> **Implement task-by-task with the test-driven-development skill.**
> 설계: [design](2026-11-03-study-my-textbook-design.md) · 2단계: [phase2](2026-11-03-study-my-textbook-phase2.md) · 브랜치 `feat/study-my-textbook`

**Goal:** `book/`의 md를 직접 구현한 파서로 정적 HTML 사이트(상대 경로·외부 요청 없음)로 빌드하고, `/study-book [개념]`으로 연다. book 변경마다 적용 전후를 비교하는 차이 페이지를 만든다.

**Architecture:** 순수 단계(`md-parse` → `md-html` → `site-build`)와 I/O(`site-write`, 명령)를 나눈다. 사이트는 `.study/local/book-site/`(PC 전용, 다시 생성 가능)에 쓴다. 변경 기록은 이미 파일 전후 내용을 담고 있으므로 차이 페이지는 기록에서 만든다.

## 사실 확인 (2026-11-03)

- mermaid 12.3.0: MIT, `dist/mermaid.min.js` 5,537,838 bytes
- headless Chrome에서 `file://` + CSP `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`로 flowchart·sequence 두 개가 SVG로 그려짐. **Mermaid가 inline style을 넣으므로 `style-src 'unsafe-inline'`이 필요**하다. 스크립트는 `'self'`만 허용한다.
- study md 실사용: `- ` 1055, `N. ` 155, 중첩 목록, 표 65, 제목 h1~h4, 인용 224줄, 체크박스, 내부 앵커 링크. 이미지·raw HTML은 사용하지 않음.

## 결정

- **raw HTML은 출력하지 않는다.** 원문에 HTML 태그가 있으면 글자 그대로 escape해 보여 준다. 관리 영역 주석(`<!-- study:… -->`)만 지운다.
- 링크: `http(s)`·`mailto`·상대 경로·`#앵커`만 링크로 만든다. 그 밖의 스킴(`javascript:` 등)은 글자로만 보여 준다. 상대 `.md` 링크는 사이트 안 페이지면 `.html`로, 사이트 밖(챕터 README 등)이면 보조 페이지(`_src/…`)로 바꾼다.
- 보조 페이지: book이 링크하는 챕터 README와, 그 README가 링크하는 같은 챕터 안 md까지만 렌더링한다(1단계 깊이). `.study/`·`review/` 아래 파일은 렌더링하지 않는다.
- 제목에는 GitHub 방식 앵커(소문자, 공백→`-`, 문장부호 제거, 한글 유지)를 단다. 기존 README 목차 링크가 그대로 동작하게 하기 위해서다.
- 문법 강조는 java·kotlin·sql·json·sh·ts·js에 대해 키워드·문자열·주석·숫자 4종만 칠한다.
- 사이트 위치 `.study/local/book-site/`. 빌드는 매번 전체를 다시 쓴다(수백 쪽 규모라 충분히 빠름).
- 차이 페이지: `.study/local/book-site/_changes/<changeId>.html`. 줄 단위 LCS diff. 대시보드 "최근 교과서 변경"의 changeId가 이 페이지로 링크된다.

## Task
1. `md-parse.ts` — 블록(제목·문단·목록 중첩·순서·체크박스·인용·코드 펜스 ``` ~~~·표 정렬·수평선·frontmatter 제거·관리 주석 제거)과 인라인(코드·굵게·기울임·취소선·링크·자동 링크·escape)
2. `md-html.ts` + `highlight.ts` — AST → HTML, 앵커, mermaid `<pre class="mermaid">`, 링크 재작성 훅
3. `site-build.ts` — 페이지 목록·링크 재작성·보조 페이지 수집·왼쪽 트리·상단 경로·검색 색인(JSON)·레이아웃
4. `assets/book/`(style.css, book.js, vendor/mermaid.min.js + LICENSE) + `site-write.ts`(쓰기, PC 전용)
5. 차이 페이지(`book-diff.ts`) + 대시보드 링크
6. `/study-book [개념]` 명령(자동완성) + 열기(loopback 정적 서빙 또는 file://) + book 변경 후 자동 재빌드
7. 실제 study 루트로 빌드하고 headless Chrome으로 확인, 문서
