---
description: jimmy-working wiki에 새 소스를 추가하고 관련 위키 페이지를 생성/업데이트한다
---

# Wiki Ingest

새 소스를 jimmy-working wiki에 추가하는 워크플로우를 실행한다.

**Wiki 경로**: `/Users/donggeollee/Obsidian/jimmy-working`

## 사용법

```
/wiki-ingest $SOURCE_PATH
```

- `$SOURCE_PATH`: 추가할 소스 파일 경로 (이미 `sources/` 에 넣은 파일이거나, 경로를 알려주면 복사 후 처리)
- 인자 없이 실행하면 최근에 추가된 소스 파일을 자동으로 찾는다.

---

## 워크플로우

아래 단계를 순서대로 실행한다.

### 0. Schema 확인

`/Users/donggeollee/Obsidian/jimmy-working/AGENTS.md` 를 읽어 위키 구조와 규칙을 확인한다.

### 1. 소스 위치 확인

- `$SOURCE_PATH` 가 주어진 경우: 해당 파일을 읽는다.
- `sources/` 하위에 없는 경우: 적절한 하위 디렉토리(`web/`, `memos/`, `work/`)를 판단해 복사한다.
  - 웹 기사/블로그 → `sources/web/YYYY-MM-DD-slug.md`
  - 직접 메모/회의록 → `sources/memos/YYYY-MM-DD-slug.md`
  - Slack/Jira/Confluence 추출 → `sources/work/YYYY-MM-DD-slug.md`

### 2. 소스 전체 읽기 및 분석

소스를 전체 읽고 아래를 파악한다:
- **핵심 주제**: 무엇에 관한 내용인가?
- **언급된 entity**: 사람, 팀, 시스템, 서비스, 도구 이름
- **다루는 concept**: 기술 개념, 패턴, 방법론, 용어
- **관련 project/decision**: 현재 위키에 있는 프로젝트나 결정과 연결되는가?
- **모순 가능성**: 기존 위키 내용과 상충되는 정보가 있는가?

### 3. 요약 페이지 생성

`wiki/summaries/YYYY-MM-DD-slug.md` 를 생성한다:

```markdown
---
type: summary
title: "소스 제목"
aliases: []
sources: ["sources/xxx/파일명.md"]
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
status: active
---

# 소스 제목

**출처**: [[sources/xxx/파일명.md]]
**날짜**: YYYY-MM-DD

## 핵심 요약

(3~7문장으로 핵심 내용 요약)

## 주요 포인트

- 포인트 1
- 포인트 2
- ...

## 언급된 Entity

- [[wiki/entities/xxx]] — 역할/설명
- ...

## 다루는 Concept

- [[wiki/concepts/yyy]] — 한 줄 설명
- ...

## 메모

(추가로 기록할 맥락, 의문점, 연관 내용)
```

### 4. Entity 페이지 신규 생성 또는 업데이트

소스에서 언급된 각 entity에 대해:
- `wiki/entities/` 에 해당 파일이 없으면 새로 생성
- 있으면 새 정보로 업데이트 (sources 목록 추가, 내용 보강)
- 1페이지 300줄 초과 시 하위 페이지로 분리

### 5. Concept 페이지 신규 생성 또는 업데이트

소스가 다루는 개념에 대해:
- `wiki/concepts/` 에 해당 파일이 없으면 새로 생성
- 있으면 새 관점/정보로 업데이트
- 기존 내용과 모순이 있으면 별도 섹션 `## 상충 정보`로 표시하고 출처 명시

### 6. Project/Decision 페이지 업데이트

관련 프로젝트나 의사결정이 있으면:
- 해당 페이지에 새 정보 반영
- 새 의사결정이 등장하면 `wiki/decisions/YYYY-MM-DD-slug.md` 생성

### 7. index.md 업데이트

`wiki/index.md` 를 읽고, 새로 생성/업데이트한 모든 페이지를 해당 섹션 테이블에 추가/수정한다.
헤더의 날짜와 총 페이지 수도 업데이트한다.

### 8. log.md append

`wiki/log.md` 맨 아래에 아래 형식으로 기록을 추가한다:

```
## [YYYY-MM-DD] ingest | 소스 제목
- 생성: wiki/summaries/xxx.md, wiki/entities/yyy.md (신규 N개)
- 업데이트: wiki/concepts/zzz.md (기존 N개)
- 영향 페이지: 총 N개
- 메모: (특이사항 있으면 기록)
```

### 9. Git commit

```bash
cd /Users/donggeollee/Obsidian/jimmy-working
git add -A
git commit -m "ingest: 소스 제목"
```

---

## 완료 보고

작업 완료 후 다음을 요약해서 알려준다:

- 처리한 소스: (파일명)
- 신규 생성 페이지: N개 (목록)
- 업데이트한 페이지: N개 (목록)
- 발견한 특이사항: (모순, 중요 인사이트 등)
