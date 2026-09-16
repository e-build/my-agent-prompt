---
name: shopl-db-slowquery-check
description: Shopl 운영 DB의 CloudWatch Aurora/RDS MySQL slowquery를 AWS CLI로 집계하고, 락 대기와 대량 스캔을 구분해 브리핑한다. Use when Shopl CloudWatch, DB slow query, RDS/Aurora slowquery, Query_time, Lock_time, Rows_examined, 느린 UPDATE, DB 락 경합, 또는 슬로우쿼리 브리핑을 요청받았을 때.
---

# Shopl DB Slowquery Check

CloudWatch `slowquery` 로그를 **읽기 전용**으로 조사한다.

## 입력 확정

조회 전 아래를 확인한다. 없으면 질문한다.

- 리전 (기본: `ap-northeast-2`)
- 기간: KST 오늘 또는 명시 날짜/시각
- 운영 클러스터와 제외할 QA/UAT/clone 그룹
- 선택 필터: DB 계정, 테이블/도메인 키워드, row ID

## 실행 흐름

1. `aws sts get-caller-identity`로 자격 증명을 확인한다.
2. [REFERENCE.md](REFERENCE.md)의 명령으로 `/slowquery` 그룹을 찾고 운영 그룹만 선택한다.
3. `scripts/run-insights-query.sh`로 아래 순서로 실행한다.
   1. 전체 건수·실행시간·검사 행 집계
   2. 실행시간 상위 SQL 조회
   3. 계정/키워드/row ID로 상세 조회
4. `Query_time`, `Lock_time`, `Rows_examined`을 기준으로 원인을 분류한다.
5. KST 기준 브리핑과 근거·다음 조치를 제시한다.

## 판정 기준

| 관찰 | 판단 | 다음 확인 |
|---|---|---|
| `Rows_examined` 작음 + `Lock_time ≈ Query_time` | 행/범위 잠금 대기 | 동일 ID·시작 시각·DB 세션, 비동기/재시도/배치 중복 |
| `Rows_examined` 큼 + `Lock_time` 작음 | 스캔·조인·정렬 비용 | 읽기 전용 `EXPLAIN`, 인덱스, 상관 서브쿼리 |
| 같은 SQL 반복 | 누적 DB 비용 | 호출 계정, API/배치 주기, fingerprint별 합계 |
| 단발 장기 실행 | 직접 SQL/배치 위험 | 실행 주체, 재실행 여부, 운영 가드 |

## 필수 가드

- Logs Insights 시간은 Unix **초**, `filter-log-events` 시간은 **밀리초**다.
- CloudWatch 시각은 UTC일 수 있다. 보고 시 KST 변환 여부를 명시한다.
- `--output json`이 스키마 프리뷰를 출력하면 `--output text`를 사용한다.
- 0건은 보존기간 경과 가능성을 확인하기 전까지 ‘발생 없음’으로 단정하지 않는다.
- 운영 DB에는 조회·`EXPLAIN SELECT`만 허용한다. DML/DDL은 실행하지 않는다.

## 브리핑 형식

- 범위: 리전, KST 기간, 운영 그룹, 제외 환경
- 요약: 건수, 평균/최대 시간, 총/최대 검사 행
- 우선순위: 반복 비용과 단발 고위험을 분리
- 근거: KST 시각, 계정, SQL fingerprint, 세 성능 지표
- 조치: 코드·실행계획·인덱스·스케줄러 중 근거 있는 항목만 제안

명령과 쿼리 템플릿은 [REFERENCE.md](REFERENCE.md)를, Logs Insights polling은 [scripts/run-insights-query.sh](scripts/run-insights-query.sh)를 사용한다.
