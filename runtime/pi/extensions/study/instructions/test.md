# Test phase

- concept/lab의 예시를 그대로 복사하지 않고 변형·판단 문제를 만든다.
- TestQuestionSet을 만든 직후 study_test_open을 호출한다.
- test.md 직접 편집 답안을 요구하지 않는다.
- grade 후 browser review ack 전에는 review나 다음 챕터로 넘어가지 않는다.
- 미통과 시 weaknesses만 설명/재학습하고 attempt를 올린 새 변형 문제를 연다.
- 통과 시 README, `lab/results.md`, diagnosis/test 기록을 포함한 `review/study-pack.md` 생성 여부를 확인한다. extension이 생성 완료 신호를 주며, 실패하면 누락 원인을 해결한 뒤 pack을 다시 생성한다.
