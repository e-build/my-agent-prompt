# study extension

배치 진단 → 개념 → 실습 → 시험 → 복습을 **학습 채널** 하나(Pi 대화창 또는 Plannotator Inbox)로 진행하는 Pi extension.

## 목차

- [명령](#명령)
- [학습 흐름](#학습-흐름)
- [학습 채널](#학습-채널)
- [지침 고치기](#지침-고치기)
- [도구](#도구)
- [저장 구조](#저장-구조)
- [코드 구성](#코드-구성)
- [테스트](#테스트)

## 명령

| 명령 | 언제 |
|---|---|
| `/study-init <주제>` | 새 학습 프로젝트. 브리프 → 배치 진단 → 커리큘럼 승인 → 등록 |
| `/study-chapter [챕터] [단계]` | 학습 이어가기. 인자 없이 실행하면 메뉴. 예: `/study-chapter 01 시험` |
| `/study-review [챕터]` | 오늘 할 챕터 복습 |
| `/study-checkpoint [챕터]` | 진도 갈무리, checkpoint 파일만 커밋·푸시 |
| `/study-map` | 오른쪽 학습 로드맵 패널 켜기/끄기 |
| `/study-prompts` | 단계 지침 덮어쓰기 관리 |

단계 인자는 `개념·실습·시험·복습`(영문 `concept·lab·test·review`도 가능).

## 학습 흐름

```text
/study-init ── 배치 진단(최대 8문항, 챕터별 출발점까지 결정) ── 커리큘럼 승인 ── 등록
      │
      ▼  챕터마다
  concept ──▶ lab ──▶ test ──▶ review (+1 / +3 / +7 / +14일)
```

- **배치 진단은 한 번:** 챕터를 시작할 때 다시 진단하지 않는다. 배치 진단에서 확인하지 못한 항목은 개념 학습 중 예측 질문으로 확인한다.
- **concept:** 개념마다 `ch-xx/concepts/NN-<slug>.md`를 쓰고 학습 채널로 보낸다. 챕터 README의 `## 개념 파일` 목록과 실제 파일이 같아야 완료된다.
- **lab:** `lab/manifest.json`의 step을 하나씩 검증한다. 모든 step이 끝나야 완료된다.
- **test:** 기록된 문항 점수로 코드가 통과 여부를 계산한다. 통과하면 복습 일정이 자동 등록된다.
- **review:** 챕터 단위. 모든 문항을 혼자 맞히면 다음 간격, 아니면 그 챕터만 첫 간격부터 다시 한다.

## 학습 채널

질문·교재·결과는 모두 카드로 만들어 채널로 보낸다. extension은 카드를 보내기만 하고, 학습자의 답장은 에이전트가 읽어 `study_answer_record`로 기록한다.

| 채널 | 동작 |
|---|---|
| `chat` (기본) | 에이전트가 카드를 Pi 대화창에 그대로 보여 준다. 외부 의존 없음 |
| `plannotator` | `plannotator inbox call send_message`로 챕터별 스레드에 보낸다. 문항은 답할 수 있는 질문 블록, 개념 파일은 첨부로 간다. 답장은 Pi 세션으로 돌아온다 |

설정:

```jsonc
// <study 루트>/.study/workspace.json  (프로젝트 .study/project.json의 channel이 있으면 그쪽이 우선)
{ "channel": "plannotator" }
```

- 보내기에 실패하면 chat으로 보내고 도구 결과에 `fallback: <이유>`를 남긴다.
- 같은 카드는 두 번 보내지 않는다(카드 ID가 Inbox 멱등 키).
- 다른 도구를 붙이려면 `src/channel/`에 `Channel`(`available`, `deliver`)을 구현하고 `select-channel.ts`의 목록과 `channel-context.ts`의 생성 함수에 추가한다.

## 지침 고치기

단계별 지침은 `prompts/`의 마크다운이다. 같은 이름의 파일을 아래 위치에 두면 그 파일이 쓰인다(위가 우선).

1. `<프로젝트>/.study/prompts/<이름>.md`
2. `<study 루트>/.study/prompts/<이름>.md`
3. `prompts/<이름>.md` (기본값)

| 이름 | 쓰이는 곳 |
|---|---|
| `init` | `/study-init` (`{{topic}}`을 주제로 바꿈) |
| `concept`, `lab`, `test` | `/study-chapter`의 각 단계 |
| `review` | `/study-review` |
| `checkpoint` | `/study-checkpoint` |
| `templates/concept-page` | 개념 파일 양식 (개념 단계 지침 뒤에 붙음) |
| `templates/chapter-readme` | 챕터 README 양식 (init 지침이 참조) |

```text
/study-prompts                     어느 층의 파일이 쓰이는지 목록
/study-prompts eject concept       기본값을 study 루트에 복사 (--project면 프로젝트에)
/study-prompts diff concept        현재 쓰이는 파일과 기본값 비교
/study-prompts reset concept       덮어쓴 파일 삭제 (확인 후)
```

- 파일 단위로 통째로 바뀐다. 병합하지 않는다.
- 요청 헤더(projectRoot, chapterSlug, phase, 채널, 배치 진단 출발점)는 코드가 항상 앞에 붙인다.
- 기준 선저장, 응답 원문 기록, 점수 기반 통과 판정은 코드와 도구 규칙(`promptGuidelines`)에 있어 지침을 고쳐도 깨지지 않는다.
- 덮어쓴 파일을 읽지 못하면 기본값을 쓰고 경고를 표시한다. 기본값이 없으면 오류로 멈춘다.

## 도구

| 도구 | 역할 |
|---|---|
| `study_ask` | 비공개 채점 기준을 저장한 **뒤** 질문 카드를 보낸다 |
| `study_send` | 개념 파일(lesson)이나 안내·결과(notice)를 보낸다 |
| `study_answer_record` | 학습자 원문·확신도·도움 정도·판정·점수 기록. 최초 응답은 덮어쓰지 않음 |
| `study_placement_finish` | 배치 진단 종료, 챕터별 출발점 저장 (상한 8문항) |
| `study_project_approve` | 커리큘럼 승인 후 project.json 작성, study 루트 등록, 챕터 상태 생성 |
| `study_phase` | 단계 상태 조회, 개념·실습 완료(완료 조건 검사) |
| `study_test_finish` | 점수로 통과 계산, 통과 시 복습 일정 등록 |
| `study_review_next` | 오늘 할 챕터 복습(정답 없음) |
| `study_review_finish` | 복습 회차 기록, 다음 간격 계산 |
| `study_lab_verify`, `study_lab_step_update`, `study_preflight` | 실습 step 검증·상태, 실행 환경 검사 |
| `study_checkpoint_publish` | `/study-checkpoint`가 준비한 기록 저장·커밋·푸시 |

## 저장 구조

```text
<study 루트>/
├── .study/workspace.json        # timezone, review.intervals, projects, channel
├── .study/prompts/              # (선택) 지침 덮어쓰기
└── review/schedule.json         # 챕터 복습 일정 (모든 프로젝트)

<프로젝트>/
├── .study/project.json          # 주제, 챕터, 배치 진단 결과(챕터별 출발점), channel(선택)
├── .study/state.json            # 챕터별 concept/lab/test/review 상태
├── .study/cards/<scope>.jsonl   # 카드·비공개 기준·응답 (scope = 챕터 slug 또는 placement)
├── .study/prompts/              # (선택) 프로젝트 지침
└── ch-xx-<slug>/
    ├── README.md                # 학습 지도 + ## 개념 파일
    ├── concepts/NN-<slug>.md    # 개념 교재
    ├── concepts/media/          # 그림 (diagram-design HTML + SVG)
    └── lab/                     # manifest.json, README.md, results.md
```

- 카드 기록은 한 줄 = 한 이벤트로 추가만 한다(append-only).
- `state.json`의 옛 `diagnosis` 단계와 `awaiting_*` 상태는 읽을 때 무시하거나 `in_progress`로 바꾼다.

## 코드 구성

```text
study/
├── index.ts          # Pi 진입점: 도구·명령·위젯 등록
├── prompts/          # 기본 지침과 템플릿
├── src/
│   ├── channel/      # Channel 포트, chat·plannotator 어댑터, 선택·fallback
│   ├── cards/        # 카드 저장소(기준 선저장, 응답 append), ask/send/record
│   ├── flow/         # 단계 요청 조립, 완료 조건, 시험 판정, 배치 진단·승인·복습 흐름
│   ├── prompts/      # 지침 로더(세 층), eject/diff/reset
│   ├── review/       # study 루트, 복습 일정, 날짜 계산
│   ├── state/        # state.json, project.json, 프로젝트 경로
│   ├── lab/          # 실습 검증, preflight
│   ├── checkpoint/   # /study-checkpoint
│   ├── ui/           # 챕터 목록·메뉴·인자, 위젯, 로드맵 패널
│   ├── study-tools.ts     # 채널·흐름 도구 등록
│   └── study-commands.ts  # 명령 등록
└── tests/            # src와 같은 분류 + integration(Pi 로더로 실제 등록 확인)
```

- 업무 로직은 `src/<기능>/`의 순수 함수에 두고, `study-tools.ts`·`study-commands.ts`는 인자 해석과 호출만 한다.
- 도구 이름·스키마, 저장 형식, 지침 파일 이름은 호환 계약이다. 바꿀 때는 관련 테스트를 먼저 고친다.
- `src/`와 `index.ts`에서 `tests/`를 import하지 않는다. HTTP 서버와 브라우저를 쓰지 않는다(레이아웃 테스트가 검사).
- TypeScript 포맷은 `.prettierrc.json`(공백 2칸, 폭 100).

## 테스트

```bash
cd runtime/pi/extensions/study
NODE_PATH="<Pi 설치의 node_modules>" node --test 'tests/**/*.test.ts'
```

- `NODE_PATH`는 `@earendil-works/pi-coding-agent`, `jiti`, `typebox`가 있는 `node_modules`다. 관리형 설치라면 `~/.pi/agent/install/releases/<버전>/node_modules`.
- `NODE_PATH`가 없으면 Pi 로더 테스트(`tests/integration/extension-registration.test.ts`)는 이유를 표시하고 건너뛴다. 나머지는 Node만으로 돈다.
