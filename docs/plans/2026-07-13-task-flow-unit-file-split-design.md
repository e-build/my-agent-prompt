# Task Flow Unit File Split — Design

- 생성일: `2026-07-13`
- 상태: `초기안 — 2026-07-13 개정됨 (큰 분류 인덱스를 디렉토리 안 `index.md`로 이동). 본문 A안은 초기안이며, 현재 정본은 스킬 스펙(`shopl-dev-task-flow/SKILL.md`) 참조.`
- 관련 스킬: `shopl-dev-task-flow`, `shopl-dev-task-flow-unit`

## 배경

현재 `shopl-dev-task-flow`의 큰 분류 상세 파일 하나가 Orientation + 작은 분류별 Plan + 승인 기록 + 실행 결과 + 검증 결과 + diff/커밋 메모까지 전부 담고 있다.

문제:

- 큰 분류가 커질수록 파일이 너무 길어진다.
- 다음 작은 분류를 진행할 때 이전 작은 분류 로그가 시야를 방해한다.
- `shopl-dev-task-flow-unit`의 책임(작은 분류 단위 실행)이 파일 구조에 반영되지 않는다.

## 목표

큰 분류 파일은 컨테이너/인덱스로만 두고, 작은 분류 단위 실행 기록은 별도 파일로 분리한다.

## 파일 구조 (A안 채택)

```text
task-workflow.md
task-workflow/
  01-SH-21819.md
  01-SH-21819/
    01-공통-reader.md
    02-공통-raw-source.md
    03-공통-batch-assignment.md
    04-공통-aggregation-policy.md
    05-api.md
```

역할 분리:

| 파일 | 역할 |
|------|------|
| `task-workflow.md` | 전체 큰 분류 인덱스 |
| `task-workflow/01-SH-21819.md` | 큰 분류 Orientation + Unit Index + 큰 분류 검증 요약 (본문 로그 금지) |
| `task-workflow/01-SH-21819/02-공통-raw-source.md` | 작은 분류 1개의 Plan / 승인 / 구현 / diff / 검증 / 커밋 기록 |

규칙:

- 큰 분류 파일명과 unit 디렉토리명은 같은 prefix(`01-SH-21819`)를 쓴다.
- 큰 분류 파일에는 긴 실행 로그를 쓰지 않는다.
- 작은 분류 상태/링크/커밋 해시만 큰 분류 파일에 요약한다.

## 템플릿

### 큰 분류 파일

```markdown
# 1. 일간 상단 근무지 현황 집계 API

- 작업 키: `SH-21819`
- 트래커 모드: `jira`
- 상태: `진행 중`
- 소스: `backend-implementation-breakdown.md §16 큰 분류 1`

## Orientation

- 난이도/공수: `8점`
- 실행 순서:
- 공통 결정:
- 주의:

## Unit Index

| 순번 | 작은 분류 | 상태 | 상세 파일 | 커밋 |
|------|-----------|------|-----------|------|
| 1 | [공통/Reader] 조회 가능 활성 근무지 Reader | 완료 | [상세](./01-SH-21819/01-공통-reader.md) | `<hash>` |
| 2 | [공통/raw source] raw attendance source | 대기 | [상세](./01-SH-21819/02-공통-raw-source.md) | - |

## 큰 분류 검증 결과

대기.

## Open Issues

없음.
```

### 작은 분류 unit 파일

```markdown
# 1-2. [공통/raw source] raw attendance source

- 큰 분류: `01-SH-21819`
- 작업 키: `SH-21819`
- 트래커 모드: `jira`
- 상태: `대기`
- 커밋 접두사: `SH-19400`
- 원문 작은 분류: `[공통/raw source] raw attendance source`

## Unit Goal

## Plan

- 목표:
- 대상 파일:
- 구현 접근:
- 검증 방법:
- 리스크:

## User Review

대기.

## Execution Result

대기.

## Diff Review

대기.

## Verification Result

대기.

## Commit

- 커밋: `none`

## Open Issues

없음.
```

## 작은 분류 전용 상태 모델

큰 분류 상태(`대기 / 진행 중 / 검증 중 / 완료 / 차단됨 / 보류 / 취소`)와 분리하여, 작은 분류는 더 촘촘한 상태를 쓴다.

| 상태 | 의미 |
|------|------|
| `대기` | unit 시작 전 |
| `계획 작성` | unit 파일에 Plan 작성 중 |
| `승인 대기` | 사용자 승인 대기 |
| `진행 중` | 승인 후 구현 중 |
| `diff 검토 중` | 구현 완료, diff 제시 후 판단 대기 |
| `diff 거절` | diff 수정 필요, 같은 unit에서 재작업 |
| `검증 중` | diff 승인/커밋 후 unit 검증 중 |
| `완료` | unit 완료, 큰 분류 파일에 요약 반영됨 |
| `차단` | 이 unit 진행에 필요한 결정/정보 부족 |

규칙:

- 작은 분류 상태는 트래커(Jira/Linear)와 동기화하지 않는다.
- 트래커 상태는 큰 분류/티켓 단위에서만 관리한다.
- 작은 분류 상태는 로컬 진행 제어 전용이다.
- `diff 거절`은 큰 분류를 `재작업 필요`로 바꾸지 않는다.
- unit이 `차단`일 때만 큰 분류에 차단 여부를 전파할지 판단한다.

## unit 파일명 규칙 (짧은 slug형 채택)

형식:

```text
<unit순번>-<짧은-slug>.md
```

slug 규칙:

1. 순번은 2자리 숫자 (`01-`, `02-`, `03-`).
2. 태그는 `/`를 `-`로 변환. `[공통/raw source]` → `공통-raw-source`.
3. 한글/영문 혼용 허용.
4. 너무 긴 설명은 생략. 파일명은 짧게.
5. 중복 시 짧은 suffix 추가. `05-api.md`, `06-api-modal.md`.

예시 변환:

| 원문 작은 분류 | unit 파일명 |
|----------------|-------------|
| `[공통/Reader] 조회 가능 활성 근무지 Reader` | `01-공통-reader.md` |
| `[공통/raw source] raw attendance source` | `02-공통-raw-source.md` |
| `[공통/배치] 구성원 기준 근무지 배치 결정` | `03-공통-batch-assignment.md` |
| `[공통/집계정책] 항목별 기준 근무지 매핑 정책` | `04-공통-aggregation-policy.md` |
| `[API] 일간 상단 근무지 현황 집계 API` | `05-api.md` |

원문 제목은 unit 파일 내부 메타데이터에 보존한다.

## 실행 흐름

```text
1. task-flow가 task-workflow.md에서 다음 큰 분류 선택
2. task-flow가 task-workflow/01-SH-21819.md 읽음
3. Orientation 확인
4. Unit Index에서 다음 미완료 unit 선택
5. task-flow가 unit 파일 경로(unitFilePath)를 task-flow-unit에 전달
6. task-flow-unit이 unit 파일에 Plan / Review / Execution / Diff / Verification / Commit 기록
7. task-flow-unit이 결과 반환
8. task-flow가 큰 분류 파일의 Unit Index만 업데이트
9. 모든 unit 완료 시 큰 분류 검증
10. task-flow가 task-workflow.md의 큰 분류 상태 업데이트
```

핵심:

- `task-flow-unit`은 큰 분류 파일에 긴 로그를 쓰지 않는다.
- unit 파일 하나만 열고 진행한다.
- 완료 후 부모에게 반환: 상태, 변경 파일, 커밋 해시, 검증 메모, open issues, needsTrackerSync.
- 부모는 큰 분류 파일에 요약만 반영한다.

## 스킬 규칙 변경

### `shopl-dev-task-flow` (부모)

추가 규칙:

- 큰 분류 상세 파일은 unit 본문 로그를 담지 않는다. Orientation + Unit Index + 큰 분류 검증 요약만.
- 작은 분류마다 `task-workflow/<큰분류키>/<NN>-<slug>.md` 파일을 생성한다.
- 부모가 자식에게 넘겨주는 값에 `unitFilePath`를 추가한다.
- 작은 분류 완료 이벤트를 받으면 큰 분류 파일의 Unit Index 행만 업데이트한다 (상태/커밋 해시).
- 추적 문서 정책 섹션에 큰 분류 디렉토리 구조와 unit 파일 명명 규칙을 추가한다.

### `shopl-dev-task-flow-unit` (자식)

추가 규칙:

- 호출 시 받은 `unitFilePath`를 정본으로 사용한다.
- Plan / User Review / Execution / Diff / Verification / Commit은 모두 unit 파일에 기록한다.
- 큰 분류 파일에는 긴 실행 로그를 쓰지 않는다.
- 완료 시 반환 계약에 `unitFilePath`를 포함한다.
- 작은 분류 전용 상태 모델을 unit 파일 헤더와 큰 분류 Unit Index에 사용한다.

## 기존 문서 마이그레이션 (보수적 분리 채택)

이미 진행 중인 `01-SH-21819.md`에 `[공통/Reader]` 작업 기록이 들어 있다.

마이그레이션:

1. `01-SH-21819.md`는 큰 분류 컨테이너로 축소 (Orientation + Unit Index + 큰 분류 검증 요약).
2. 기존 `[공통/Reader]` 관련 Plan/Execution/Verification/User Review를 `task-workflow/01-SH-21819/01-공통-reader.md`로 이동.
3. 다음 작업인 `[공통/raw source]`는 `task-workflow/01-SH-21819/02-공통-raw-source.md`로 새 템플릿 생성.
4. 나머지 작은 분류도 새 빈 unit 파일 생성.
5. `task-workflow.md`는 1번 작업 최근 메모만 유지 (`다음=[공통/raw source]`), 상세 링크는 `01-SH-21819.md` 유지.

이 마이그레이션은 별도 작업으로 진행한다. 이 문서는 스킬 설계까지만 다룬다.

## 결정 요약

| 항목 | 결정 |
|------|------|
| 구조 | 초기안 A(파일 옆 디렉토리) → **개정(2026-07-13): 큰 분류 인덱스를 `<큰분류키>/index.md`로 이동, unit 파일과 같은 디렉토리 안에 배치** |
| 디렉토리명 | 큰 분류 파일과 동일 prefix (`01-SH-21819/`) |
| 큰 분류 파일 역할 | Orientation + Unit Index + 큰 분류 검증 요약 (본문 로그 금지) |
| 작은 분류 파일 역할 | Plan / 승인 / 구현 / diff / 검증 / 커밋 전부 |
| 작은 분류 상태 모델 | 전용 (대기/계획 작성/승인 대기/진행 중/diff 검토 중/diff 거절/검증 중/완료/차단) |
| unit 파일명 | 짧은 slug형 (`02-공통-raw-source.md`) |
| 기존 문서 마이그레이션 | 보수적 분리 (Reader만 이동, 나머지 새 템플릿) |
| 스킬 업데이트 | 부모/자식 모두 `unitFilePath` 규칙과 디렉토리 구조 반영 |
