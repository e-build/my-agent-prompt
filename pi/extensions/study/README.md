# study extension

Pi용 학습 확장. `/study-init`, `/study-chapter`, `/study-review` 슬래시 명령과 인터랙티브 사전진단 브라우저 세션을 제공한다.

## 구성

```
study/
├── index.ts                    # extension: resources_discover, study_diagnosis_open tool, 로컬 HTTP server, grade 추출
├── prompts/
│   ├── study-init.md           # /study-init
│   ├── study-chapter.md        # /study-chapter
│   └── study-review.md         # /study-review
└── assets/
    └── diagnosis-template.html # 사전진단 UI 템플릿 (self-contained)
```

`resources_discover`로 `prompts/`를 Pi에 노출하며, 파일명이 그대로 슬래시 명령명이 된다.

## 동작

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

전체 과정에서 사용자가 직접 파일을 열거나 복사/붙여넣기 할 필요가 없다.

## 학습 산출물 흐름

표준 챕터 산출물은 아래 순서로 남긴다.

```text
diagnosis.md  →  concept.md  →  lab/README.md + lab outputs  →  test.md  →  review/
```

- `diagnosis.md`: 사전진단 점수, 약점, 권장 학습 깊이.
- `concept.md`: 개념 학습 후 생성되는 교과서형 개념 노트. 채팅 요약이 아니라, 나중에 여러 챕터의 concept.md만 모아도 학습 가능한 독립 문서로 작성한다.
- `lab/README.md`: 실습 목표, 단계, 완료 조건, 산출물 체크리스트.
- `test.md`: 학습 완료 확인 문제와 결과.
- `review/`: blank recall, gap-fill, self-lecture, analogy lock, schedule.

## 설치

```bash
# extension 디렉토리를 Pi가 auto-discover하는 위치에 심링크
ln -s /path/to/this/directory ~/.pi/agent/extensions/study
/reload
```

## 참고

- Plannotator(`backnotprop/plannotator`)의 "로컬 서버 + 브라우저 UI + 명시적 제출" 패턴을 축소 적용했다.
- 로컬 server는 session-scoped이다. 첫 `study_diagnosis_open` 호출 시 시작하고 `session_shutdown`에서 종료한다.
- 채점 결과는 `ch-{slug}/diagnosis.md` 하단에 기록된다. canonical source는 diagnosis.md다.
- 학습자가 결과 화면에서 강조한 `pinpoint`는 개념 학습 시작 시 최우선으로 다룬다.
- 개념 학습이 lab/test로 넘어가기 전 `ch-{slug}/concept.md`를 생성/최신화한다.
- lab 시작 전 `ch-{slug}/lab/README.md`를 체크리스트로 생성/최신화한다.
