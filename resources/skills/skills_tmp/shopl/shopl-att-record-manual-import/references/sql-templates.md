# SQL 템플릿: 출퇴근 수동 등록

이 문서는 `attendance-manual-import` 스킬의 SQL 템플릿이다.
변수를 실제 값으로 치환하여 사용한다.

## 변수 정의

```sql
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET @client_id          = CONVERT('{{CLIENT_ID}}'          USING utf8mb4) COLLATE utf8mb4_unicode_ci;
SET @client_tz          = CONVERT('{{CLIENT_TZ}}'          USING utf8mb4) COLLATE utf8mb4_unicode_ci;
SET @operator_user_id   = CONVERT('{{OPERATOR_USER_ID}}'   USING utf8mb4) COLLATE utf8mb4_unicode_ci;
SET @batch_code         = CONVERT('{{BATCH_PREFIX}}'       USING utf8mb4) COLLATE utf8mb4_unicode_ci;
SET @expected_source_rows = {{EXPECTED_SOURCE_ROWS}};
SET @expected_insert_rows = {{EXPECTED_INSERT_ROWS}};
```

## 1. 스테이징 테이블

```sql
DROP TEMPORARY TABLE IF EXISTS tmp_att_import;
DROP TEMPORARY TABLE IF EXISTS tmp_att_payload;

CREATE TEMPORARY TABLE tmp_att_import (
  source_row_no         INT NOT NULL,
  sch_date              DATE NOT NULL,
  emp_id                VARCHAR(40) NOT NULL,
  employee_name         VARCHAR(100) NOT NULL,
  punch_in_local        TIME NOT NULL,
  punch_in_channel_code VARCHAR(50) NOT NULL,
  punch_out_local       TIME NOT NULL,
  punch_out_channel_code VARCHAR(50) NOT NULL,
  remarks               VARCHAR(1000) NULL,
  punch_in_workplace_id  VARCHAR(20) NULL,
  punch_out_workplace_id VARCHAR(20) NULL,
  PRIMARY KEY (source_row_no)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 2. 엑셀 데이터 적재

```sql
INSERT INTO tmp_att_import
(source_row_no, sch_date, emp_id, employee_name, punch_in_local, punch_in_channel_code,
 punch_out_local, punch_out_channel_code, remarks)
