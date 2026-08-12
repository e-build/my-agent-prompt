---
name: shopl-att-record-manual-import
description: |-
  엑셀 출퇴근 데이터를 io_user_attendance_record에 수동 등록하는 실행 SQL을 생성한다.
  검증, 매핑, 충돌 확인, 트랜잭션 삽입, 커밋 전 검증, 롤백 쿼리까지 전체 흐름을 다룬다.
  트리거: "출퇴근 엑셀", "수동 등록", "manual attendance import", "attendance record insert",
  "근태 엑셀 반영", "출퇴근 데이터 입력", "attendance excel", "수동 출퇴근"
---

# shopl-att-record-manual-import

고객사 엑셀 출퇴근 데이터를 운영 DB `io_user_attendance_record`에 수동으로 등록하는 실행 SQL을 생성하는 스킬이다.

직접 DB INSERT는 애플리케이션의 권한 검사, 근태 마감 검사, 알림, 이벤트 발행을 우회한다.
따라서 사전 검증, 2인 검토, 운영 승인 없이 실행하지 않는다.

## 먼저 읽을 소스

1. `api/src/main/kotlin/com/planetory/io/feature/att/service/AttendanceRecordEditFactoryService.kt` — 수동 레코드 생성 규칙 (CHECK_ID 공유, 시간 변환, 플래그)
2. `core/src/main/java/com/shoplworks/shopl/feature/user/entity/IoUserAttendanceRecord.java` — 컬럼 정의
3. `api/src/main/java/com/planetory/io/feature/workplace/mapper/RestWorkplaceMapper.xml` — 기존 INSERT의 UTC 저장 규칙

## 엑셀 입력 포맷

고객사 엑셀은 다음 컬럼을 포함한다:

| 컬럼 | 의미 | 비고 |
|---|---|---|
| `Date` | 기준일 | `YYYY-MM-DD` 또는 Excel 날짜 |
| `Name` | 직원 이름 | 참조용 (매핑 기준이 아님) |
| `Emp ID` | 사번 | `io_user_info.EMP_ID`와 매핑 |
| `Punch-in Time` | 출근 시각 | 현지 시간, `HH:MM` 또는 `HH:MM:SS` |
| `Channel Code` | 출근 채널 코드 | `io_workplace_info.WORKPLACE_CODE`와 매핑 |
| `Punch-out Time` | 퇴근 시각 | 현지 시간 |
| `Channel Code` | 퇴근 채널 코드 | 출근과 다를 수 있음 |
| `Remarks` | 사유 | `MODIFY_MEMO`에 원문 그대로 저장 |

## 매핑 체인

```
Emp ID → io_user_info.EMP_ID → USER_ID
Channel Code → io_workplace_info.WORKPLACE_CODE → WORKPLACE_ID
```

- 출근/퇴근 채널 코드가 다를 수 있으므로 스테이징에 분리 보관한다.
- 1:1 매핑이 아닌 사번/채널 코드가 하나라도 있으면 전체 배치를 중단한다.
- 퇴사자(`IS_DELETE='1'`)는 고객 승인이 있는 경우에만 포함한다.

## 레코드 생성 규칙

`AttendanceRecordEditFactoryService`의 규칙을 따른다:

| 항목 | 출근 레코드 | 퇴근 레코드 |
|---|---|---|
| `INOUT_TYPE` | `'1'` | `'2'` |
| `CHECK_ID` | `<접두사><USER_ID>_<YYYYMMDD>` | 출근과 동일 |
| `ATTENDANCE_TIME` | 현지 출근시간 → UTC | 출근과 동일 |
| `QUITTING_TIME` | NULL | 현지 퇴근시간 `MM:59` → UTC |
| `IS_REQUEST` | `'0'` | `'0'` |
| `IS_MODIFY` | `'1'` | `'1'` |
| `IS_USE_FACE_AUTH` | `'0'` | `'0'` |
| `MATCH_TYPE` (workplaceMatchType) | `'0'` (NONE) | `'0'` |
| `IS_AUTO_RECORD` | `'0'` | `'0'` |
| `IS_MANUAL_RECORD` | `'1'` | `'1'` |
| `MODIFY_USER_ID` | 운영자 USER_ID | 동일 |
| `MODIFY_MEMO` | 엑셀 Remarks 원문 | 동일 |
| `REG_DT` / `MOD_DT` | `UTC_TIMESTAMP()` | 동일 |

