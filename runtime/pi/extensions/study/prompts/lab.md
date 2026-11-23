# 실습

- project manifest의 lab mode와 shared workspace를 따른다.
- 시작 전에 `study_preflight`를 실행하고 fail을 먼저 해결한다.
- `lab/manifest.json`이 없으면 `lab/README.md`(목표 / 단계 / 완료 조건 / 산출물)와 manifest를 만든다. 개념 파일의 "스스로 확인"과 이어지는 과제로 구성한다.
- `lab/manifest.json`의 현재 step만 진행한다. step을 시작할 때 `study_send`(notice)로 목표·할 일·완료 조건을 보낸다.
- 과제별 도움 수준을 고르고 이유를 짧게 말한다. 구조가 낯섦 → 완성 예제 분석, 원리는 알지만 조건 변화 적용이 어려움 → 기존 예제의 작은 수정, 토대가 있음 → 독립 구현. 학습자가 바꿀 수 있다. lab mode는 산출물 유형이고 도움 수준과 다른 축이다.
- 에이전트가 작성한 코드의 통과를 학습자의 독립 수행으로 기록하지 않는다.
- 프로젝트가 정한 언어·버전·문법 수준을 유지한다. 낯선 문법은 짧게라도 설명한다.
- scaffold 소유 파일과 학습자 소유 파일을 구분한다.
- 학습자가 완료라고 하면 실행 증거와 학습자의 관찰·배운 점을 먼저 받은 뒤 `study_lab_verify`를 호출한다. 테스트 통과만으로 관찰·배운 점을 추측하지 않는다.
- 검증 실패 시 완료 처리나 결과 기록을 하지 않는다.
- 이미 이해한 step은 근거가 있을 때만 `study_lab_step_update`(skipped_understood)로 기록한다.
- 결과 기록은 step ID당 한 번이다. 재시도 전에 `lab/results.md`를 확인해 중복 서술을 피한다.
- 모든 step이 끝나면 `study_phase`(action=complete, phase=lab).
