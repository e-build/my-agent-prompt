# External Skills Implementation Plan

## 목차

- [목표와 구조](#목표와-구조)
- [구현 순서](#구현-순서)
- [검증](#검증)
- [구현 결과와 운영 문서](#구현-결과와-운영-문서)

## 목표와 구조

**Goal:** 외부 스킬 원본 복사 없이 참조 목록과 명시적 동기화 명령으로 관리.

**Architecture:** `resources/external-skills.json`에 저장소 URL·추적 브랜치·선택 경로 등록. 전체 upstream 클론은 저장소 밖에 보관하고, 선택한 스킬만 표준 위치와 Claude 브릿지에 연결. 최초 설치 이후 갱신은 `--update`로만 수행.

**Tech Stack:** Python 3 표준 라이브러리, Git.

## 구현 순서

1. `scripts/tests/test-sync-external-skills.py`에 로컬 Git fixture 기반 테스트 작성.
   - 최초 설치와 브릿지, 명시적 갱신, 반복 실행, 로컬 수정 및 링크 충돌 거부 검증.
   - 실행: `python3 scripts/tests/test-sync-external-skills.py`
   - 구현 전 실패 확인 후 다음 단계 진행.
2. `scripts/sync-external-skills` 구현.
   - Git clone 및 fast-forward-only update.
   - 원격 URL·브랜치 확인, 로컬 변경 거부, 안전한 링크 생성.
   - upstream 설치 스크립트 실행·원본 수정·자동 업데이트 없음.
3. `resources/external-skills.json`에 외부 저장소 URL·추적 브랜치·분류·선택 스킬 경로 등록.
   - 구체적인 설치 대상은 과거 계획이 아닌 현재 사용 목록 기준.
4. `resources/external-skills.md`에 관리 계약·사용법·런타임 호환성 주의사항 기록.
   - `AGENTS.md`에는 관리 경계와 설치 명령만 추가.

## 검증

- 신규 테스트 전부 통과.
- `bash scripts/check-resources --quiet` 통과 여부 확인.
- 실제 원본을 복사하지 않았고 선택한 스킬만 목록에 있는지 확인.
- 실제 외부 설치는 별도 명령으로 수행하며, 테스트에서는 사용자 전역 디렉터리 변경 금지.

## 구현 결과와 운영 문서

**상태: 참조 기반 관리 구현 및 오프라인 검증 완료.** 아래 구현 순서는 최초 작업 기록이며, 새 세션에서 다시 구현할 TODO가 아님.

- `resources/external-skills.json`: upstream과 선택 스킬 참조 등록 완료.
- `scripts/sync-external-skills`: 최초 클론·선택 링크·명시적 업데이트 및 보호 규칙 구현 완료.
- `scripts/tests/test-sync-external-skills.py`: 로컬 Git fixture 테스트 12개 통과.
- `bash scripts/check-resources --quiet`: 기존 자원 구조 검사 통과.
- 사용자 전역 경로 설치 및 외부 스킬의 실제 실행: 이 구현 작업에서는 수행하지 않음. 이후 요청 시 로컬 상태를 재확인하고 별도 검증 필요.

새 세션의 운영 기준은 이 계획이 아니라 [외부 스킬 관리](../../resources/external-skills.md)와 [사용 목록](../../resources/external-skills.json). 빠른 시작은 [루트 README](../../README.md), 에이전트 요청 처리 기준은 [AGENTS.md](../../AGENTS.md#외부-스킬-요청-처리) 참고.

문서 반영 범위:

- 루트 안내: 직접 관리 스킬과 외부 스킬 설치 구분 및 자연어 요청 예시.
- 에이전트 지침: 이전 대화에 의존하지 않는 등록·설치·갱신·조회 처리 기준.
- 운영 문서: 구현 범위·요청별 명령·실패 시 처리·검증 경계.
- 설치 스크립트 안내: 외부 스킬 별도 명령으로 연결. 기존 일반 설치에 자동 갱신 추가 없음.