### CHECK_ID 형식

```
<접두사>_<USER_ID 16자리>_<YYYYMMDD>
예: IM26_10882C8FD8F1C850_20260711
```

- **`@batch_code` 변수는 밑줄이 없는 접두사**다 (예: `IM26`). 밑줄은 `CONCAT(@batch_code, '_', USER_ID, ...)`에서 명시적으로 붙인다.
- 배치 조회/검증의 `LIKE` 패턴은 `CONCAT(@batch_code, '\_%') ESCAPE '\'` 형태이며, `@batch_code`에 밑줄이 없어야 정확히 매칭된다.
- 접두사는 배치 식별용이다.
- `MODIFY_MEMO`는 기존에 동일 사유가 많으므로 배치 식별에 사용하지 않는다.

### 시간 변환

- **출근 시간(`ATTENDANCE_TIME`)**: 출근 행(1)과 퇴근 행(2) **모두** 동일한 출근 시간을 갖는다. 애플리케이션 `createPunchOut` → `cloneBase`가 출근 행의 `attendanceTime`을 상속하기 때문이다. 따라서 payload 생성 시 `inout_type`과 무관하게 항상 출근 시간을 UTC로 변환해 넣는다. **퇴근 행의 `ATTENDANCE_TIME`을 `NULL`로 만들면 안 된다.**
- **퇴근 시간(`QUITTING_TIME`)**: 퇴근 행(2)만 값을 갖고, 출근 행(1)은 `NULL`이다. 현지 퇴근 시간에 `:59`초를 붙여 UTC로 변환한다.
- `SCH_DATE`: UTC 날짜가 아니라 엑셀의 고객사 기준일을 그대로 저장한다.
- 변환: `CONVERT_TZ(CONCAT(sch_date, ' ', punch_in_local), @client_tz, 'UTC')`

## Indonesia 사례 예시

Samsung Indonesia 수동 반영 사례는 이 스킬의 기준 예시다.

| 항목 | 값 |
|---|---|
| 클라이언트 | `SPL_4C4B04D00BFB73B2` |
| 타임존 | `Asia/Jakarta` |
| 운영자 | `AA2EA3896630222D` |
| 배치 접두사 (`@batch_code`) | `IM26` (밑줄 없음; CONCAT에서 `_` 추가) |
| 엑셀 원본 | `indonesia-att-manual.xlsx`, `Format HR Feedback` 시트 |
| 원본/정제 행 수 | 77행 / 중복 1행 제거 후 76 사용자-일자 |
| 생성 결과 | 출근·퇴근 152행, CHECK_ID 76개 |
| 예외 | 퇴사자 사번 `076058`은 고객 승인으로 과거 재직 기간 6일 반영 |

예를 들어 USER_ID가 `10882C8FD8F1C850`이고, Jakarta 기준일이 `2026-07-11`이면 출근·퇴근은 다음 CHECK_ID를 공유한다.

```text
IM26_10882C8FD8F1C850_20260711
```

현지 출근 `09:00:00`은 UTC 기준 전일 `2026-07-10 17:00:00`으로, 현지 퇴근 `18:00:59`는 UTC 기준 `2026-07-11 02:00:59`로 저장된다.
`SCH_DATE`는 UTC 날짜가 아니라 고객사 기준일인 `2026-07-11`을 그대로 저장한다.

## MySQL 실전 주의사항

