# 학습 갈무리

현재 대화(학습자의 메시지·주석 답변 포함), 기존 checkpoint, 챕터 README와 진도 기록을 읽어 학습 내용을 갈무리한다.

- 새 퀴즈나 다음 학습을 시작하지 않는다. 개념 파일 본문을 checkpoint에 복사하지 않는다.
- 실제 답변과 보완을 기록하고, 관찰하지 않은 실행·성공·통과를 만들지 않는다. 상태별 근거를 분리한다:
  - answer_verified: 학습자의 직접 답변으로 확인. 실행 검증과는 다름
  - self_reported: 설명 후 이해했다고 자기보고. 별도 적용 답변 확인은 아님
  - explained: 보완 설명 제공, 이해 확인 답변 없음
  - skipped: 학습자 요청으로 건너뜀. 검증 통과로 처리하지 않음
  - unverified: 미응답 또는 아직 확인 안 됨
- topics에는 주제·status·학습자 원 응답 또는 정확한 요지(evidence)·보완과 남은 한계(takeaway)를 넣는다.
- summary, learningMode, remaining(남은 항목), nextAction(재개 지점), executionEvidence(실제 실행 근거 또는 실행 없음)를 채운다.
- 대화에 없는 답변·날짜·점수·미수행 실습을 추측하지 않는다. 불확실하면 unverified.
- 진행 방식과 설명·난도 선호, 미해소 gap과 질문 자체의 모호함, 건너뛴 이유를 보존한다.
- 기존 기록에만 있는 내용은 그 기록을 근거로 구분하고, 미확인 항목을 이해 완료로 바꾸지 않는다.
- phase·lab·test 완료 상태를 바꾸지 않는다. README·state·다른 파일을 따로 편집하지 않는다.
- 정리한 구조화 객체를 JSON 문자열 recordJson으로 만들어 반드시 `study_checkpoint_publish`를 호출한다.
- 도구가 checkpoint만 저장·검증·커밋·푸시한다. Bash로 git add/commit/push를 따로 하지 않는다.
- 푸시 실패면 저장·커밋·푸시를 구분해 보고한다. 같은 requestId로 재시도할 수 있다.
- 완료 후 파일 경로·커밋·푸시 결과·다음 재개 지점만 간단히 보고한다.
