# study extension

Pi용 학습 확장. `/study-init`, `/study-chapter`, `/study-review` 슬래시 명령과 학습 설계 미리보기, 사전진단, 학습 완료 테스트 브라우저 세션을 제공한다.

## 구성

```
study/
├── index.ts                    # curriculum/diagnosis/test tools, 로컬 HTTP server, grade bridge
├── assessment-core.ts          # 공통 schema validation, marker/pass/idempotency helpers
├── assessment-core.test.ts     # node:test 단위 테스트
├── prompts/
│   ├── study-init.md           # /study-init
│   ├── study-chapter.md        # /study-chapter
│   └── study-review.md         # /study-review
└── assets/
    ├── curriculum-template.html# 학습 설계 미리보기 UI 템플릿 (self-contained)
    └── assessment-template.html# diagnosis/test 공통 UI 템플릿 (self-contained)
```

`resources_discover`로 `prompts/`를 Pi에 노출하며, 파일명이 그대로 슬래시 명령명이 된다.

## 동작

`/study-init {학습주제}`는:

1. 구조화 질문 도구(`ask_user_question`)로 짧은 학습 설계 브리프를 확정한다.
2. 대표 자료의 학습 순서와 개념 의존성을 조사해 README/SETUP/챕터 구조를 만든다.
3. `CurriculumPreview` JSON을 구성하고 `study_curriculum_open` tool을 호출한다.
4. tool이 `study-{slug}/curriculum.html`을 생성하고 로컬 HTTP server로 **브라우저를 자동으로 연다**.
5. 학습자는 진단 HTML과 같은 무드의 브라우저 화면에서 전체 목차, 방향, Phase, 챕터, 개념 관계도를 확인한다.
6. “이 방향으로 시작 →”을 누르면 `CURRICULUM_REVIEWED` 신호가 현재 Pi 세션에 주입된다.
7. “방향 조정 요청”을 보내면 `CURRICULUM_REVISION_REQUESTED` 신호가 주입되고, Pi가 필요한 파일만 수정한 뒤 미리보기를 다시 연다.

`/study-chapter {챕터} diagnosis`는:

1. 챕터 학습 목표를 읽고 `DiagnosisQuestionSet` JSON을 구성한다.
2. `study_diagnosis_open` tool을 호출해 템플릿에 JSON을 주입하고 `ch-{slug}/diagnosis.html`을 생성한다.
3. 로컬 HTTP server(127.0.0.1, random port)를 시작해 **브라우저를 자동으로 연다**.
4. 학습자가 브라우저에서 답안을 작성하고 "AI에게 제출"을 누르면 `POST /submit`이 이를 받아 `pi.sendUserMessage()`로 현재 Pi 세션에 주입한다.
5. AI가 채점한 뒤 응답 끝에 `<!--DIAGNOSIS_GRADE_JSON_START--> ... <!--DIAGNOSIS_GRADE_JSON_END-->` 마커를 포함한다.
6. `message_end` 핸들러가 마커를 추출해 브라우저의 `GET /result` polling이 채점 결과(정답/해설/보완 포인트)를 표시한다.
7. 학습자는 결과 화면에서 개념 학습에서 더 깊게 다룰 문항을 `pinpoint`하고 문항별 comment를 남길 수 있다.
8. 학습자가 `Pi에서 개념 학습 시작 →`을 누르면 `POST /ack`이 `DIAGNOSIS_RESULTS_REVIEWED` 신호를 현재 Pi 세션에 주입한다. 이때 `learnerPinpoints`도 함께 전달한다.
9. 브라우저는 3초 카운트다운 후 `window.close()`를 best-effort로 시도하고, 실패해도 종료 화면으로 전환한다.

`/study-chapter {챕터} test`는:

1. concept/lab 범위에서 변형·판단 중심 `TestQuestionSet`(보통 5~8문항, 100점, passScore 70)을 구성한다.
2. `study_test_open`이 `ch-{slug}/test.html`을 만들고 브라우저를 자동으로 연다.
3. 제출 시 `TEST_SUBMISSION_RECEIVED`가 현재 Pi 세션에 들어오며, AI는 `test.md`에 문제·답안·채점 결과를 attempt 단위로 누적한다.
4. AI 응답의 `TEST_GRADE_JSON`을 extension이 정확한 test ID/attempt에 연결해 같은 브라우저에 표시한다.
5. 통과 시 “Pi에서 복습 시작”, 미달 시 “Pi에서 부족한 개념 재학습” CTA가 `TEST_RESULTS_REVIEWED`를 보낸다.
6. 미달 시 전체 학습을 반복하지 않고 weaknesses만 보강한 뒤 새 변형 문제로 다음 attempt를 연다.

전체 과정에서 사용자가 직접 파일을 열거나 복사/붙여넣기 할 필요가 없다.

`study_curriculum_open`, `study_diagnosis_open`, `study_test_open` tool이 보이지 않으면 현재 Pi 세션이 extension 변경사항을 아직 로드하지 않은 상태다. `/reload`를 먼저 실행하고, 그래도 없으면 `bash pi/install.sh --restore` 후 다시 `/reload` 한다. 이 경우 수동 HTML 열기나 임시 서버 작성으로 우회하지 않는다.

## 학습 산출물 흐름

표준 챕터 산출물은 아래 순서로 남긴다.

```text
diagnosis.md  →  concept.md  →  lab/README.md + lab outputs  →  test.md  →  review/
```

- `diagnosis.md`: 사전진단 점수, 약점, 권장 학습 깊이.
- `concept.md`: 개념 학습 후 생성되는 교과서형 개념 노트. 채팅 요약이 아니라, 나중에 여러 챕터의 concept.md만 모아도 학습 가능한 독립 문서로 작성한다.
- `lab/README.md`: 실습 목표, 단계, 완료 조건, 산출물 체크리스트.
- `test.md`: attempt별 문제 스냅샷, 학습자 답안, 문항별 채점/해설, 점수와 통과 여부. canonical test history.
- `test.html`: `study_test_open`이 생성하는 임시 인터랙티브 UI.
- `review/`: blank recall, gap-fill, self-lecture, analogy lock, schedule.

## 설치

```bash
# extension 디렉토리를 Pi가 auto-discover하는 위치에 심링크
ln -s /path/to/this/directory ~/.pi/agent/extensions/study
/reload
```

## 참고

- Plannotator(`backnotprop/plannotator`)의 "로컬 서버 + 브라우저 UI + 명시적 제출" 패턴을 축소 적용했다.
- 로컬 server는 session-scoped이다. 첫 curriculum/diagnosis/test tool 호출 시 시작하고 `session_shutdown`에서 종료한다.
- 채점 결과는 `ch-{slug}/diagnosis.md` 하단에 기록된다. canonical source는 diagnosis.md다.
- 학습자가 결과 화면에서 강조한 `pinpoint`는 개념 학습 방향을 바꾸지 않고 관련 설명의 비중을 조금 높이는 신호로 사용한다.
- 개념 학습이 lab/test로 넘어가기 전 `ch-{slug}/concept.md`를 생성/최신화한다.
- lab 시작 전 `ch-{slug}/lab/README.md`를 체크리스트로 생성/최신화한다.
- diagnosis/test 제출과 결과 확인 endpoint는 idempotent하다. grade는 marker에 포함된 명시적 session ID(test는 attempt 포함)가 일치할 때만 연결된다.

## 테스트

```bash
node --test --experimental-strip-types pi/extensions/study/assessment-core.test.ts
```
