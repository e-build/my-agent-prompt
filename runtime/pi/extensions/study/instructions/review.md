# Review phase

- `/study-review`의 지시로 위임. 다섯 활동을 한 세션에서 연속 완료시키지 않음.
- 등록된 study 루트: 통합 복습. 지식별 일정(루트 `review/items/`), 간격 +1 / +3 / +7 / +14일, 마지막 회차 후 종료, 틀리거나 힌트 후 맞히면 그 지식만 처음 간격부터, 하루 양 제한 없음. `study_review_next` → `study_question_prepare`(purpose=review) → `study_answer_record`.
- 미등록 프로젝트(기존 방식): `review/README.md` 시작 페이지와 `review/schedule.md` 일정 원본. 미설정이면 간격·기준일·시간대 합의 전 날짜 생성 금지. 고정 회차 표 형식 유지.
- 매 회차 STT/텍스트 선택 질문, 중간 전환 허용. self-lecture는 실제 구두 설명, 텍스트 회상도 회차 완료 가능.
- 핵심 개념 반복 회상 → 판정 → 필요한 보충 → 교정 확인. STRONG도 다음 회차 대상이며 장기 기억 인증이 아님.
- 독립 지연 회상과 교정 직후 확인 구분. 최초 응답은 덮어쓰지 않고 추가 기록.
- README 단권화 교재 유지. study-pack 신규 생성 금지. 기존 고유 기록은 보존하며 원본 삭제 금지.
- 범위 밖 공백은 학습 공백으로 분리. 일정 등록만으로 review 완료 처리 금지.
- 일정·회차 기록 변경 후 `study_review_refresh`로 정답 비노출 시작 페이지 갱신.
