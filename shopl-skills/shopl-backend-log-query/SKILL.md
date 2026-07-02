---
name: shopl-backend-log-query
description: >
  Query and analyze Shopl integrated backend logs in Elasticsearch (`shopl-backend-log*`).
  Use when investigating Shopl ES/Kibana logs, rId/cId/ctxtId request traces,
  ERROR or stack_trace based exception logs, slow APIs, BatchJob logs, IDP/OAuth2 logs,
  Feign calls, message_type/message_data structured logs, or service_type based
  filtering across Backend-API, IDP, BATCH/Batch-New, LINK, and External-API.
  Provides safe query patterns, time-range guards, field mapping constraints,
  and a service_type-based domain catalog.
argument-hint: "[error|rId|batch|slow-api|message_type|service_type]"
license: MIT
---

# Shopl Elasticsearch 로그 조회 스킬

Shopl 백엔드 로그(Elasticsearch `shopl-backend-log*`)를 효율적으로 검색·분석한다.
필드 매핑의 특수 제약과 구조화 로그 규칙, 추적 식별자 체계를 정적 지식으로 제공하여
정확한 쿼리를 즉시 구성하고, 결과를 정제하여 컨텍스트를 절약한다.

## 사용 시기 (Trigger)
- Shopl ES/Kibana 로그 조회, `shopl-backend-log*` 검색, Elasticsearch Query DSL 작성
- rId/cId/ctxtId 기반 요청 추적, HTTP RequestIn/ResponseOut 흐름 복원
- `level:ERROR` 또는 `stack_trace:*` 기반 에러 분석, 예외 핸들러 로그 역추적
- 느린 API 분석 (`HTTP:ResponseOut.message_data.elapseMillis`, `Feign:ResponseIn.elapsedMs`)
- 배치 로그 분석 (`BatchJob:*`, `bJobExecutionId`, `Batch-New`, `BATCH`)
- IDP/인증서버 로그 분석 (`service_type:IDP`, `OAuth2:*`, `Feign:*`, `Device:*`, `SecurityChain:*`)
- 구조화 로그 검색 (`message_type`, `message_data.*`)
- service_type 기반 로그 분류 (`Backend-API`, `IDP`, `BATCH`, `Batch-New`, `LINK`, `External-API`)

## 접근 정보 (필수)
- ES 직접 접근은 `es-query.sh` 래퍼를 통해서만 수행 (read-only)
- 인증 정보는 평문 금지. `~/.config/es-skill/config.env`(권한 600)에 분리
- config 템플릿: `config.env.example` 참고
- 호출은 항상 **시간창 + size cap + 타임아웃** 포함

## 빠른 탐색 — 필드 카탈로그
인덱스 템플릿: `shopl-backend-logs-template` / 패턴 `shopl-backend-log*`
`dynamic: false` — 정의되지 않은 필드는 색인/검색/집계 불가. 매핑에 없는 필드는 쿼리하지 말 것.

### 식별자 (추적 체계)
| 필드 | 타입 | 의미 | 쿼리 제약 |
|------|------|------|-----------|
| `rId` | keyword, **doc_values:false** | HTTP 요청 ID \| 배치 스케줄러 ID (최상위 추적 단위) | term 조회만 가능. **정렬·집계·스크립트 불가** |
| `ctxtId` | keyword | 하나의 rId 내 @Async 스레드 구분자 (비동기 추적) | 정렬/집계 가능 |
| `cId` | keyword | 클라이언트 ID | |
| `uId` | keyword | 사용자 ID | |
| `thread_name` | keyword | 실제 스레드명 | |

> 정렬이 필요하면 `rId` 대신 `cId` 또는 `@timestamp` 사용. rId로 정렬 시도 금지.

