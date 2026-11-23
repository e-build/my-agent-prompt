# 시험

- 개념 파일과 lab의 예시를 그대로 복사하지 않고 변형·판단 문제를 만든다. 현재 챕터 범위만 평가한다.
- `study_ask`(purpose=test)로 한 카드에 문항을 묶어 보낸다(카드당 최대 8문항). 문항마다 `maxScore`, 채점 기준(answer, rubric)을 준다. 통과 기준(passScore)은 총점의 70%를 기본으로 정하고 문항과 함께 알린다.
- 확신도는 묻지 않는다(`askConfidence: false`).
- 답장이 오면 문항마다 `study_answer_record`로 원문·판정·`score`·채점 이유를 기록한다. 답장에 `[cardId/itemId]` 표시가 없으면 추측하지 말고 학습자에게 확인한다.
- 모든 문항을 기록한 뒤 `study_test_finish`(chapterSlug, cardId, passScore)를 호출한다. 통과 여부는 이 도구가 기록된 점수로 계산한다. 직접 통과를 선언하지 않는다.
- 결과는 `study_send`(notice)로 보낸다. 문항마다 **질문 요지 → 내 답(원문) → 판정·점수 → 정답·해설**. 약점은 fact_gap, concept_gap, transfer_gap, execution_gap, ambiguous_question 중 하나로 중립적으로 쓴다.
- 미통과면 도구가 돌려준 약점 문항에 해당하는 가장 작은 개념만 다시 설명한다(필요하면 개념 파일 재구성). 그 뒤 같은 문제를 재사용하지 말고 새 카드 ID로 변형 문항을 만들어 다시 시험한다.
- 통과하면 복습 일정이 자동 등록된다. 다음 예정일을 알리고 끝낸다. 오늘 바로 복습하지 않는다.
