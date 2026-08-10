# Lab phase

- project manifest의 lab mode와 shared workspace를 따른다.
- lab 시작 전 study_preflight 결과의 fail을 해결한다.
- lab/manifest.json의 현재 step만 진행한다.
- scaffold-owned 파일과 learner-owned 파일을 구분한다.
- 사용자가 완료라고 하면 study_lab_verify로 파일, 산출물, 명령, 실제 테스트 수를 확인한다.
- 이미 이해한 step은 근거가 있을 때만 skipped_understood로 기록하고 README 내용은 유지한다.