### 일반 필드
| 필드 | 타입 | 비고 |
|------|------|------|
| `@timestamp` | date | **항상 range로 시간창 좁힐 것** |
| `level` | keyword | `INFO`, `TRACE`, `DEBUG`, `WARN`, `ERROR`. **TRACE/DEBUG가 대다수** → 노이즈. 분석 시 `level` 필터로 좁히기 (예: `INFO`+`WARN`+`ERROR`만) |
| `env` | keyword | `SHOPL`, `QA`, `CPS`, `SSS`, `UAT` |
| `service_type` | keyword | `Backend-API`, `External-API`, `BATCH`, `Batch-New`, `DOWNLOAD`, `LINK`, `IDP`. **도메인 1차 분류 기준** (도메인 카탈로그 참조) |
| `requestURI` | keyword | HTTP 요청 `"{METHOD} {path}"` 형식. 예: `POST /oauth2/token`, `GET /rest/user/state`. **prefix로 특정 API 그룹 필터**: `{"prefix":{"requestURI":"POST /rest/attendance"}}` |
| `logger_name` | keyword | 예: `com.planetory.io.exception.handler.IoExceptionHandlerV2`. 에러 출처 식별 |
| `log_group` | keyword | CloudWatch 로그그룹 경로. **service_type보다 정밀한 식별자** — 브랜드+앱+env가 인코딩됨. 예: `/ecs/shopl-idp-prod`, `/aws/elasticbeanstalk/docker-shopl-mobile/...`, `/ecs/cps-idp-prod`, `/aws/elasticbeanstalk/docker-shopl-batch/...`. `service_type:IDP` 안에서 `shopl-idp`/`cps-idp`/`sss-idp` 등 브랜드 구분이나 prod/uat 환경 구분에 사용 |

### 구조화 로그 (핵심)
| 필드 | 타입 | 설명 |
|------|------|------|
| `message` | text (`.keyword` 없음) | 로그 원본 JSON. 정확매칭=`match_phrase`, 부분=`match`. **wildcard/prefix 금지** |
| `message_type` | keyword | `{domainName}:{ClassName}`. 예) `HTTP:RequestIn`, `BatchJob:JobFailed` |
| `message_data` | flattened | 구조화 데이터. **json path**로 검색. 예) `message_data.workplaceId`. keyword 취급(term/term**s** 가능, full-text 불가) |
| `stack_trace` | text (`.keyword` 없음) | 예외 스택. match_phrase 사용, 출력 시 길이 cap |

### 배치 전용
| 필드 | 타입 |
|------|------|
| `bJobName`, `bStepName` | keyword |
| `bJobExecutionId`, `bJobInstanceId`, `bStepExecutionId` | long |

### 도메인 카탈로그
`service_type`을 1차 분류 기준으로 사용. 도메인은 대부분 단일 service_type에만 발생 (IDP=OAuth2/Feign/..., Backend-API=AttendanceRecord/..., BATCH=BatchJob/...).
"출근/인센티브/배치/인증 로그 찾아줘" 같은 자연어를 정확한 `message_type`으로 매핑하려면 **`domain-catalog.md`를 반드시 참조**할 것. 자주 쓰는 type:
- `service_type:IDP` → `OAuth2:TokenLifecycle` / `OAuth2:TokenRequestCompleted` / `Feign:ResponseIn`
- `service_type:Backend-API` → `HTTP:RequestIn` / `HTTP:ResponseOut` / `AttendanceRecord:PunchIn` / `Authentication:AuthenticationFailed`
- `service_type:BATCH`|`Batch-New` → `BatchJob:JobStart` / `BatchJob:JobEnd` / `BatchJob:JobFailed`
- `service_type:LINK` → `DeepLink:Redirect`
- `IncentiveCalculation:CalculationStarted/Completed/Error`, `IncentiveStatusUserSchemeAmount:TotalAmountCalculated`

## Recipe (추적 패턴)
`es-query.sh`에 넘길 Query DSL 형태. Kibana에서는 KQL로 변환 가능.

### 1. HTTP 요청 추적 (rId 기준)
한 요청의 RequestIn → ResponseBody(오류시) → ResponseOut 흐름을 시간순 복원.
```json
{
  "query": {"bool": {"filter": [
    {"range": {"@timestamp": {"gte": "now-1h", "lte": "now"}}},
    {"term": {"rId": "<RID>"}}
  ]}},
  "sort": [{"@timestamp": "asc"}],
  "size": 100,
  "_source": ["@timestamp","level","message_type","message_data","requestURI","logger_name","stack_trace"]
}
```

### 2. 에러 분석 (예외 핸들러 허점 주의)
예외가 여러 방식으로 로깅되므로 단일 조건으로는 누락 발생. **`level:ERROR` OR `stack_trace 존재`** 두 조건을 합쳐 검색. (실제: `level:ERROR`=소수, `stack_trace 존재`=훨씬 많음 — 대부분의 예외는 INFO/WARN으로 로깅됨)
```json
{
  "query": {"bool": {
    "filter": [
      {"range": {"@timestamp": {"gte": "now-15m"}}},
      {"term": {"env": "SHOPL"}},
      {"terms": {"level": ["INFO", "WARN", "ERROR"]}}
    ],
    "should": [
      {"term": {"level": "ERROR"}},
      {"exists": {"field": "stack_trace"}}
    ],
    "minimum_should_match": 1
  }},
  "sort": [{"@timestamp": "desc"}],
  "size": 50
}
```
> Kibana KQL: `(level:ERROR or stack_trace:*) and level:(INFO or WARN or ERROR)`

