cmux-orchestrator — AI 여러 개를 동시에 부려먹는 도구

Claude Code에서 /cmux 하나로 여러 AI(Claude, Codex, Gemini, GLM
등)를 동시에 지휘합니다.

핵심 기능:
- /cmux 조사 [주제] → 5개 AI가 동시에 조사해서 결과 취합
- /cmux 배정 [작업] → 코딩 작업을 AI별로 분배 (난이도별 자동 배정)
- /cmux 수집 → 전부 끝났는지 확인 후 결과 수집
- /cmux 커밋 → 안전 검증 후 커밋

왜 쓰냐?
혼자 하면 10분 걸릴 조사를 5개 AI가 동시에 해서 2분에 끝남.
코딩도 파일별로 분배하면 5배 빠름.
그리고 GATE 시스템이 물리적으로 강제해서 — 결과 다 안 모았으면 커밋
자체가 차단됨. 대충 넘어가는 거 방지.

설치:
unzip cmux-orchestrator.zip
bash install.sh
cmux 터미널 + Ai(클로드코드) 있으면 바로 사용 가능

from openkakao - 바이브랩스