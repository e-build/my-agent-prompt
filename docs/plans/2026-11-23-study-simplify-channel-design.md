# study extension 단순화와 학습 채널 추상화 설계

> 상태: 설계 확정 · 2026-11-23 · 대상: `runtime/pi/extensions/study` · 진행 방식: 새 코어로 재작성
> 이전 설계 중 이 문서로 대체되는 것: `2026-11-03-study-my-textbook-*`, `2026-11-16-study-concept-textbook-quality*`, `2026-11-02-study-placement-diagnosis.md`의 챕터 진단 부분

## 목차

- [배경](#배경)
- [확정한 결정](#확정한-결정)
- [전체 구조](#전체-구조)
- [Channel 포트와 학습 카드](#channel-포트와-학습-카드)
- [단계별 흐름](#단계별-흐름)
- [사용자 지침 덮어쓰기](#사용자-지침-덮어쓰기)
- [저장 구조](#저장-구조)
- [도구와 명령](#도구와-명령)
- [오류 처리](#오류-처리)
- [테스트](#테스트)
- [기존 데이터 정리](#기존-데이터-정리)
- [하지 않는 것](#하지-않는-것)
- [위험과 먼저 확인할 것](#위험과-먼저-확인할-것)

## 배경

사용자 피드백(2026-11-23):

1. 브라우저와 TUI를 번갈아 쓰는 방식이 불편하다.
2. 개념을 book으로 엮는 과정이 생기면서 extension이 복잡해졌고, 챕터 README의 개념 품질이 떨어졌다.
3. 배치 진단 뒤 챕터 진단은 중복이다.
4. 단계별 지침 md를 사용자가 직접 고칠 수 있으면 좋겠다.

현재 규모: `src/` 약 13k줄, 도구 16개, 명령 8개. book(2.5k줄), knowledge(1.3k), workspace(1k), assessment·bridge·curriculum(2.2k)이 복잡도의 대부분이다. 완료된 챕터는 0개라 데이터 이전 부담이 작다.

## 확정한 결정

| 쟁점 | 결정 |
|---|---|
| 학습 화면 | 진단·학습·평가·복습을 하나의 **학습 채널**에서 진행. Plannotator Inbox를 적극 쓰되 다른 도구로 바꿀 수 있어야 함 |
| 채널 추상화 위치 | extension 안의 **포트 + 어댑터**. 기본 어댑터 `chat`(외부 의존 없음), `plannotator` |
| book | **완전 제거**. 코드와 study 루트의 `book/` 폴더 모두 |
| 개념 교재 위치 | 챕터의 **개념별 파일** `ch-xx/concepts/NN-<slug>.md` |
| 진단 | **배치 진단 하나로 통합**. 챕터 진단 phase 제거, 챕터는 개념부터 시작 |
| 공통 지식 | 명제·버전·병합(knowledge) **제거** |
| 복습 | **챕터 단위** 복습, 일정은 study 루트에서 **통합 관리** |
| 지침 커스텀 | 기본값 + 사용자 **파일 단위 덮어쓰기** (project > root > 기본) |
| 진행 방식 | 새 코어로 재작성, 살릴 모듈(lab·preflight·checkpoint·project·roadmap)만 옮김 |

## 전체 구조

```text
/study-* 명령 ─┐
               ▼
     ┌──────────────────────┐
     │ 지침 로더             │ project > root > 기본 md
     └──────────┬───────────┘
                ▼
           Pi 에이전트 ── study 도구 ──┐
                ▲                      ▼
                │              ┌────────────────────┐
     답장(사용자 메시지)        │ 코어 (채널 모름)     │
                │              │ state·schedule·카드 │
                │              └─────────┬──────────┘
                │                        ▼ Channel 포트
                │        ┌───────────────┴───────────────┐
                └────────│ chat 어댑터 │ plannotator 어댑터 │
                         └─────────────┴──────────────────┘
```

- **코어**는 학습 상태, 카드(질문·채점 기준·응답), 복습 일정, 단계 전이만 안다. 어떤 채널인지 모른다.
- **어댑터**는 카드를 보내기만 한다. 답장 해석은 에이전트가 하고 `study_answer_record`로 기록한다. 그래서 새 채널은 어댑터 파일 하나로 붙는다.
- HTTP 서버, HTML 템플릿, 브라우저 브리지, `*_GRADE_JSON` 훅은 모두 없앤다.

### 모듈 배치 (새 `src/`)

| 모듈 | 책임 | 출처 |
|---|---|---|
| `channel/` | 포트, `chat`·`plannotator` 어댑터, 설정으로 고르기, fallback | 신규 |
| `prompts/` | 지침 로더, 요청 헤더, `/study-prompts` | 신규 (`phase-instructions.ts` 대체) |
| `cards/` | 카드 생성, 기준 선저장, 응답 기록(append-only) | 신규 (`evidence/` 대체) |
| `flow/` | `/study-init`·`/study-chapter`·단계 완료·배치 진단 종료·시험 판정 | 신규 (`session/` 일부 대체) |
| `review/` | 통합 일정 파일 하나, 오늘 할 복습, 회차 진행 | 신규 (기존 `review/` 대체) |
| `state/` | `state.json`·`project.json` 읽기/쓰기 | `session/study-state.ts`, `project/` 정리 |
| `lab/` | verify·step update·preflight | 기존 유지 |
| `checkpoint/` | `/study-checkpoint` | 기존 유지(경로 import만 수정) |
| `ui/` | 위젯, `/study-map` 로드맵 | `session/` 에서 이동 |

예상 규모 3~4k줄(추정, 구현 후 확인).

## Channel 포트와 학습 카드

### 카드

```ts
type CardBase = { id: string; projectSlug: string; chapterSlug?: string };

type LearningCard =
  | (CardBase & {
      kind: "question";
      purpose: "placement" | "concept-check" | "test" | "review";
      items: Array<{ id: string; prompt: string; context?: string; choices?: string[]; multi?: boolean; maxScore?: number }>;
      askConfidence: boolean;
    })
  | (CardBase & { kind: "lesson"; title: string; summary: string; attachments: string[] })
  | (CardBase & { kind: "notice"; title: string; body: string });

interface Channel {
  id: string;
  available(): Promise<boolean>;
  deliver(card: LearningCard): Promise<{ ref: string; publicText: string }>;
}
```

- 질문 카드 하나에 여러 문항(items)을 담을 수 있다. 배치 진단은 적응형이라 1문항씩, 시험·복습은 묶어서 보낸다.
- 채점 기준(`criteria`)은 카드에 넣지 않는다. 코어 저장소에만 있다.

### 도구 계약 (코드에 고정)

- `study_ask`: 문항과 비공개 기준을 받아 **기준을 저장한 뒤** 카드를 보낸다. 한 도구 안에서 순서가 고정되므로 기준 저장 전에 학습자가 질문을 볼 수 없다. 보내기에 실패하면 카드는 `undelivered`로 남고 기준은 공개되지 않는다.
- `study_send`: lesson·notice 카드 전송.
- `study_answer_record`: `cardId`·`itemId`별 학습자 원문, 확신도(학습자가 말한 0~10 ÷ 10), 도움 정도(independent|hinted|explained|unknown), 판정(demonstrated|partial|incorrect|unverified), 점수(시험). 최초 응답은 덮어쓰지 않고 교정은 `correctionOf`로 추가.

### 답장 경로

- 문항마다 본문 끝에 `[<cardId>/<itemId>]` 표시를 붙인다. 에이전트는 답장의 이 표시로 기록 대상을 찾는다.
- `plannotator`: 답장이 `Plannotator Inbox: … (reply id)` 메시지로 세션에 들어온다.
- `chat`: 도구 결과의 `publicText`를 에이전트가 그대로 보여 주고, 학습자가 채팅으로 답한다.

### plannotator 어댑터

- 전송: `pi.exec("plannotator", ["inbox", "call", "--session", <Pi 세션 ID>, "send_message", "-"])`, stdin에 JSON.
- 스레드: 챕터마다 하나 `study · <projectSlug> · <chapterSlug>`(배치 진단은 `study · <projectSlug> · placement`).
- `idempotency_key` = 카드 ID. 재시도해도 두 번 보내지 않는다.
- 문항 → `:::question`(선택형), `:::question-multi`, `:::question-text`(서술형). 확신도는 같은 메시지의 `:::question-text` 블록 하나로 받는다.
- lesson 카드는 개념 파일을 `attachments`로 보낸다. 학습자가 파일에 단 주석이 답장으로 돌아오므로 읽으며 질문하는 흐름이 생긴다.
- 에이전트가 학습 카드를 `plannotator_inbox` 도구로 직접 보내지 않도록 `promptGuidelines`에 명시한다.

### 설정

- `<root>/.study/workspace.json`의 `channel`(기본 `"chat"`), 프로젝트 `.study/project.json`의 `channel`이 있으면 우선.
- 바꾸기: 설정 한 줄. 되돌리기: `"chat"`.

## 단계별 흐름

단계: `init(배치 진단 포함) → concept → lab → test → review`. 챕터마다 `concept → lab → test → review`.

### init (`/study-init <주제>`)

1. 디렉터리 확정, 브리프 질문 4개(`ask_user_question`, TUI). 프로젝트가 생기기 전이라 채널을 쓰지 않는다.
2. 자료 조사.
3. **배치 진단**(채널 사용): `study_ask(purpose=placement)` 1문항씩, 상한 8, 경로가 정해지면 종료. 규칙(목표 수준부터, 예측·판단 질문, 확신도, 해설 순서)은 기존 3b를 유지.
4. `study_placement_finish`: 프로젝트 전체 요약 + **챕터별 출발점**(skip·focus·미확인)을 `project.json`에 저장. 기존 챕터 진단의 역할을 여기서 끝낸다.
5. README, 챕터 README(학습 지도), SETUP, AGENTS.md 생성. 커리큘럼은 `study_send(notice)`로 요약과 README를 채널에 보내고, 승인/수정은 답장으로 받는다. 승인되면 study 루트 등록.

### concept

- `/study-chapter`가 요청 헤더 + `concept.md` + 이 챕터의 배치 진단 출발점을 보낸다.
- 개념마다 `ch-xx/concepts/NN-<slug>.md`를 쓴다(구성은 기존 10단계: 왜 필요한가 → 핵심 한 문장 → 최소 예시 → 내부 동작 → 설계 이유 → 성립 조건 → 흔한 오해 → 비교 → 스스로 확인 → 출처). 그림은 diagram-design SVG를 `ch-xx/concepts/media/`에 둔다.
- 개념 파일마다 `study_send(lesson)` → 학습자가 읽고 주석·질문 → 필요하면 `study_ask(concept-check)`. 배치 진단의 미확인 항목은 여기서 예측 질문으로 확인.
- 이해가 부족하면 문장을 덧붙이지 말고 그 개념 파일을 재구성한다.
- 챕터 README의 `## 개념 파일`에 링크 목록을 둔다.
- 완료: `study_phase complete` — 개념 파일 1개 이상이 존재하고 README 목록과 일치하는지 코드가 검사.

### lab

- 기존 lab 규칙과 도구 유지. step 안내는 `study_send(notice)`, 완료 보고는 답장, 검증은 `study_lab_verify`.

### test

- `study_ask(purpose=test)`로 한 카드에 문항 묶음(문항별 `maxScore`, 비공개 기준)을 보낸다.
- 답장이 오면 문항별로 `study_answer_record`(점수·판정·해설 근거).
- `study_test_finish`: **통과 여부는 코드가 기록된 점수로 계산**한다(LLM이 통과를 선언하지 않음). 통과면 test completed + 복습 일정 등록, 미통과면 약점 문항 목록을 돌려주고 attempt+1 변형 문항을 요구.
- 결과는 `study_send(notice)`로 채널에 보낸다.

### review (`/study-review`)

- `study_review_next`: 오늘 기한인 챕터(기한 경과 우선).
- 챕터 개념 파일의 `스스로 확인`과 시험 약점을 재료로 `study_ask(purpose=review)` 묶음.
- `study_review_finish`: 그 회차 문항이 모두 independent+demonstrated면 다음 간격, 아니면 그 챕터만 첫 간격부터. 간격 +1/+3/+7/+14, 마지막 회차 후 종료. 미래 회차는 미리 하지 않는다.

## 사용자 지침 덮어쓰기

### 파일

| 이름 | 쓰이는 곳 |
|---|---|
| `init.md` | `/study-init` (`{{topic}}` 하나만 치환) |
| `concept.md`, `lab.md`, `test.md` | `/study-chapter` 단계 |
| `review.md` | `/study-review` |
| `checkpoint.md` | `/study-checkpoint` |
| `templates/concept-page.md`, `templates/chapter-readme.md` | 개념 파일·챕터 README 양식 |

기본값은 extension의 `prompts/`에 둔다. `/study-init`·`/study-review`도 prompt 템플릿 대신 등록 명령으로 바꿔 같은 로더를 쓴다.

### 우선순위

1. `<project>/.study/prompts/<name>.md`
2. `<root>/.study/prompts/<name>.md`
3. `extension/prompts/<name>.md`

- 파일 단위로 통째로 바꾼다(병합 없음).
- 요청 헤더(projectRoot, chapterSlug, phase, 상태, 배치 진단 출발점)는 코드가 항상 앞에 붙인다. 사용자 파일은 본문만 정한다.
- 도구 계약(기준 선저장, 응답 원문, 통과 계산)은 코드와 `promptGuidelines`에 있어 지침을 고쳐도 깨지지 않는다.

### `/study-prompts`

- 인자 없음: 각 지침이 어느 층에서 오는지 목록(기본/root/project, 기본값과 다른지).
- `eject <name> [--project]`: 기본값을 덮어쓰기 위치로 복사.
- `diff <name>`: 덮어쓴 파일과 현재 기본값의 차이.
- `reset <name>`: 덮어쓴 파일 삭제(확인 후).

## 저장 구조

```text
<study 루트>/
├── .study/workspace.json        # timezone, review.intervals, projects, channel
├── .study/prompts/              # (선택) 사용자 지침
└── review/schedule.json         # 통합 복습 일정 (챕터 단위)

<project>/
├── .study/project.json          # 프로젝트 정보, placement(전체 요약 + 챕터별 출발점), channel(선택)
├── .study/state.json            # 챕터별 concept/lab/test/review 상태
├── .study/placement.json        # 배치 진단 문항·응답 (cards와 같은 형식)
├── .study/cards/<chapter>.jsonl # 카드·비공개 기준·응답 append-only
├── .study/prompts/              # (선택) 프로젝트 지침
└── ch-xx-<slug>/
    ├── README.md                # 학습 지도 + ## 개념 파일
    ├── concepts/NN-<slug>.md    # 개념 교재
    ├── concepts/media/          # 그림 (HTML 원본 + SVG)
    └── lab/                     # 기존 그대로
```

### 상태

- phase: `concept | lab | test | review` (`diagnosis` 제거).
- status: `not_started | in_progress | completed | relearn_required | skipped_understood | blocked` (`awaiting_*` 제거).
- 기존 `state.json`의 `diagnosis` 키는 읽을 때 무시한다.

### 복습 일정 `review/schedule.json`

```json
{ "version": 1, "entries": [
  { "projectSlug": "study-ansi-sql", "chapterSlug": "ch-01-null-three-valued-logic",
    "baseDate": "2026-11-24", "round": 1, "due": "2026-11-25",
    "history": [{ "date": "2026-11-25", "result": "advanced", "cardId": "c-…" }] }
]}
```

- 한 파일이라 쓰기는 파일 단위 mutation queue + 읽은 값 비교 후 저장(다른 변경이 먼저 저장되면 거부).

## 도구와 명령

### 도구 (16개 → 11개)

| 도구 | 역할 |
|---|---|
| `study_ask` | 기준 선저장 + 질문 카드 전송 |
| `study_send` | lesson·notice 카드 전송 |
| `study_answer_record` | 응답·판정·점수 기록 |
| `study_placement_finish` | 배치 진단 종료, 챕터별 출발점 저장 |
| `study_phase` | `get`·`complete`(단계별 완료 조건 검사) |
| `study_test_finish` | 기록된 점수로 통과 계산, 일정 등록 |
| `study_review_next` | 오늘 할 챕터 복습 |
| `study_review_finish` | 회차 결과 반영 |
| `study_lab_verify`, `study_lab_step_update`, `study_preflight` | 기존 유지 |
| `study_checkpoint_publish` | 기존 유지 |

### 명령

`/study-init`, `/study-chapter`, `/study-review`, `/study-checkpoint`, `/study-map`, `/study-prompts`. `/study-book`, `/study-concepts` 제거.

## 오류 처리

| 상황 | 동작 |
|---|---|
| 채널 사용 불가(Inbox 꺼짐, exit 1/2) | `chat`으로 보내고 도구 결과에 `fallback: <이유>`. 조용히 넘기지 않음 |
| 보내기 실패 | 카드 `undelivered`, 기준 비공개 유지, 같은 카드 ID로 재시도(멱등) |
| 덮어쓴 지침을 읽지 못함 | 기본값 사용 + 경고를 명령 출력에 표시 |
| 기본 지침이 없음 | 오류로 중단 (기존의 한 줄 대체 동작 제거) |
| 답장에 카드 표시가 없음 | 에이전트가 최근 열린 카드로 추정하지 말고 어느 문항인지 학습자에게 확인 |
| 시험 문항 일부 미기록 | `study_test_finish`가 거부하고 빠진 문항 ID를 반환 |
| 일정 동시 수정 | 저장 거부, 다시 읽고 재시도 안내 |

## 테스트

- **채널 계약 테스트**: 같은 시나리오를 두 어댑터에 실행. plannotator는 가짜 exec로 명령 인자, stdin JSON, 멱등 키, 스레드 이름, fallback을 검증.
- **ask 원자성**: 기준 저장 전 전송이 일어나지 않음, 전송 실패 시 기준 비공개 유지.
- **지침 로더**: 세 층 우선순위, 읽기 실패 경고, 기본값 누락 오류, `{{topic}}` 치환.
- **시험 판정**: 점수 합계·passScore·미기록 문항 거부.
- **복습 일정**: 진행·초기화·종료·동시 수정 거부·시간대.
- **단계 완료 조건**: concept(개념 파일·README 목록), lab(기존), test.
- **등록 테스트**: 도구 11개·명령 6개, 제거된 이름이 없음.
- 제거하는 모듈의 테스트는 모듈과 함께 삭제. lab·checkpoint·preflight 테스트는 유지.

## 기존 데이터 정리

study 루트(`~/IdeaProjects/study`, 별도 git 저장소) 정리는 구현 마지막에 **사용자 확인 후** 스크립트로 한 번 실행한다. git 이력으로 되돌릴 수 있다.

- 삭제: `book/`(git 추적 520개), `knowledge/`(700개), `review/items/`, `.study/local/`, 각 프로젝트의 `.study/dialogue|assessments|bindings`, `diagnosis.md`·`test.md`·HTML 산출물.
- 변환: `state.json`에서 `diagnosis` 제거, `ch-01` 등 진단 진행 중 챕터는 concept `not_started`.
- 완료 챕터가 0개라 복습 일정 이전은 없다.
- study 저장소에 커밋하지 않은 변경(`study-ansi-sql/.study/*`, `AGENTS.md`)은 건드리지 않고 먼저 알린다.
- 기존 프로젝트의 `AGENTS.md`·README에 남은 옛 흐름(챕터 진단, book 링크) 문구는 목록으로 보고하고, 수정은 따로 확인받는다.

## 하지 않는 것

- 채널 어댑터를 별도 패키지로 분리(어댑터가 2개뿐, YAGNI).
- 여러 프로젝트에 걸친 같은 지식 중복 제거(knowledge 제거와 함께 포기).
- 어댑터가 답장을 직접 받아 해석하는 구조(폴링·웹훅). 답장은 에이전트 세션으로만 받는다.
- 지침 부분 병합·템플릿 변수(파일 단위 교체만).
- 브라우저 화면 유지.

## 위험과 먼저 확인할 것

1. **답장이 이 세션으로 돌아오는지**: extension에서 `--session <ctx.sessionManager.getSessionId()>`로 보낸 메시지의 답장이 같은 Pi 세션을 깨우는지 아직 확인하지 않았다. 구현 첫 단계에서 실제 전송으로 검증하고, 안 되면 `plannotator_inbox` 도구를 에이전트가 호출하고 결과 ref만 기록하는 방식으로 어댑터를 바꾼다(포트는 그대로).
2. **카드 표시 누락**: 학습자가 답장에서 문항 표시를 지우면 매칭이 어렵다. Inbox는 질문 블록별로 답을 돌려주므로 블록 제목에 표시를 넣어 완화한다.
3. **Inbox 한 번에 질문 수**: 권장 약 8개. 시험 문항이 더 많으면 카드를 나눈다.
4. **재작성 중 공백**: 새 코어가 끝날 때까지 기존 extension을 그대로 두고, 교체는 한 커밋에서 한다.
