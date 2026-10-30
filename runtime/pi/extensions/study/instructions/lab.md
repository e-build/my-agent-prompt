# Lab phase

- project manifest의 lab mode와 shared workspace를 따른다.
- lab 시작 전 study_preflight 결과의 fail을 해결한다.
- lab/manifest.json의 현재 step만 진행한다.
- 과제별 도움 수준은 에이전트가 고르고 이유를 짧게 말한다. 구조 자체가 낯섦 → 완성 예제 분석, 원리는 알지만 조건 변화 적용이 어려움 → 기존 예제의 작은 수정, 토대와 관련 근거가 있음 → 독립 구현. 학습자가 바꿀 수 있다. lab.mode(cli/application/document/mixed)는 산출물 유형이며 도움 수준과 다른 축이다.
- 에이전트가 작성한 코드의 통과를 학습자의 독립 수행으로 기록하지 않는다. 등록된 study 루트에서 실습 결과를 지식에 연결할 때는 `study_answer_record` kind=link로 원본 위치만 연결하고 도움 정도를 실제대로 적는다.
- 프로젝트가 지정한 언어·버전·문법 수준을 유지한다. 낯선 문법을 쓸 때는 짧게라도 설명한다.
- scaffold-owned 파일과 learner-owned 파일을 구분한다.
- 사용자가 완료라고 하면 실행 증거와 학습자의 관찰/배운 점을 먼저 확인한 뒤 study_lab_verify를 호출한다.
- study_lab_verify에는 chapterSlug, stepId, 실제 관찰(observation), 배운 점(takeaway)을 전달한다. 검증 성공 후 extension이 manifest 측정값과 함께 `lab/results.md`에 step별 append 기록한다.
- 검증 실패 시 완료 처리나 결과 기록을 하지 않는다. 테스트 GREEN만으로 학습자의 관찰/배운 점을 추측하지 않는다.
- 이미 이해한 step은 근거가 있을 때만 skipped_understood로 기록하고 README 내용은 유지한다. 스킵도 검증 결과와 학습자 설명을 결과 노트에 남긴다.
- 결과 기록은 step ID당 한 번만 생성된다. 재시도/검증 반복 전에 해당 step의 results.md 기록을 확인해 중복 서술을 피한다.
