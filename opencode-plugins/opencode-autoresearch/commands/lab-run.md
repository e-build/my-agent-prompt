---
description: Bilevel Autoresearch 이너 루프를 시작한다. TAG는 실험 세션 이름 (선택적)
agent: lab-orchestrator
---

# /lab-run $ARGUMENTS

autoresearch 스킬을 로드하고 이너 루프를 시작한다.

## 사전 확인

1. `autoresearch.yaml` 읽기 — 없으면 `/lab-init` 실행 안내 후 중단
2. `workspace/state.json` 읽기 — 없으면 초기화
3. `git status` — 미커밋 변경사항 경고
4. `evaluate.command` 실행 가능 여부 확인

## 실험 태그

`$ARGUMENTS`가 있으면 태그로 사용, 없으면 타임스탬프 자동 생성.

## 실행

autoresearch 스킬 프로토콜에 따라 이너 루프를 시작한다.
루프 종료 조건: `max_cycles` 도달, `/lab-stop`, 또는 stuck 후 전략 없음.

각 사이클마다 한 줄 출력:
```
[lab] cycle=<N> status=<keep|discard|error> metric=<value> strategy=<이름>
```
