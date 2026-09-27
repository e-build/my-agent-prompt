# Lock Monitor 명령 레퍼런스

## 1. 사전 확인

```bash
REGION=ap-northeast-2
LOG_GROUP=/shopl/operations/shopl-rds-lock-monitor

aws sts get-caller-identity --output json
```

KST 기간을 Unix **초**로 변환한다.

```bash
# 오늘 KST 00:00 ~ 현재
read START END <<EOF
$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
kst = timezone(timedelta(hours=9))
now = datetime.now(kst)
start = now.replace(hour=0, minute=0, second=0, microsecond=0)
print(int(start.timestamp()), int(now.timestamp()))
PY
)
EOF
```

명시 날짜는 `datetime.strptime('<YYYY-MM-DD>', '%Y-%m-%d')`로 `now` 대신 생성하고, `end`를 `+ timedelta(days=1)`로 설정한다.

## 2. 쿼리 레시피

공통 호출 형태:

```bash
scripts/run-insights-query.sh \
  --region "$REGION" --log-group "$LOG_GROUP" \
  --start-time "$START" --end-time "$END" \
  --query-file /tmp/lock-query.cwli
```

### 이벤트 분포 (전체 규모)

```text
stats count() as cnt by event
| sort cnt desc
```

### 일별 추이

```text
filter event = "lock_wait_detected"
| stats count() as cnt by bin(1d)
```

### 테이블·인덱스·SQL 핫스팟

3단계 중첩 필드(`lock.waiting_sql.sha256`)도 Insights에서 직접 접근된다.

```text
filter event = "lock_wait_detected"
| stats count() as cnt by lock.object_name, lock.index_name, lock.waiting_sql.sha256
| sort cnt desc
| limit 20
```

### 동일 SQL 자기 충돌 비율

결과 필드명은 표현식 문자열로 나온다 (`0`=다른 SQL, `1`=동일 SQL).

```text
filter event = "lock_wait_detected"
| stats count() as cnt by lock.waiting_sql.sha256 = lock.blocking_sql.sha256
```

### 대기 체인 비율 (blocker가 대기 중인가)

```text
filter event = "lock_wait_detected"
| stats count() by lock.blocking_lock_status
```

### blocker idle 여부 (긴 트랜잭션 탐지)

`blocking_last_statement_event_name`이 select인데 `blocking_last_sql`가 사소하면 blocker가 트랜잭션을 잡고 idle이다.

```text
filter event = "lock_wait_detected"
| stats count() by lock.blocking_last_sql.raw
| sort count desc
| limit 10
```

### 호스트별 경합

```text
filter event = "lock_wait_detected"
| stats count() as cnt by lock.waiting_host, lock.blocking_host
| sort cnt desc
| limit 20
```

### 장기 대기 fingerprint 순위

총 대기시간은 resolved의 `observed_seconds`로 측정한다.

```text
filter event = "lock_wait_resolved"
| stats max(observed_seconds) as total_wait by fingerprint
| sort total_wait desc
| limit 20
```

### fingerprint 라이프사이클 추적

```text
fields @timestamp, event, observed_seconds
| filter fingerprint = "<FINGERPRINT>"
| sort @timestamp asc
| limit 50
```

### fingerprint 상세 (detected)

```text
fields @timestamp,
        lock.waiting_sql.raw, lock.blocking_sql.raw, lock.blocking_last_sql.raw,
        lock.waiting_host, lock.blocking_host,
        lock.waiting_trx_started, lock.blocking_trx_started,
        lock.waiting_rows_locked, lock.blocking_rows_locked
| filter event = "lock_wait_detected" and fingerprint = "<FINGERPRINT>"
```

### 특정 테이블 상세

```text
fields @timestamp, fingerprint, lock.waiting_sql.raw, lock.blocking_sql.raw,
        lock.waiting_time_seconds, lock.blocking_time_seconds,
        lock.waiting_host, lock.blocking_host
| filter event = "lock_wait_detected" and lock.object_name like /(?i)<table_name>/
| sort @timestamp desc
| limit 50
```

### 트랜잭션 ID로 대기 체인 추적

어느 쪽에 등장하는지 전부 조회해 체인 루트를 찾는다.

```text
fields @timestamp, event, fingerprint,
        lock.waiting_transaction_id, lock.blocking_transaction_id, lock.blocking_lock_status
| filter lock.waiting_transaction_id = <TRX_ID> or lock.blocking_transaction_id = <TRX_ID>
| sort @timestamp asc
| limit 100
```