VALUES
-- {{EXCEL_ROWS}} 블록: 각 행을 (row_no, date, emp_id, name, punch_in, ch_in, punch_out, ch_out, remark)
({{row_no}}, '{{date}}', '{{emp_id}}', '{{name}}', '{{punch_in}}', '{{ch_in}}', '{{punch_out}}', '{{ch_out}}', '{{remark}}');
```

## 3. 사번 → USER_ID 매핑

```sql
-- 매핑 실패 (0건이어야 정상)
SELECT s.emp_id, s.employee_name
FROM tmp_att_import s
LEFT JOIN io_user_info u
  ON u.CLIENT_ID = @client_id
 AND CONVERT(u.EMP_ID USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(s.emp_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
WHERE u.USER_ID IS NULL;

-- 다중 매핑 (0건이어야 정상)
SELECT s.emp_id, COUNT(*) AS cnt
FROM tmp_att_import s
JOIN io_user_info u
  ON u.CLIENT_ID = @client_id
 AND CONVERT(u.EMP_ID USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(s.emp_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
GROUP BY s.emp_id
HAVING COUNT(*) > 1;
```

## 4. 채널 코드 → WORKPLACE_ID 매핑

```sql
-- 매핑 실패 (0건이어야 정상)
SELECT DISTINCT s.punch_in_channel_code, s.punch_out_channel_code
FROM tmp_att_import s
WHERE NOT EXISTS (
  SELECT 1 FROM io_workplace_info w
  WHERE w.CLIENT_ID = @client_id
    AND CONVERT(w.WORKPLACE_CODE USING utf8mb4) COLLATE utf8mb4_unicode_ci
        = CONVERT(s.punch_in_channel_code USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND w.IS_DELETE = '0'
)
OR NOT EXISTS (
  SELECT 1 FROM io_workplace_info w
  WHERE w.CLIENT_ID = @client_id
    AND CONVERT(w.WORKPLACE_CODE USING utf8mb4) COLLATE utf8mb4_unicode_ci
        = CONVERT(s.punch_out_channel_code USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND w.IS_DELETE = '0'
);
```

## 5. WORKPLACE_ID 업데이트

```sql
UPDATE tmp_att_import s
JOIN io_workplace_info w
  ON w.CLIENT_ID = @client_id
 AND CONVERT(w.WORKPLACE_CODE USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(s.punch_in_channel_code USING utf8mb4) COLLATE utf8mb4_unicode_ci
SET s.punch_in_workplace_id = w.WORKPLACE_ID;

UPDATE tmp_att_import s
JOIN io_workplace_info w
  ON w.CLIENT_ID = @client_id
 AND CONVERT(w.WORKPLACE_CODE USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(s.punch_out_channel_code USING utf8mb4) COLLATE utf8mb4_unicode_ci
SET s.punch_out_workplace_id = w.WORKPLACE_ID;
```

## 6. 기존 출퇴근 충돌 검증

```sql
-- 0건이어야 정상
SELECT p.USER_ID, p.SCH_DATE, r.RECORD_ID
FROM (SELECT DISTINCT u.USER_ID, s.SCH_DATE
      FROM tmp_att_import s
      JOIN io_user_info u
        ON u.CLIENT_ID = @client_id
       AND CONVERT(u.EMP_ID USING utf8mb4) COLLATE utf8mb4_unicode_ci
           = CONVERT(s.emp_id USING utf8mb4) COLLATE utf8mb4_unicode_ci) p
JOIN io_user_attendance_record r FORCE INDEX (io_user_attendance_record_IDX0)
  ON r.CLIENT_ID = @client_id
 AND r.USER_ID = p.USER_ID
 AND r.SCH_DATE = p.SCH_DATE;
```

## 7. payload 생성 (CROSS JOIN)

> **주의 — 출근/퇴근 시간 필드 규칙**
> - `ATTENDANCE_TIME`: 출근 행(1)과 퇴근 행(2) **모두** 출근 시간을 갖는다.
>   애플리케이션 `createPunchOut` → `cloneBase`가 출근 행의 `attendanceTime`을 상속한다.
>   따라서 `inout_type`과 무관하게 항상 출근 시간(punch_in_local)을 UTC로 변환해 넣는다.
> - `QUITTING_TIME`: 퇴근 행(2)만 값을 갖고, 출근 행(1)은 `NULL`이다.
>   값은 퇴근 시간에 `:59`초를 붙여 UTC로 변환한다.
> - 퇴근 행의 `ATTENDANCE_TIME`을 `NULL`로 만들면 출근 시각이 없는 퇴근 레코드가 되어 정산 오류의 원인이 된다.

```sql
-- CREATE TABLE ... AS SELECT(CTAS)로 payload를 한 번에 생성한다.
CREATE TEMPORARY TABLE tmp_att_payload AS
SELECT
  u.USER_ID AS user_id,
  @client_id AS client_id,
  CASE io.inout_type
       WHEN '1' THEN s.punch_in_workplace_id
       ELSE s.punch_out_workplace_id
  END AS workplace_id,
  -- @batch_code는 밑줄이 없는 접두사(예: 'IM26'). CONCAT에서 밑줄을 명시해야
  -- LIKE CONCAT(@batch_code, '\_%') 검색과 CHECK_ID 형식이 모두 일치한다.
  CONCAT(@batch_code, '_', u.USER_ID, '_', DATE_FORMAT(s.sch_date, '%Y%m%d')) AS check_id,
  io.inout_type AS inout_type,
  s.sch_date AS sch_date,
  -- ATTENDANCE_TIME: inout_type 무관, 항상 출근 시간.
  CONVERT_TZ(CONCAT(s.sch_date, ' ', s.punch_in_local), @client_tz, 'UTC') AS attendance_time,
  CASE io.inout_type
       WHEN '1' THEN CAST(NULL AS DATETIME)
       -- punch_out_local이 TIME 타입이라 초까지 포함하므로, %H:%i까지만 쓰고 ':59'를 붙인다.
       ELSE CONVERT_TZ(
           CONCAT(s.sch_date, ' ', TIME_FORMAT(s.punch_out_local, '%H:%i'), ':59'),
           @client_tz, 'UTC'
       )
  END AS quitting_time,
  s.remarks AS modify_memo
FROM tmp_att_import s
CROSS JOIN (
    SELECT '1' AS inout_type
    UNION ALL
    SELECT '2'
) io
JOIN io_user_info u
  ON u.CLIENT_ID = @client_id
 AND CONVERT(u.EMP_ID USING utf8mb4) COLLATE utf8mb4_unicode_ci
     = CONVERT(s.emp_id USING utf8mb4) COLLATE utf8mb4_unicode_ci;
```

## 8. payload 무결성 검증

```sql
-- 행 수 / CHECK_ID 수 / CHECK_ID 길이(한도 내) 확인
SELECT COUNT(*) AS payload_rows__MUST_BE_SOURCE_X2,
       COUNT(DISTINCT check_id) AS check_ids__MUST_BE_SOURCE,
       MAX(CHAR_LENGTH(check_id)) AS max_check_id_length__MUST_FIT_COLUMN
FROM tmp_att_payload;

-- CHECK_ID별 2행, 출근 1 + 퇴근 1 (0건이어야 정상)
SELECT check_id, COUNT(*) AS rows__MUST_BE_2,
       SUM(inout_type='1') AS ins__MUST_BE_1,
       SUM(inout_type='2') AS outs__MUST_BE_1
FROM tmp_att_payload
GROUP BY check_id
HAVING COUNT(*) <> 2 OR SUM(inout_type='1') <> 1 OR SUM(inout_type='2') <> 1;

-- 출근/퇴근 시간 필드 규칙 위반 (0건이어야 정상)
-- 출근 행(1)은 quitting_time이 NULL, 퇴근 행(2)은 attendance_time이 비NULL이어야 한다.
SELECT check_id, inout_type, attendance_time, quitting_time
FROM tmp_att_payload
WHERE (inout_type='1' AND quitting_time IS NOT NULL)
   OR (inout_type='2' AND attendance_time IS NULL);

-- CHECK_ID 충돌 (0건이어야 정상)
SELECT p.check_id, r.RECORD_ID AS check_id_collision__MUST_BE_EMPTY
FROM tmp_att_payload p
JOIN io_user_attendance_record r ON r.CHECK_ID = p.check_id;
```

## 9. 삽입

```sql
START TRANSACTION;

-- 트랜잭션 내 재검증 (0건이어야 정상)
SELECT p.USER_ID, p.SCH_DATE, r.RECORD_ID
FROM (SELECT DISTINCT CLIENT_ID, USER_ID, SCH_DATE FROM tmp_att_payload) p
JOIN io_user_attendance_record r FORCE INDEX (io_user_attendance_record_IDX0)
  ON r.CLIENT_ID = p.CLIENT_ID AND r.USER_ID = p.USER_ID AND r.SCH_DATE = p.SCH_DATE;

-- INSERT (NOT EXISTS 사용 금지 — payload 전체 삽입)
INSERT INTO io_user_attendance_record
(USER_ID, CLIENT_ID, WORKPLACE_ID, CHECK_ID, INOUT_TYPE, IS_REQUEST, IS_MODIFY,
 MODIFY_USER_ID, MODIFY_MEMO, IS_USE_FACE_AUTH, SCH_DATE, ATTENDANCE_TIME, QUITTING_TIME,
 MATCH_TYPE, IS_AUTO_RECORD, IS_MANUAL_RECORD, REG_DT, MOD_DT)
SELECT p.user_id, p.client_id, p.workplace_id, p.check_id, p.inout_type,
       '0', '1', @operator_user_id, p.modify_memo,
       '0', p.sch_date, p.attendance_time, p.quitting_time,
       '0', '0', '1', UTC_TIMESTAMP(), UTC_TIMESTAMP()
FROM tmp_att_payload p;

SET @inserted_rows = ROW_COUNT();

SELECT @inserted_rows AS inserted_rows__MUST_BE_{{EXPECTED_INSERT_ROWS}},
       IF(@inserted_rows = @expected_insert_rows, 'READY_FOR_POSTCHECK', 'ROLLBACK_REQUIRED') AS status;
```

## 10. COMMIT 전 검증 (3종)

```sql
-- 검증 1: CHECK_ID별 쌍 완전성 (0행이면 통과)
SELECT CHECK_ID, COUNT(*), SUM(INOUT_TYPE='1'), SUM(INOUT_TYPE='2'),
       MIN(DATE_FORMAT(CONVERT_TZ(ATTENDANCE_TIME, 'UTC', @client_tz), '%H:%i:%s')),
       MAX(DATE_FORMAT(CONVERT_TZ(QUITTING_TIME, 'UTC', @client_tz), '%H:%i:%s'))
FROM io_user_attendance_record
WHERE CLIENT_ID = @client_id AND CHECK_ID LIKE CONCAT(@batch_code, '\_%') ESCAPE '\'
GROUP BY CHECK_ID
HAVING COUNT(*) <> 2 OR SUM(INOUT_TYPE='1') <> 1 OR SUM(INOUT_TYPE='2') <> 1;

-- 검증 2: 전체 건수
SELECT COUNT(*) AS total_rows, COUNT(DISTINCT CHECK_ID) AS check_ids
FROM io_user_attendance_record
WHERE CLIENT_ID = @client_id AND CHECK_ID LIKE CONCAT(@batch_code, '\_%') ESCAPE '\';

-- 검증 3: 상세 목록
SELECT RECORD_ID, USER_ID, WORKPLACE_ID, CHECK_ID, INOUT_TYPE, SCH_DATE, MODIFY_MEMO, MODIFY_USER_ID
FROM io_user_attendance_record
WHERE CLIENT_ID = @client_id AND CHECK_ID LIKE CONCAT(@batch_code, '\_%') ESCAPE '\'
ORDER BY USER_ID, SCH_DATE, INOUT_TYPE, RECORD_ID;
```

## 11. 조회 / 삭제 (사후 관리)

```sql
-- 조회 (RECORD_ID 범위는 검증 3 결과에서 획득)
SELECT RECORD_ID, USER_ID, CHECK_ID, INOUT_TYPE, SCH_DATE, MODIFY_MEMO
FROM io_user_attendance_record
WHERE CLIENT_ID = '{{CLIENT_ID}}'
  AND CHECK_ID LIKE '{{BATCH_PREFIX}}\_%' ESCAPE '\'
  AND RECORD_ID BETWEEN {{MIN_RECORD_ID}} AND {{MAX_RECORD_ID}}
ORDER BY USER_ID, SCH_DATE, INOUT_TYPE;

-- 삭제 (운영 승인 후)
START TRANSACTION;
SELECT COUNT(*) AS delete_target_count
FROM io_user_attendance_record
WHERE CLIENT_ID = '{{CLIENT_ID}}'
  AND CHECK_ID LIKE '{{BATCH_PREFIX}}\_%' ESCAPE '\'
  AND RECORD_ID BETWEEN {{MIN_RECORD_ID}} AND {{MAX_RECORD_ID}};

DELETE FROM io_user_attendance_record
WHERE CLIENT_ID = '{{CLIENT_ID}}'
  AND CHECK_ID LIKE '{{BATCH_PREFIX}}\_%' ESCAPE '\'
  AND RECORD_ID BETWEEN {{MIN_RECORD_ID}} AND {{MAX_RECORD_ID}};
-- COMMIT;  -- 카운트 확인 후
```
