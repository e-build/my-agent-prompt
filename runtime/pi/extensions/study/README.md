# study extension

브라우저 assessment와 구조화된 학습 상태를 연결하는 Pi extension.

## 목차

- [구성](#구성)
- [/study-chapter 동작](#study-chapter-동작)
- [/study-checkpoint — 현재 학습 갈무리](#study-checkpoint--현재-학습-갈무리)
- [상태 파일](#상태-파일)
- [Assessment](#assessment)
- [챕터 노트와 Lab 기록](#챕터-노트와-lab-기록)
- [고정 회차형 복습](#고정-회차형-복습)
- [테스트](#테스트)

## 구성

```text
study/
├── index.ts                    # browser bridge + tools
├── study-command.ts            # 기존 /study-chapter를 실제 command로 실행
├── checkpoint-command.ts       # /study-checkpoint와 승인된 저장 도구
├── checkpoint-core.ts          # 근거별 진도 기록 + 해당 파일만 커밋·푸시
├── study-state.ts              # .study/state.json + markdown migration
├── project-manifest.ts         # .study/project.json (stack/workspace/lab mode)
├── assessment-core.ts          # question schema/validation
├── assessment-grade.ts         # grade 검증 + diagnosis/test 자동 기록
├── preflight.ts                # Java/Gradle/Docker/전용 서비스 검사
├── lab-core.ts                 # lab manifest + 완료 증거 검증
├── instructions/               # phase별 짧은 agent 지시
├── prompts/                    # /study-init, /study-review
└── assets/                     # curriculum/assessment browser UI
```

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
node --test *.test.ts
```
