---
description: 새 환경에서 wiki를 인터뷰 형식으로 초기화하고 AGENTS.md와 wiki-config.json을 생성한다
---

# Wiki Setup

새 PC나 새 디렉토리에서 처음 wiki를 시작할 때 실행한다.
`question` 도구로 인터뷰를 진행해 wiki 루트와 사용자 정체성을 파악하고,
`~/.config/opencode/wiki-config.json` 에 경로를 저장해 다른 wiki 명령어들이 참조할 수 있게 한다.

## 사용법

```
/wiki-setup
```

인자 없이 실행. 모든 정보는 인터뷰로 수집한다.

---

## 워크플로우

### Phase 1 — 인터뷰

아래 질문들을 `question` 도구로 순서대로 진행한다.
각 질문은 이전 답변을 확인한 뒤 다음으로 넘어간다.

---

#### Q1. Wiki 루트 디렉토리

```
question:
  header: "Wiki 루트 경로"
  question: "wiki 파일들이 저장될 루트 디렉토리 경로를 알려주세요."
  options:
    - label: "~/wiki"
      description: "홈 디렉토리 아래 wiki 폴더
    - label: "~/Obsidian/wiki"
      description: "Obsidian vault 안에 wiki 폴더
    - label: "~/Documents/wiki"
      description: "Documents 아래 wiki 폴더
    - label: "직접 입력"
      description: "경로를 직접 타이핑
```

경로를 받은 뒤 해당 디렉토리가 존재하는지 확인한다.
없으면 생성할지 질문한다:

```
question:
  header: "디렉토리 생성"
  question: "{경로}가 존재하지 않습니다. 생성할까요?"
  options:
    - label: "생성한다"
      description: "mkdir -p 로 경로 생성
    - label: "경로를 다시 입력"
      description: "Q1 으로 돌아간다
```

---

#### Q2. 나는 누구인가

```
question:
  header: "이름 / 닉네임"
  question: "wiki의 주인은 누구인가요? 이름이나 닉네임을 알려주세요."
  options:
    - label: "직접 입력"
      description: "이름 또는 닉네임을 타이핑
```

---

#### Q3. 이 위키의 주된 목적

```
question:
  header: "Wiki 목적"
  question: "이 위키를 주로 어떤 목적으로 사용할 건가요? (복수 선택 가능)"
  multiple: true
  options:
    - label: "개인 학습 기록"
      description: "공부한 내용, 개념, 읽은 것들을 정리
    - label: "업무/프로젝트 지식"
      description: "회사 업무, 프로젝트 결정, 팀 노하우
    - label: "기술 레퍼런스"
      description: "자주 찾는 기술 스택, API, 패턴
    - label: "의사결정 로그"
      description: "왜 이렇게 결정했는지 추적
    - label: "아이디어 발전소"
      description: "생각 메모, 브레인스토밍, 아이디어 연결
```

---

#### Q4. 주요 도메인 / 관심사

```
question:
  header: "주요 도메인"
  question: "위키에서 주로 다룰 도메인이나 주제를 알려주세요. (복수 선택 가능)"
  multiple: true
  options:
    - label: "소프트웨어 개발"
      description: "코드, 아키텍처, 도구, 프레임워크
    - label: "AI / ML"
      description: "LLM, 에이전트, 모델, 프롬프트 엔지니어링
    - label: "프로덕트 / 비즈니스"
      description: "전략, 기획, 사용자 리서치
    - label: "개인 성장"
      description: "독서, 글쓰기, 습관, 회고
    - label: "기타 (직접 입력)"
      description: "위에 없는 도메인을 타이핑
```

---

#### Q5. 선호하는 정리 스타일

```
question:
  header: "정리 스타일"
  question: "지식을 어떤 방식으로 정리하는 걸 선호하나요?"
  options:
    - label: "간결하게 (핵심만)"
      description: "불렛 위주, 짧고 빠르게 찾을 수 있게
    - label: "서술형 (맥락 포함)"
      description: "배경, 이유, 과정까지 풍부하게 기록
    - label: "혼합 (항목마다 다르게)"
      description: "결정은 서술형, 레퍼런스는 간결하게
```

---

#### Q6. 언어 설정

```
question:
  header: "작성 언어"
  question: "위키 내용을 주로 어떤 언어로 작성할 건가요?"
  options:
    - label: "한국어"
      description: "모든 내용을 한국어로 작성
    - label: "영어"
      description: "모든 내용을 영어로 작성
    - label: "혼용"
      description: "맥락에 따라 한영 혼용
```

---

#### Q7. Git 사용 여부

```
question:
  header: "Git 연동"
  question: "wiki 변경사항을 git으로 관리할까요?"
  options:
    - label: "사용 (권장)"
      description: "변경할 때마다 자동 commit
    - label: "사용 안 함"
      description: "git 없이 파일만 관리
```

---

### Phase 2 — 인터뷰 요약 확인

수집한 정보를 정리해서 보여주고 확인을 받는다:

