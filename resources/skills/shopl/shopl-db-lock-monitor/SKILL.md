---
name: shopl-db-lock-monitor
description: Shopl 운영 DB 락 모니터링 CloudWatch 로그그룹(/shopl/operations/shopl-rds-lock-monitor)의 lock_wait 이벤트를 Logs Insights로 집계·추적해 테이블·SQL·대기 체인별 잠금 경합 원인을 분석한다. Use when 락 경합, lock wait, 잠금 대기, lock monitor 로그, innodb lock, 특정 테이블/SQL 락 충돌, 대기 체인, 또는 DB 락 원인 분석·브리핑을 요청받았을 때.
---

# Shopl DB Lock Monitor

CloudWatch `shopl-rds-lock-monitor` 로그그룹을 **읽기 전용**으로 조사한다.

## 로그그룹 개요

- 그룹: `/shopl/operations/shopl-rds-lock-monitor` (리전 `ap-northeast-2`, 보존 30일)
- 스트림: `lock-monitor/monitor/<uuid>` — 모니터 인스턴스별
- 이벤트 라이프사이클 (`fingerprint` = lock wait 쌍 식별자, 조인 키):
  1. `lock_wait_detected` — 최초 감지. `lock` 객체에 전체 상세 포함
  2. `lock_wait_still_active` — 폴링(~10초) 재관찰. `observed_seconds` + 상세
  3. `lock_wait_resolved` — 해소. **`fingerprint`와 `observed_seconds`만 있고 상세 없음** → detected로 조인
- 지표: metric filter가 `Shopl/RDSLockMonitor:LockWaitDetected` (Count)로 발포

## 입력 확정

- 기간이 없으면 **텍스트로 되묻지 말고** AWS 명령 실행 전에 `ask_user_question`을 호출한다.
  - header: `조회 기간`
  - 옵션: `오늘 KST (Recommended)`, `어제 KST`, `최근 7일`, `직접 지정`
- 테이블·SQL·트랜잭션 ID·row 키는 사용자가 제공한 경우에만 상세 필터로 적용한다.

## 실행 흐름

1. `aws sts get-caller-identity`로 자격 증명을 확인한다.
2. [REFERENCE.md](REFERENCE.md)의 명령으로 아래 순서로 `scripts/run-insights-query.sh`를 실행한다.
   1. 이벤트 분포(`count by event`)로 전체 규모 확인
   2. 테이블·인덱스·SQL(`lock.waiting_sql.sha256`)별 집계로 핫스팟 특정
   3. 동일 SQL 자기 충돌 비율, `blocking_lock_status` 분포로 경합 유형 분류
   4. 장기 대기 fingerprint 순위 → 선택 fingerprint의 라이프사이클·상세 조회
3. 판정 기준으로 원인을 분류한다.
4. 필요 시 연계 조사(ES 로그·slowquery·DB)로 호출원을 추적한다.
5. KST 기준 브리핑과 근거·다음 조치를 제시한다.

## 판정 기준

| 관찰 | 판단 | 다음 확인 |
|---|---|---|
| `waiting_sql.sha256 == blocking_sql.sha256` | 동일 SQL 동시 중복 실행 (같은 row 갱신 경합) | 호출 API/배치, 재시도·중복 요청, waiting/blocking host 분포 |
| `blocking_last_sql.raw`가 `SELECT @@session.*` 등 사소한 쿼리 | blocker가 트랜잭션을 잡고 idle (긴 트랜잭션·커밋 누락) | `blocking_trx_started` 경과, 커넥션 점유, autocommit |
| `blocking_lock_status = WAITING` | 대기 체인 — blocker도 다른 트랜잭션에 대기 | `blocking_transaction_id`를 waiting으로 갖는 이벤트 추적, 체인 루트 |
| `lock_mode`에 `GAP` / `insert intention` | 갭락·삽입 경합 | 범위 UPDATE, INSERT 동시성, isolation level |
| waiting/blocking host 동일 | 같은 앱 인스턴스 내 경합 | 동시 처리 로직, 인스턴스별 집계 |
| `still_active` 지속 후 `resolved` 없음 | 장기 대기 또는 모니터 추적 유실 | `innodb_lock_wait_timeout` 초과 여부, 타임아웃 롤백 |

## 필수 가드

- Logs Insights 시간은 Unix **초**다. 로그 `timestamp`는 UTC이므로 보고 시 KST(+9) 변환을 명시한다.
- `lock_wait_resolved`는 상세가 없다. 총 대기시간은 resolved의 `observed_seconds`, 상세는 detected에서 얻는다.
- `--output json`이 스키마 프리뷰를 출력하면 `--output text`를 사용한다.
- 0건은 보존기간(30일) 경과·감지 임계 미달 가능성을 확인하기 전까지 '발생 없음'으로 단정하지 않는다.
- 운영 DB에는 조회만 허용한다. DML/DDL, `KILL`은 실행하지 않는다.

## 브리핑 형식

- 범위: KST 기간, 이벤트 건수(detected/still_active/resolved)
- 요약: 최대 대기시간, 테이블·인덱스 핫스팟, 자기 충돌 vs 타 SQL 비율, 대기 체인 비율
- 우선순위: 반복 패턴(빈도)과 단발 장기 대기(깊이)를 분리
- 근거: KST 시각, fingerprint, 테이블·인덱스, SQL(raw 축약), host, 트랜잭션 시작 시각
- 조치: 동시성 제어·커밋 시점·인덜스·트랜잭션 범위 중 근거 있는 항목만 제안

쿼리 레시피와 필드 카탈로그는 [REFERENCE.md](REFERENCE.md), Logs Insights polling은 [scripts/run-insights-query.sh](scripts/run-insights-query.sh)를 사용한다. ES 백엔드 로그 연계는 `shopl-backend-log-query` 스킬, slowquery 교차 확인은 `shopl-db-slowquery-check` 스킬을 사용한다.