이 항목은 실제 운영 반영에서 발견한 함정이다. 반드시 준수한다.

### 1. Collation 충돌

운영 테이블은 `utf8mb4_unicode_ci`, MySQL 세션 기본은 `utf8mb4_0900_ai_ci`.
사용자 변수와 컬럼 비교 시 collation 불일치 오류가 발생한다.

```sql
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET @client_id = CONVERT('...' USING utf8mb4) COLLATE utf8mb4_unicode_ci;
```

### 2. TEMPORARY TABLE 이중 읽기 금지

MySQL은 같은 쿼리에서 temporary table을 두 번 참조할 수 없다.
출근/퇴근 2행으로 분리할 때 UNION으로 self-reference하면 에러가 발생한다.

**해결**: CROSS JOIN 사용
```sql
-- payload 생성: 스테이징 1행 → 출근/퇴근 2행
INSERT INTO tmp_..._payload
SELECT ...,
       t.inout_type,
       CASE WHEN t.inout_type='1' THEN ... ELSE NULL END AS attendance_time,
       CASE WHEN t.inout_type='2' THEN ... ELSE NULL END AS quitting_time
FROM tmp_..._import s
CROSS JOIN (SELECT '1' AS inout_type UNION ALL SELECT '2') t;
```

### 3. ROW_COUNT() 휘발성

`ROW_COUNT()`는 직전 문장의 영향 행 수만 반환한다.
INSERT와 SELECT ROW_COUNT()를 별도로 실행하면 0이 나온다.

**해결**: INSERT 바로 다음 줄에서 실행
```sql
INSERT INTO io_user_attendance_record ... ;
SET @inserted_rows = ROW_COUNT();  -- 바로 다음에 실행
```

### 4. INSERT 내 NOT EXISTS 금지

출근·퇴근이 같은 `(CLIENT_ID, USER_ID, SCH_DATE)`와 같은 `CHECK_ID`를 공유한다.
INSERT SELECT에 행별 `NOT EXISTS (USER_ID, SCH_DATE)` 또는 `NOT EXISTS (CHECK_ID)`를 걸면,
MySQL이 먼저 삽입된 출근행을 보고 같은 쌍의 퇴근행을 제외한다. 결과적으로 절반만 삽입된다.

**해결**: 충돌 검증은 INSERT 전 별도 SELECT로 수행. INSERT 자체는 WHERE 조건 없이 payload 전체를 삽입.

### 5. DATETIME truncation

`TIME` 타입 값에 문자열을 직접 연결하여 DATETIME을 만들면 truncation 오류가 발생한다.

**해결**: `TIME_FORMAT` 사용
```sql
-- 잘못됨: s.punch_out_local + ':59'
-- 올바름:
CONCAT(DATE_FORMAT(s.sch_date, '%Y-%m-%d'), ' ', TIME_FORMAT(s.punch_out_local, '%H:%i'), ':59')
```

### 6. 배치 식별

배치 조회/삭제는 `CHECK_ID LIKE '<접두사>\_%' ESCAPE '\'`와 `RECORD_ID` 범위로만 수행한다.
`MODIFY_MEMO`는 동일 사유가 과거에도 많으므로 식별에 사용하지 않는다.

## 실행 워크플로우

아래 체크리스트를 순서대로 수행한다. 각 단계의 기대 결과가 맞지 않으면 다음 단계로 넘어가지 않는다.

### Phase 1: 설정 및 스테이징

- [ ] `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci` + 변수 설정 (`@client_id`, `@client_tz`, `@operator_user_id`, `@batch_code`)
- [ ] 임시 스테이징 테이블 생성 (`CREATE TEMPORARY TABLE`)
- [ ] 엑셀 행 INSERT (중복 행 사전 제거)
- [ ] 스테이징 행 수 = 엑셀 데이터 행 수 확인

### Phase 2: 매핑 검증