### row 키(lock_data) 기준 조회

`waiting_lock_data`는 인덱스 컬럼 값이다 (예: `'USER_ID', '0', 46611545`).

```text
filter event = "lock_wait_detected" and lock.waiting_lock_data like /<ROW_KEY>/
| sort @timestamp asc
| limit 50
```

## 3. 필드 카탈로그

최상위:

| 필드 | 설명 |
|---|---|
| `timestamp` | 이벤트 시각 (UTC) |
| `event` | `lock_wait_detected` / `lock_wait_still_active` / `lock_wait_resolved` |
| `fingerprint` | lock wait 쌍 식별자 (라이프사이클 조인 키) |
| `observed_seconds` | 모니터 관찰 경과 초 (still_active/resolved만) |
| `lock` | 상세 객체 (resolved에는 없음) |

`lock` 객체 — 공통:

| 필드 | 설명 |
|---|---|
| `object_schema` / `object_name` / `index_name` | DB·테이블·경합 인덱스 |
| `waiting_lock_type/mode/status/data` | 대기측 잠금 (예: `RECORD`, `X,REC_NOT_GAP`, `WAITING`) |
| `blocking_lock_type/mode/status/data` | 차단측 잠금 (`GRANTED` 또는 `WAITING`=체인) |

`lock` 객체 — waiting_*/blocking_* 쌍:

| 필드 | 설명 |
|---|---|
| `*_transaction_id` | InnoDB 트랜잭션 ID (체인 추적 키) |
| `*_engine_lock_id` | 엔진 잠금 ID |
| `*_thread_id` / `*_connection_id` / `*_mysql_thread_id` | 성능 스키마/커넥션 식별자 |
| `*_user` / `*_host` / `*_database` / `*_command` | 세션 정보 (host=앱 인스턴스 IP) |
| `*_time_seconds` | innodb_trx 기준 대기/경과 초 (detected 시점) |
| `*_trx_started` | 트랜잭션 시작 시각 (UTC) |
| `*_rows_locked` / `*_rows_modified` | 잠금/수정 행 수 |
| `waiting_sql` / `blocking_sql` | 현재(또는 마지막) SQL `{sha256, raw}` |
| `blocking_last_sql` | blocker가 idle일 때의 마지막 문장 |
| `blocking_last_statement_event_id/name` | 성능 스키마 이벤트 |

## 4. CloudWatch 지표

`lock_wait_detected`마다 `Shopl/RDSLockMonitor:LockWaitDetected` (Count)가 증가한다. 알람·추이 확인:

```bash
aws cloudwatch get-metric-statistics --region ap-northeast-2 \
  --namespace Shopl/RDSLockMonitor --metric-name LockWaitDetected \
  --start-time "$(date -u -v-1d +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --period 3600 --statistics Sum Maximum --output text
```

## 5. 연계 조사

- **ES 백엔드 로그** (`shopl-backend-log-query` 스킬): `waiting_host`/`blocking_host` IP와 시각으로 앱 인스턴스를 특정하고 ±5분 ERROR·BatchJob·rId 추적으로 호출원을 찾는다.
- **slowquery** (`shopl-db-slowquery-check` 스킬): 락 대기가 slowquery의 `Lock_time ≈ Query_time` 패턴과 겹치는지 교차 확인한다.
- **운영 DB 읽기** (읽기 권한이 명시적으로 허용된 경우에만):

```sql
SELECT trx_id, trx_state, trx_started, trx_mysql_thread_id, trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started;
```

## 실패 대응

| 증상 | 대응 |
|---|---|
| JSON이 값 대신 프리뷰 출력 | `--output text`로 전환 |
| 결과 0건 | 기간·리전·그룹·보존기간(30일) 확인 후 '증거 없음'으로 보고 |
| Insights 실패/시간초과 | 기간을 줄이고 event/테이블 필터를 먼저 적용 |
| `lock.waiting_sql.sha256` 필드 누락 오류 | `| filter ispresent(lock.waiting_sql)` 를 먼저 추가 |
| KST 기간인데 UTC 전날 로그 포함 | KST 자정은 UTC 전날 15:00이므로 정상 |
| resolved만 있고 detected가 없음 | 보존 경계 또는 스트림 지연. 시간 범위를 넓혀 재확인 |