#### ⚠ 예외 핸들러 로그는 rId/message_type 이 null
`IoExceptionHandlerV2`·`ResponseExceptionHandler`가 찍는 예외 로그는 `message_type`과 `rId`가 **null**이다 (일반 문자열 로그, `(none)` 도메인). 따라서:
1. 위 에러 쿼리로 예외 로그(`stack_trace`)를 먼저 잡는다
2. **해당 예외 로그의 `@timestamp` ±수초 범위에서 같은 thread/cId의 `HTTP:RequestIn`을 역추적**해 rId를 확보한다
3. 확보한 rId로 Recipe 1 재실행하여 요청 흐름 전체 복원

`Authentication:AuthenticationFailed`·`SecurityChain:AccessDenied`도 동시 확인 (이들은 `requestId` 필드에 rId를 가질 수 있음).

### 3. 배치 잡 추적
rId=스케줄러ID. `BatchJob:*` 메시지 + `bJobExecutionId`로 좁히기.
```json
{
  "query": {"bool": {"filter": [
    {"range": {"@timestamp": {"gte": "now-2h"}}},
    {"term": {"service_type": "BATCH"}},
    {"term": {"bJobExecutionId": 12345}}
  ]}},
  "sort": [{"@timestamp": "asc"}],
  "size": 200
}
```
실패 분석 시 `message_type: BatchJob:JobFailed`의 `message_data.failureExceptions`/`failedSteps` 확인.

### 4. 비동기 스레드 추적
rId + ctxtId로 @Async 분기 추적.
```
filter: rId=<RID> AND ctxtId=<CTXTID>, sort @timestamp asc
```

### 5. 구조화 로그 검색 (message_type + message_data)
도메인 + 데이터 조건. **도메인 카탈로그에서 정확한 type/필드명과 `service_type` 확인 필수** (예: OAuth2는 IDP, AttendanceRecord는 Backend-API).
```json
{
  "query": {"bool": {"filter": [
    {"range": {"@timestamp": {"gte": "now-1h"}}},
    {"term": {"service_type": "Backend-API"}},
    {"prefix": {"message_type": "AttendanceRecord:"}},
    {"term": {"message_data.workplaceId": "16EE8F075E488720"}}
  ]}},
  "sort": [{"@timestamp": "asc"}]
}
```

### 6. 응답시간 분석 (flattened 정렬)
`message_data` flattened 필드 정렬·집계 가능. 느린 API 탐지.
```json
{
  "query": {"bool": {"filter": [
    {"range": {"@timestamp": {"gte": "now-1h"}}},
    {"term": {"message_type": "HTTP:ResponseOut"}}
  ]}},
  "size": 10,
  "sort": [{"message_data.elapseMillis": {"order": "desc"}}],
  "_source": ["@timestamp", "requestURI", "message_data.status", "message_data.elapseMillis", "rId"]
}
```
> 외부 API 지연은 IDP의 `Feign:ResponseIn` `message_data.elapsedMs`로 동일하게 분석.

## ES 부하 가드 (중요)
ES는 `r6g.large`(2cpu/16gb) 소규모. 광범위 쿼리 한 번이 전체 클러스터를 느리게 만든다.

### range 규칙
- **`@timestamp` range는 기본 필수** — `es-query.sh`가 range 누락 시 자동 거부한다.
- **예외: `term.rId` 단일 검색** — rId는 term 샤드 룩업이라 매우 빠르므로 range 생략 허용. range 가드도 통과.

### 쿼리 작성 전 사용자에게 기간 확인
쿼리를 짜기 전에 **반드시 사용자에게 조회 기간을 확인**한다. 사용자가 기간을 명시하지 않았으면 아래 프리셋 중 하나를 제안할 것.

### 기간 프리셋
| 프리셋 | gte 값 | 용도 |
|-------|--------|------|
| 1시간 (기본) | `now-1h` | 빠른 확인, 최근 에러 |
| 1일 | `now-1d` | 하루치 조사, 일별 배치 |
| 3일 | `now-3d` | 주말 건너뛴 조사 |
| 2주 | `now-14d` | 장기 추세/반복 이슈 (집계 권장) |