```
## 설정 요약

- **Wiki 루트**: {경로}
- **주인**: {이름}
- **목적**: {선택한 목적들}
- **도메인**: {선택한 도메인들}
- **정리 스타일**: {스타일}
- **언어**: {언어}
- **Git**: {사용/미사용}

이대로 AGENTS.md를 생성할까요?
```

```
question:
  header: "최종 확인"
  question: "위 설정으로 wiki를 초기화할까요?"
  options:
    - label: "생성한다"
      description: "AGENTS.md 및 디렉토리 구조 생성
    - label: "다시 설정"
      description: "인터뷰부터 다시 시작
```

---

### Phase 3 — 디렉토리 구조 생성

```bash
mkdir -p {wiki_root}/wiki/entities
mkdir -p {wiki_root}/wiki/concepts
mkdir -p {wiki_root}/wiki/decisions
mkdir -p {wiki_root}/wiki/projects
mkdir -p {wiki_root}/wiki/summaries
mkdir -p {wiki_root}/sources/web
mkdir -p {wiki_root}/sources/memos
mkdir -p {wiki_root}/sources/work
```

---

### Phase 4 — AGENTS.md 생성

인터뷰 결과를 반영해 `{wiki_root}/AGENTS.md` 를 작성한다.
아래는 템플릿이며, `{변수}` 부분을 인터뷰 답변으로 채운다.

````markdown
# {이름}'s Wiki — Agent Guide

이 파일은 AI 에이전트가 이 위키를 올바르게 다루기 위한 운영 지침서다.
wiki 관련 모든 command는 이 파일을 가장 먼저 읽는다.

---

## 위키 정체성

- **주인**: {이름}
- **목적**: {목적 목록}
- **주요 도메인**: {도메인 목록}
- **초기화 일자**: {YYYY-MM-DD}

---

## 디렉토리 구조

```
{wiki_root}/
├── AGENTS.md              ← 이 파일 (에이전트 지침서)
├── wiki/
│   ├── index.md           ← 전체 페이지 목록 및 현황
│   ├── log.md             ← 모든 작업 이력
│   ├── entities/          ← 사람, 팀, 시스템, 서비스
│   ├── concepts/          ← 기술 개념, 패턴, 용어
│   ├── decisions/         ← 의사결정 기록
│   ├── projects/          ← 프로젝트 현황
│   └── summaries/         ← 소스 요약
└── sources/
    ├── web/               ← 웹 아티클, 블로그
    ├── memos/             ← 직접 메모, 회의록
    └── work/              ← Slack, Jira, Confluence 추출
```

---

## Page Types & Frontmatter

모든 wiki 페이지는 아래 frontmatter를 포함해야 한다:

```yaml
---
type: entity | concept | decision | project | summary
title: "페이지 제목"
aliases: []
sources: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
status: active | archived | superseded
confidence: source-of-truth | heuristic | uncertain
---
```

### `confidence` 필드 규칙

| 값 | 의미 | 예시 |
|----|------|------|
| `source-of-truth` | 공식 문서, 코드, 직접 확인 | 공식 API 스펙, 사용자가 직접 확인한 사실 |
| `heuristic` | 경험적 발견, 관찰된 패턴 | "이렇게 하니까 됐다", 실무 노하우 |
| `uncertain` | 추측, 미확인 | 아직 검증 안 된 가설 |

---

## 정리 스타일 가이드

**주인의 선호**: {정리 스타일}
**작성 언어**: {언어}

{스타일에 따른 구체적 지침 — 아래 조건별 삽입}

<!-- 간결하게 선택 시 -->
- 불렛 포인트 위주로 작성한다
- 배경 설명은 최소화하고 핵심만 기록한다
- 한 항목은 한 줄을 넘기지 않는 것을 목표로 한다

<!-- 서술형 선택 시 -->
- 배경과 맥락을 충분히 서술한다
- 결정의 이유, 시도했던 대안, 실패한 과정을 포함한다
- 나중에 읽는 사람(미래의 나)이 맥락 없이도 이해할 수 있게 쓴다

<!-- 혼합 선택 시 -->
- `decision` 타입: 이유와 대안까지 서술형으로 기록한다
- `concept` 타입: 핵심 정의는 간결하게, edge case는 상세히 기록한다
- `summary` 타입: 핵심 요약 3~7문장 + 불렛 포인트 병행

---

## 지식 포착 원칙

다음 내용은 반드시 wiki에 포착해야 한다:

1. **결정 + 이유**: "A 대신 B를 선택했다"는 사실보다 **왜** 그랬는지가 더 중요하다
2. **수정/정정**: 틀렸던 내용이 어떻게 바뀌었는지 — 변화의 흔적을 지우지 않는다
3. **예외 케이스**: 일반 규칙이 통하지 않는 상황
4. **실패한 시도**: 안 됐던 방법과 그 이유 — 같은 실수를 반복하지 않기 위해
5. **유효 조건**: 이 지식이 언제까지, 어떤 조건에서 유효한가

다음은 포착하지 않아도 된다:
- 일회성 단순 작업
- 이미 위키에 동일한 내용이 있는 경우
- 재현 불가능하거나 매우 특수한 상황

---