- [ ] 사번 → USER_ID: 매핑 안 된 행 0건, 다중 매핑 0건 확인
- [ ] 채널 코드 → WORKPLACE_ID: 매핑 안 된 행 0건, 다중 매핑 0건 확인
- [ ] 퇴사자 포함 여부 확인 (승인된 경우만 계속)

### Phase 3: 충돌 검증

- [ ] 스테이징 내 중복 (사번+일자) 0건 확인
- [ ] 기존 출퇴근 충돌 `(CLIENT_ID, USER_ID, SCH_DATE)` 0건 확인 — `FORCE INDEX (io_user_attendance_record_IDX0)`
- [ ] CHECK_ID 충돌 `LIKE '<접두사>\_%'` 0건 확인
- [ ] 근태 마감 여부 확인 (대상 기간 내 마감 0건)

### Phase 4: payload 생성

- [ ] CROSS JOIN으로 출근/퇴근 2행 분리
- [ ] payload 행 수 = 스테이징 행 수 × 2 확인
- [ ] CHECK_ID별 정확히 2행, INOUT_TYPE 1+1 확인
- [ ] UTC 변환된 시간값 확인

### Phase 5: 삽입

- [ ] `START TRANSACTION`
- [ ] 트랜잭션 내 충돌 재검증 (사용자-일자 + CHECK_ID) — 0건 확인
- [ ] INSERT (WHERE 조건 없이 payload 전체)
- [ ] `SET @inserted_rows = ROW_COUNT();` — 예상 행 수와 일치 확인

### Phase 6: COMMIT 전 검증

- [ ] **검증 1**: CHECK_ID별 출퇴근 쌍 완전성 (2행, 1+1, 시간값) — 0행이면 통과
- [ ] **검증 2**: 전체 건수 (행 수 = 스테이징 × 2, CHECK_ID 수 = 스테이징 행 수)
- [ ] **검증 3**: 상세 목록 (RECORD_ID, USER_ID, WORKPLACE_ID, CHECK_ID, INOUT_TYPE, SCH_DATE, MODIFY_MEMO)
- [ ] 2인 검토 후 `COMMIT` (불합격 시 `ROLLBACK`)

### Phase 7: 사후 관리

- [ ] 조회 SQL 제공 (`CHECK_ID LIKE` + `RECORD_ID BETWEEN`)
- [ ] 삭제 SQL 제공 (동일 조건, 삭제 전 카운트 확인)

## 핵심 원칙

1. **전체 또는 전무**: 기존 출퇴근 기록이 1건이라도 충돌하면 부분 반영하지 않고 전체 ROLLBACK
2. **부분 COMMIT 금지**: 삽입 행 수가 예상과 다르면 절대 COMMIT하지 않는다
3. **MODIFY_MEMO 원문 보존**: 엑셀 사유를 그대로 저장, 배치 식별자로 가공하지 않는다
4. **배치 식별**: CHECK_ID 접두사 + RECORD_ID 범위로만 식별
5. **단일 세션**: 임시 테이블은 세션 종료 시 사라지므로 한 세션에서 전체 수행

## SQL 템플릿

재사용 가능한 스테이징, payload, 검증, 사후 조회/삭제 SQL은
[`references/sql-templates.md`](references/sql-templates.md)를 사용한다.

## 흔한 실수

- INSERT에 `NOT EXISTS (USER_ID, SCH_DATE)`를 걸어 절반만 삽입됨
- `ROW_COUNT()`를 별도 문장으로 실행하여 0이 나옴
- Collation 불일치로 JOIN/비교 실패
- TEMPORARY TABLE을 UNION으로 self-reference하여 에러
- `MODIFY_MEMO`로 배치를 식별하려 하여 과거 데이터까지 포함됨
- 출근 시각을 UTC로 변환하지 않고 현지 시간 그대로 INSERT
- 퇴근 시각 초단위(`:59`)를 누락하거나 truncation 오류
- 근태 마감 여부를 확인하지 않고 삽입
