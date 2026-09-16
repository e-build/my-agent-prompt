# Slowquery 명령 레퍼런스

## 1. 접근·운영 그룹 확인

```bash
REGION=ap-northeast-2
aws sts get-caller-identity --output json

aws logs describe-log-groups --region "$REGION" --output text \
  | awk -F'\t' '{for (i = 1; i <= NF; i++) if ($i ~ /^\/aws\/rds\/cluster\//) print $i}' \
  | grep '/slowquery$' \
  | sort -u
```

`qa`, `uat`, `dev`, `clone`, `demo` 이름은 운영 범위에서 제외한다. 이름만으로 확정할 수 없으면 최근 이벤트나 사용자 확인으로 검증한다.

## 2. KST 기간을 Unix 초로 변환

`run-insights-query.sh`와 Logs Insights는 Unix **초**를 받는다.

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

## 3. Logs Insights 실행

```bash
cat >/tmp/slowquery-stats.cwli <<'EOF'
fields @timestamp, @message
| filter @message like /# Query_time:/
| parse @message /# Query_time: (?<query_time>[0-9.]+)  Lock_time: (?<lock_time>[0-9.]+) Rows_sent: (?<rows_sent>[0-9]+)  Rows_examined: (?<rows_examined>[0-9]+)/
| stats count() as count, avg(query_time) as avg_sec, max(query_time) as max_sec,
        sum(rows_examined) as total_rows_examined, max(rows_examined) as max_rows_examined
EOF

scripts/run-insights-query.sh \
  --region "$REGION" \
  --log-group /aws/rds/cluster/<prod-cluster>/slowquery \
  --start-time "$START" --end-time "$END" \
  --query-file /tmp/slowquery-stats.cwli
```

스크립트는 `start-query` 후 `Complete`까지 polling한다. `Failed`, `Cancelled`, `Timeout`은 실패로 종료한다.

## 4. 상세 쿼리

### 상위 SQL

```text
fields @timestamp, @message
| filter @message like /# Query_time:/
| parse @message /# Query_time: (?<query_time>[0-9.]+)  Lock_time: (?<lock_time>[0-9.]+) Rows_sent: (?<rows_sent>[0-9]+)  Rows_examined: (?<rows_examined>[0-9]+)/
| sort query_time desc
| limit 20
```

### 계정·키워드 필터

아래 필터를 상위 SQL 쿼리의 `filter` 뒤에 추가한다.

```text
| filter @message like /# User@Host: <db-account>\[/
| filter @message like /<table-or-domain-keyword>/
```

대소문자 혼용 키워드는 문자 클래스를 쓴다. 예: `/[Ii][Nn][Cc][Ee][Nn][Tt][Ii][Vv][Ee]/`.

### 특정 행의 잠금 경합

```text
fields @timestamp, @message
| filter @message like /<ROW_ID>/
| filter @message like /update <table_name>/
| sort @timestamp asc
| limit 100
```

같은 `SET timestamp=<epoch>`의 테이블 UPDATE도 조회한다. 같은 ID가 여러 DB 세션에서 반복되고 `Rows_examined=1`, `Lock_time≈Query_time`이면 중복 갱신을 우선 조사한다.

```text
fields @timestamp, @message
| filter @message like /SET timestamp=<EPOCH>/
| filter @message like /update <table_name>/
| sort @timestamp asc
| limit 1000
```

## 5. 운영 DB 교차 검증

운영 DB 읽기 권한이 명시적으로 허용된 경우에만 사용한다.

```sql
SHOW CREATE TABLE <table_name>;
EXPLAIN SELECT <columns>
FROM <table_name>
WHERE <same-index-condition>;
```

PK 조건이 `const`, 1행이면 인덱스 스캔 가설은 약하다. 잠금·애플리케이션 동시 실행을 확인한다.

## 실패 대응

| 증상 | 대응 |
|---|---|
| JSON이 값 대신 프리뷰 출력 | `--output text`로 전환 |
| 결과 0건 | 기간·리전·그룹·보존기간 확인 후 ‘증거 없음’으로 보고 |
| Insights 실패/시간초과 | 기간을 줄이고 `Query_time`/ID/테이블 필터를 먼저 적용 |
| `filter-log-events` 일부 결과만 반환 | pagination을 구현하거나 Insights 집계로 전환 |
| KST 기간인데 UTC 전날 로그가 포함 | KST 자정은 UTC 전날 15:00이므로 정상 |