> 2주 초과는 원칙 금지. 필요하면 날짜 인덱스 명시(`shopl-backend-logs-2026.07.*`) + 집계 우선.

### env 기본 정책
운영: `SHOPL`(메인, 약 72%), `CPS`, `SSS` / 비운영: `QA`, `UAT`. **매번 물어보지 말 것** (90%는 SHOPL).

- **기본 `SHOPL`**: env 명시 없으면 SHOPL로 조회. 단, 쿼리 결과에 **"env: SHOPL 가정" 한 줄 표시** → 틀리면 사용자가 정정
- **브랜드/식별자 힌트 우선**: 사용자가 CPS/SSS 언급 → 그 env. rId·cId 등 식별자 주어지면 env 필터 생략(해당 doc의 env 읽어 알림)
- **"운영 전체"/"전체 환경" 요청**: 운영 3개 한 번에 — `{"terms":{"env":["SHOPL","CPS","SSS"]}}`
- **물어보는 예외 (3가지)**:
  1. "운영 전체" vs "비운영 포함 전체" 의도 불명확 시
  2. 첫 쿼리가 SHOPL에서 0건 → "CPS/SSS에서 찾아볼까요?" 제안
  3. 힌트 충돌 (예: log_group은 `cps-idp`인데 env=SHOPL 언급) → 확인

### 시나리오별 권장 범위
| 시나리오 | 권장 | 비고 |
|---------|------|------|
| 단일 rId 추적 | range 불필요 (예외) | term.rId 하나로 충분, 매우 빠름 |
| 기본 / 빠른 확인 | 1h | 가장 안전 |
| 에러 조사 | 1h → rId로 좁힌 후 확장 | level/stack_trace로 잡고 rId로 전환 |
| 배치 잡 추적 | 1d 이내, 실행 시점 ±2h | `bJobExecutionId`로 먼저 좁힐 것 |
| 구조화 로그 (message_type 지정) | 1h ~ 1d | message_type 조건 없으면 1h 이내 유지 |

### 부하 완화 팁
- 범위가 크면 먼저 `_count`(`COUNT=1`)로 건수 확인 후 `_search`
- raw 히트가 많이 나올 것 같으면 집계(`terms`/`date_histogram`)로 요약 먼저
- `size` 기본 50, 최대 200. 넘기면 집계로 전환
- 업무 시간 피크(평일 09~19시) 대량 집계 자제

## 안티패턴 가드 (리뷰 체크리스트)
쿼리 작성 후 반드시 점검:
- [ ] **`@timestamp` range 포함?** → 필수. 단 `term.rId` 단일 검색은 예외(빠름). 누락 시 `es-query.sh` 거부. 범위는 기간 프리셋(1h/1d/3d/2w) 참조
- [ ] **`rId`로 정렬/집계?** → doc_values:false. `@timestamp`/`cId`로 대체
- [ ] **`message`/`stack_trace`에 wildcard/prefix?** → text 필드. `match_phrase` 사용
- [ ] **`message_data` 서브필드 full-text?** → flattened은 keyword 취급. `term`/`terms` 사용
- [ ] **`env`/`service_type` 오타?** → 열거값만 허용 (위 카탈로그 참조)
- [ ] **에러를 `level:ERROR`만으로?** → 누락 발생. `level:ERROR` OR `stack_trace:*` 로 검색
- [ ] **flattened/keyword가 아닌 필드 집계?** → text 필드 집계 불가
- [ ] **매핑에 없는 필드?** → dynamic:false. 확인 후 쿼리

## 실행 & 출력
```bash
# 쿼리 JSON 파일로 실행
es-query.sh query.json

# stdin
cat query.json | es-query.sh

# 카운트만
COUNT=true es-query.sh query.json
```
`es-query.sh`는 결과를 `_source` 정제 + `stack_trace` 2000자 cap + 요약 포맷으로 출력하여 컨텍스트를 절약한다.
실행 전 config.env에 ES 접속정보가 설정되어 있어야 한다.

## 시간대 주의
`@timestamp`는 UTC일 가능성. KST 변환이 필요하면 쿼리 시 +9h 보정하거나 출력에서 확인.
인덱스는 일별 rollover(`.ds-shopl-backend-logs-YYYY.MM.DD-NNNNNN`), 패턴 `shopl-backend-log*`로 전체 검색.
