# study extension

브라우저 assessment와 구조화된 학습 상태를 연결하는 Pi extension.

## 구성

```text
study/
├── index.ts                    # browser bridge + tools
├── study-command.ts            # 기존 /study-chapter를 실제 command로 실행
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
- 챕터 테스트 통과 시 `review/study-pack.md`를 생성한다. README 개념 본문, 모든 완료/스킵 lab step의 결과, 진단/테스트 및 학습 공백이 있어야 한다. `/study-review`는 회상 결과를 이 pack에 누적하고 `study_pack_refresh`로 최신 원본을 반영한다.
- 테스트 수·출력은 extension이 기록하고, 관찰·배운 점은 학습자가 제공한다. 확인하지 않은 로그나 결론을 만들지 않는다.

도구:

- `study_preflight`: Java/Gradle/Docker/전용 서비스 검사
- `study_lab_verify`: 파일·산출물·명령·실제 JUnit test count 검증 및 step 결과 기록
- `study_lab_step_update`: `in_progress`, `blocked`, `skipped_understood` 기록
- `study_pack_refresh`: 검증된 원본들로 복습 묶음 재생성, 기존 회상 섹션 보존

`skipped_understood`는 reason/evidence가 필수이며 README 내용은 삭제하지 않는다.

## 테스트

```bash
cd runtime/pi/extensions/study
node --test *.test.ts
```