## 지식 유통기한 관리

지식은 시간이 지나면 낡는다. 다음 규칙을 따른다:

- `updated` 날짜가 **90일 이상** 지난 active 페이지는 유효성 재검토 대상
- 대체된 결정은 `status: superseded` + `superseded_by: [[새 결정 페이지]]` 로 표시
- 낡은 정보를 삭제하지 않고 **아카이브**한다 — 왜 그랬는지의 역사가 중요하다

---

## 모순 처리 규칙

같은 주제에 대해 상충되는 정보가 발견되면:

1. 삭제하거나 덮어쓰지 않는다
2. `## 상충 정보` 섹션을 추가하고 양쪽 출처와 내용을 병기한다
3. 최신 `confidence: source-of-truth` 정보가 우선한다
4. `wiki-lint` 실행 시 모순은 사용자에게 보고해 직접 판단받는다

---

## Cross-Reference 규칙

- 다른 wiki 페이지 참조: `[[wiki/concepts/xxx]]` 형식
- 소스 파일 참조: `[[sources/web/xxx.md]]` 형식
- 같은 entity/concept 이름이 본문에 등장하면 반드시 링크로 연결한다

---

## Log 형식

`wiki/log.md` 에 모든 작업을 기록한다:

```
## [YYYY-MM-DD] {action} | {한 줄 요약}
- {세부 내용}
```

action 종류: `ingest` | `capture` | `lint` | `query` | `setup`

---

## Git 설정

{git 사용 선택 시}
- 모든 wiki 변경 후 자동으로 commit한다
- commit 메시지 형식: `{action}: {한 줄 요약}`
- remote push는 하지 않는다 (사용자가 직접 관리)

{git 미사용 선택 시}
- git을 사용하지 않는다. 파일 변경만 수행한다.

---

## 다른 Wiki 명령어 목록

| 명령어 | 설명 |
|--------|------|
| `/wiki-ingest $SOURCE_PATH` | 새 소스를 추가하고 관련 페이지 생성/업데이트 |
| `/wiki-capture` | 현재 대화/작업에서 지식 자동 추출 저장 |
| `/wiki-query $QUESTION` | wiki에서 질문에 답하고 관련 지식 합성 |
| `/wiki-lint` | wiki 품질 점검 및 모순/고아 페이지 수정 |
| `/wiki-setup` | 이 파일 — 새 환경에서 wiki 초기화 |
````

---

### Phase 5 — index.md 및 log.md 초기화

**`{wiki_root}/wiki/index.md`** 생성:

```markdown
# Wiki Index

**주인**: {이름}
**초기화**: {YYYY-MM-DD}
**총 페이지**: 0

---

## Entities
| 파일 | 설명 | 업데이트 |
|------|------|----------|

## Concepts
| 파일 | 설명 | 업데이트 |
|------|------|----------|

## Decisions
| 파일 | 설명 | 업데이트 |
|------|------|----------|

## Projects
| 파일 | 설명 | 업데이트 |
|------|------|----------|

## Summaries
| 파일 | 설명 | 업데이트 |
|------|------|----------|
```

**`{wiki_root}/wiki/log.md`** 생성:

```markdown
# Wiki Log

---

## [{YYYY-MM-DD}] setup | wiki 초기화

- 주인: {이름}
- 목적: {목적}
- 도메인: {도메인}
- 디렉토리 구조 생성 완료
- AGENTS.md 생성 완료
```

---

### Phase 6 — wiki-config.json 저장

`~/.config/opencode/wiki-config.json` 에 설정을 저장한다.
다른 모든 wiki 명령어는 실행 시 이 파일을 읽어 wiki 루트 경로를 결정한다.

```bash
mkdir -p ~/.config/opencode
```

저장할 내용 (`~/.config/opencode/wiki-config.json`):

```json
{
  "wiki_root": "{wiki_root}",
  "owner": "{이름}",
  "language": "{언어}",
  "git": {true | false},
  "initialized": "{YYYY-MM-DD}"
}
```

파일을 생성한다:

```bash
cat > ~/.config/opencode/wiki-config.json << 'EOF'
{
  "wiki_root": "{wiki_root}",
  "owner": "{이름}",
  "language": "{언어}",
  "git": {true | false},
  "initialized": "{YYYY-MM-DD}"
}
EOF
```

---

### Phase 7 — Git 초기화 (선택한 경우)

```bash
cd {wiki_root}
git init
echo "*.DS_Store" > .gitignore
git add -A
git commit -m "setup: wiki 초기화 — {이름}"
```

---

## 완료 보고

```
## Wiki Setup 완료

**주인**: {이름}
**Wiki 루트**: {경로}
**생성된 파일**:
  - AGENTS.md
  - wiki/index.md
  - wiki/log.md
  - 디렉토리 구조 (entities, concepts, decisions, projects, summaries, sources/*)

**다음 단계**:
  1. 첫 소스를 추가하려면: /wiki-ingest {파일경로}
  2. 현재 대화에서 지식을 저장하려면: /wiki-capture
  3. 위키에 질문하려면: /wiki-query {질문}
```
