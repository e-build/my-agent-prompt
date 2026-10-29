# study extension

브라우저 assessment와 구조화된 학습 상태를 연결하는 Pi extension.

## 목차

- [구성](#구성)
- [유지보수 기준](#유지보수-기준)
- [/study-chapter 동작](#study-chapter-동작)
- [프로젝트 경로 정책](#프로젝트-경로-정책)
- [/study-checkpoint — 현재 학습 갈무리](#study-checkpoint--현재-학습-갈무리)
- [상태 파일](#상태-파일)
- [Assessment](#assessment)
- [챕터 노트와 Lab 기록](#챕터-노트와-lab-기록)
- [고정 회차형 복습](#고정-회차형-복습)
- [테스트](#테스트)

## 구성

```text
study/
├── index.ts                    # Pi 진입점: lifecycle + 의존성 조립
├── src/                        # 프로덕션 구현
│   ├── assessment/             # 문항·채점 검증, HTML 생성, 시험 완료, 도구 등록
│   ├── bridge/                 # HTTP 서버·라우트, 브라우저 실행, agent 메시지
│   ├── checkpoint/             # checkpoint 명령·승인·기록·Git publish
│   ├── curriculum/             # 커리큘럼 산출물·미리보기 도구
│   ├── lab/                    # 실습 검증·환경 검사·명령 실행 adapter
│   ├── project/                # 프로젝트 경로·manifest
│   ├── review/                 # 복습 시작 페이지·갱신 도구
│   └── session/                # 상태·챕터 명령·학습 근거·지침 로더
├── tests/                      # 프로덕션 코드와 같은 기능별 분류
│   ├── assessment/
│   ├── bridge/
│   ├── checkpoint/
│   ├── curriculum/
│   ├── lab/
│   ├── project/
│   ├── review/
│   ├── session/
│   ├── integration/            # Pi entry point 등록·디렉터리 경계
│   └── support/                # 테스트 전용 공통 fixture
├── instructions/               # phase별 짧은 agent 지시
├── prompts/                    # /study-init, /study-review
└── assets/                     # curriculum/assessment browser UI
```

## 유지보수 기준

**수정할 동작에 맞는 모듈부터 확인.** `index.ts`에 업무 로직을 다시 추가하지 않음.

| 수정 대상 | 위치 | 주요 검증 |
|---|---|---|
| 도구 스키마·실행 순서 | `src/<기능>/*-tool.ts`, `*-tools.ts` | `tests/integration/extension-registration.test.ts` |
| 브라우저 요청·응답 | `src/bridge/study-routes.ts` | `tests/bridge/study-routes.test.ts` — 실제 loopback HTTP |
| 서버 시작·종료 | `src/bridge/browser-server.ts` | `tests/bridge/browser-server.test.ts` |
| agent 메시지 | `src/bridge/study-prompts.ts`, `src/session/diagnosis-review-prompt.ts` | 같은 기능의 prompt 테스트 |
| 전송 fallback | `src/bridge/agent-delivery.ts` | `tests/bridge/agent-delivery.test.ts` |
| 채점 검증·기록 | `src/assessment/assessment-grade.ts` | `tests/assessment/assessment-grade.test.ts` |
| grade와 세션 연결 | `src/assessment/grade-handler.ts` | `tests/assessment/grade-handler.test.ts` |
| HTML config·치환 | `src/assessment/assessment-page.ts` | `tests/assessment/assessment-page.test.ts` |
| 상태·실습·경로 정책 | `src/session/`, `src/lab/`, `src/project/` | 대응하는 `tests/<기능>/` |

- 순수 변환/도메인 코드와 Pi 도구 등록을 분리. 테스트를 위해 HTTP 서버나 실제 브라우저 실행을 요구하지 않는 경계 유지.
- 공통화는 실제 중복만 대상. diagnosis/test의 상태 전환·완료 조건은 명시적으로 유지.
- 세션은 extension 인스턴스가 소유. 서버는 첫 도구 호출에서 시작하고 shutdown 시 종료·세션 정리.
- phase 저장 실패 경고, 메시지 전달 fallback, review 페이지 실패 경고 등 기존 실패 정책 유지. 리팩터링과 정책 변경은 별도 작업.
- 도구 이름·스키마, HTTP 경로, grade marker, 저장 형식, 안내 프롬프트는 호환 계약. 변경 시 관련 회귀 테스트 먼저 보강.
- 루트 TypeScript 파일은 Pi가 로드하는 `index.ts`만 유지. 구현은 `src/<기능>/`, 테스트는 `tests/<기능>/`에 배치. 기능 안에서 도구 등록과 core 파일을 함께 탐색.
- `src/`와 `index.ts`에서 `tests/` import 금지. barrel export나 과거 경로의 호환 stub 없이 실제 파일을 직접 import.
- `tests/support/fixtures.ts`는 bridge·assessment 테스트의 최소 공통 fixture. 도메인별 기존 fixture는 각 테스트 옆에 유지.
- `instructions/`, `prompts/`, `assets/`는 extension 루트 기준 리소스. 구현·테스트 이동 시 `import.meta.url` 기반 상대 경로도 함께 확인.
- TypeScript 포맷은 `.prettierrc.json` 기준: 공백 2칸, 폭 100. HTML assets와 학습 지침은 포맷 대상에서 제외.

## /study-chapter 동작

기존 이름은 유지하되 prompt가 아니라 `registerCommand("study-chapter")`로 실행한다.

```text
/study-chapter [chapter] [diagnosis|concept|lab|test|review]
→ .study/state.json 로드 또는 기존 markdown migration
→ 대상 챕터와 다음 phase 선택
→ 해당 phase instruction만 agent에 전달
```

assessment phase에서 `study_diagnosis_open`/`study_test_open` 호출 없이 turn이 끝나면 extension이 1회 교정 follow-up을 전송한다.

명령으로 concept를 시작할 때와 진단 결과 확인 후 자동으로 concept로 전환할 때 모두 같은 phase 지침 로더를 사용한다. `instructions/concept.md`가 두 진입 경로의 정본이며, README 본문 작성·새 concept.md 생성 금지 규칙을 별도로 복사하지 않는다.

## 프로젝트 경로 정책

**`projectSlug`는 식별자, `projectRoot`는 실제 저장 위치.** 문서·HTML·manifest·학습 상태는 프로젝트 루트 하나에서 관리.

- `study_curriculum_open`에 선택적 `projectRoot` 지원. `/study-init`은 문서 생성 전에 확정한 절대 루트를 명시적으로 전달.
- 루트·챕터·`app/` 내부 호출: 같은 slug의 기존 프로젝트 루트 재사용. `cwd/projectSlug`를 무조건 덧붙이지 않음.
- 프로젝트 밖 호출: 요청한 slug의 `cwd/projectSlug` 사용. 다른 프로젝트가 여러 개 있어도 요청한 slug만 선택.
- 일반 진단·시험·실습·checkpoint 탐색: 현재 또는 상위 프로젝트 우선. 상위 디렉토리의 후보가 여러 개면 오류, 첫 후보 임의 선택 금지.
- 명시적 `projectRoot`: 루트 이름·요청 slug·기존 manifest slug 일치 검증. 다른 프로젝트 내부의 중첩 루트는 거부하고 별도 루트 요구.
- 잘못된 slug·JSON·manifest·루트 불일치는 산출물 쓰기 전에 오류. 커리큘럼 HTML과 manifest는 같은 루트에 저장.
- 기존 프로젝트에서 init 재실행: 커리큘럼 수정과 신규 생성 구분부터 확인. 기존 문서·학습 기록의 묵시적 덮어쓰기 금지.
- `.study/project.json`은 환경·챕터 설정, `.study/state.json`은 진행 상태. 역할이 다르므로 하나로 합치지 않음.

설치가 원본 저장소 symlink이면 변경 후 `/reload`로 새 도구 스키마·프롬프트 적용. 현재 세션의 기존 브라우저 bridge는 reload 시 종료되므로 제출 대기 여부 먼저 확인.

## /study-checkpoint — 현재 학습 갈무리

```text
/study-checkpoint
/study-checkpoint 04
```

- 기본 대상: `.study/state.json`의 활성 챕터. 챕터 번호·slug로 지정 가능
- 항상 **현재 대화 정리 → 구조 검증 → 챕터 checkpoint.md에 추가 → 해당 파일만 커밋 → upstream 푸시 → 원격 커밋 검증**
- 명령은 대화 요약 지시를 현재 agent에 전달. `study_checkpoint_publish`는 명령이 발급한 requestId와 현재 세션이 일치할 때만 Git 작업 수행
- 기록: 현재까지의 요약, 진행 방식·선호, 원 답변/정확한 요지와 보완, 건너뛴 항목, 남은 학습, 재개 지점, 실제 실행 근거 유무
- 확인 수준: `answer_verified`(직접 답변 확인), `self_reported`(이해 자기보고), `explained`(설명 제공), `skipped`(요청으로 건너뜀), `unverified`(미확인). 의미 판단은 agent가 실제 대화 근거로 수행하며 구조 검증이 학습 내용의 진실성을 자동 인증하지 않음
- 기존 checkpoint와 개인 메모는 보존하고 시간순 snapshot 누적. 같은 request의 재시도는 snapshot·커밋 중복 생성 없음
- 공식 phase·실습·시험 완료 상태는 변경하지 않음. 시험 기록·복습 pack이 아니라 **이어서 공부하기 위한 진도 기록**
- README는 교과서 본문으로 유지. checkpoint에 본문 복사나 새 concept.md 생성 금지. 새 퀴즈를 시작하지 않음

### Git 안전 조건과 실패 처리

- 현재 브랜치 upstream 필요. 기존 HEAD와 실제 원격 HEAD가 같아야 함. 기존 미푸시 커밋을 함께 내보내지 않음
- 다른 파일의 스테이징·미커밋 변경은 보존하고 커밋에서 제외
- checkpoint 자체의 미커밋 변경·ignore·symlink, detached HEAD, 모호한 프로젝트/챕터는 중단
- 준비 후 브랜치·HEAD·checkpoint·원격 변경 감지 시 중단. 강제 push·pull·stash·reset 수행 없음
- 저장/커밋/푸시 결과를 각각 보고. 푸시 실패해도 기록·로컬 커밋 유지. 현재 세션에서 같은 requestId로 저장 도구를 재호출해 push 재시도 가능
- `/reload`나 세션 교체는 pending request를 지움. 실패 후 재로드한 경우 기존 로컬 커밋을 확인하고 일반 Git 절차로 복구한 뒤 다시 명령 실행
- 설치가 로컬 소스 symlink라면 `/reload` 후 새 명령 사용 가능

## 상태 파일

```text
.study/
├── project.json       # 환경, shared workspace, 서비스, 챕터 lab mode
├── state.json         # 챕터별 phase 상태
└── assessments/*.json# question/submission/validated grade
```

상태:

```text
not_started → in_progress → awaiting_submission → awaiting_grade → awaiting_review → completed
                                            └→ relearn_required
skipped_understood / blocked
```

기존 프로젝트는 markdown 내용을 읽어 state를 최초 생성한다. `아직`, `대기`, 빈 체크리스트 같은 stub은 완료로 보지 않는다.

## Assessment

- diagnosis/test는 공통 `assessment-template.html` 사용
- question에 `context`, `assumptions`, `learningObjective` 선택 가능
- browser 결과에서 `ready_to_continue`, `explain_first`, `practice_more`, `feels_guessed` preference 전달
- grade는 ID, attempt, 문항 ID, 배점, 점수 합계 검증 후 브라우저에 표시
- extension이 diagnosis.md/test.md와 structured record를 자동 기록
- test attempt는 marker 기반 append-only

## 챕터 노트와 Lab 기록

- 챕터 `README.md`가 학습 개요와 concept 단계의 교과서형 본문을 함께 담는 canonical 문서다. 새 챕터에 `concept.md`를 만들지 않는다. state migration은 기존 프로젝트의 `concept.md`를 호환 입력으로 읽는다.
- 설명·교재 품질 원칙(맥락 먼저 제시, 핵심 한 문장 → 예시·그림 → 보충, 보충은 재구성, 챕터 범위 통제, 용어 통일, 시퀀스 다이어그램 기준)은 `instructions/*.md`가 정본이다. 여러 프롬프트에 같은 문구를 복사하지 않고 phase 지침 로더로 전달한다.
- 프로젝트별 선호(언어·버전·문법 수준·예제 제공 방식·용어)는 각 프로젝트의 AGENTS.md와 루트 README에 기록한다. extension 지침은 도메인 무반 규칙만 담는다.
- `lab/README.md`는 실습 계획, `lab/results.md`는 검증을 통과한 step의 측정 증거와 학습자 관찰/배운 점을 쌓는 결과 노트다.
- `study_lab_verify`는 manifest 파일/산출물/명령/실제 JUnit test 수를 검증하고, 성공 시 observation/takeaway와 검증 결과를 `lab/results.md`에 추가한다. 실패하면 결과를 기록하거나 step을 완료하지 않는다.
- 시험 통과+확인 시 `chapter-evidence.ts`가 README 개념·최종 시험·lab 기록 검증. 누락 증거는 blocked 사유지만 `review/README.md` 생성 실패는 경고이며 시험 완료 유지.
- README는 오프라인 단권화 교재. 중복 study-pack 신규 생성 폐지. 기존 pack 원본 유지, 고유 회상 구역은 legacy-recall.md로 멱등 보존.
- 테스트 수·출력은 extension이 기록하고, 관찰·배운 점은 학습자가 제공한다. 확인하지 않은 로그나 결론을 만들지 않는다.

도구:

- `study_preflight`: Java/Gradle/Docker/전용 서비스 검사
- `study_lab_verify`: 파일·산출물·명령·실제 JUnit test count 검증 및 step 결과 기록
- `study_lab_step_update`: `in_progress`, `blocked`, `skipped_understood` 기록
- `study_review_refresh`: schedule.md 원본으로 정답 비노출 `review/README.md` 갱신. 통과+ack 시험의 별도 증거 검증 후 상태 복구 가능.
- `study_pack_refresh`: deprecated 호환 alias. 시작 페이지만 생성하며 새 pack 생성 없음.

`skipped_understood`는 reason/evidence가 필수이며 README 내용은 삭제하지 않는다.

## 고정 회차형 복습

- `/study-review`: 매 회차 STT/텍스트 선택 및 중간 전환. self-lecture는 실제 구두 설명 훈련, 텍스트 회상도 복습 회차 완료 가능.
- 공통: 문서 없는 핵심 개념 회상 → 판정 → 필요한 보충. 회차별 강조점은 변경하되 같은 개념 반복 유지.
- STRONG은 이번 보충 불필요 의미. 이후 회차 반복 대상 유지. 독립 지연 회상/힌트 후/교정 직후 결과 분리.
- 간격·기준일·시간대는 학습자 합의 전 자동 지정 없음. 기한 경과는 실제 수행일 기록, 밀린 회차 몰아치기 금지.
- 교재·정답·개인 오답 본문은 시작 페이지에 복사하지 않음. 일정은 schedule.md 하나, 회차 기록은 sessions/r1.md 등 append-only.
- 일정 등록은 in_progress, 모든 회차 실제 수행과 명시적 주기 완료로 completed. 장기 기억 정착 인증 아님.
- 시작 페이지 관리 구역 밖 메모 유지. 기존 비관리 README 덮어쓰기 중단. 기존 고유 기록 먼저 보존.
- 로드만으로 기존 state.json을 자동 강등하지 않음. `study_review_refresh` 호출 시 schedule 원본·회차 파일로 review 상태 동기화, active core chapter/phase 유지. 날짜만 등록된 기존 일정은 in_progress로 추정.

```text
review/
├── README.md         # 정답 비노출 현재 위치·개념 이름·원문/기록 링크
├── schedule.md       # 일정 원본 및 고정 표 (prompts/study-review.md 참고)
├── sessions/r1.md    # 개념별 원 응답·판정·교정·입력 모드
├── learning-gaps.md  # 본 학습 범위 밖 항목
└── legacy-recall.md  # 기존 pack 고유 기록 보존 (있을 때만)
```

구형 blank-recall/gap-fill/self-lecture/analogy-lock 문서는 과거 기록으로 유지. 학습 프로젝트 자동 마이그레이션은 페이지 갱신 호출 시에만 수행.

## 테스트

```bash
cd runtime/pi/extensions/study
node --test 'tests/**/*.test.ts'
```

Node.js 22의 TypeScript 실행을 사용. 일반 실행은 Pi 의존성 없이 core·HTTP·prompt 테스트 수행. `tests/integration/extension-registration.test.ts`의 host 테스트는 Pi를 찾지 못하면 명시적으로 skip.

Pi가 전역 npm 경로에 설치된 개발 환경에서는 다음 명령으로 host 테스트까지 실행:

```bash
NODE_PATH="$(npm root -g)" node --test 'tests/**/*.test.ts'
```

`tests/**/*.test.ts`는 Node.js 22가 확장하도록 인용. 셸의 globstar 설정에 의존하지 않음. `tests/integration/directory-layout.test.ts`에서 루트 진입점·기능별 분류·프로덕션/테스트 경계 확인.

host 테스트는 설치된 Pi의 `jiti`·`typebox`로 실제 entry point를 로드하고 명령·도구 등록, HTML 생성, 세션 재사용을 확인. 브라우저 실행은 대체 함수 사용, 실제 학습 프로젝트는 변경하지 않음.

포맷 검사/정리(Prettier 3 사용 가능 환경):

```bash
prettier --check 'index.ts' 'src/**/*.ts' 'tests/**/*.ts'
prettier --write 'index.ts' 'src/**/*.ts' 'tests/**/*.ts'
```

저장소 루트 검증:

```bash
bash scripts/check-resources
git diff --check
```
