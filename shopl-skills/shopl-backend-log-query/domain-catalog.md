# Shopl 로그 도메인 카탈로그

`message_type = {domainName}:{ClassName}`. 구조화 로그는 `ShoplLogEvent`(shopl)/자체 구현(인증서버)에서 발생.
쿼리는 `message_type`으로 prefix/term 검색, `message_data`의 json path로 데이터 조건 검색.
`message_data`는 flattened — 모든 서브필드 keyword 취급(`term`/`terms`, full-text 불가).

---

## 1. 빠른 선택
사용자 요청 → 먼저 걸 필터. service_type으로 1차 좁히면 정확하고 빠름(데이터 검증 완료).

| 사용자가 묻는 것 | service_type | message_type / 쿼리 |
|---|---|---|
| 운영 일반 / 근태 / 인센티브 | `Backend-API` | `AttendanceRecord:*`, `Incentive*`, `Authentication:*` |
| IDP / 토큰 / 인증서버 | `IDP` | `OAuth2:*`, `Feign:*`, `Device:*`, `SecurityChain:*` |
| 배치 / 스케줄러 | `Batch-New`, `BATCH` | `BatchJob:*`, `StagingToAttRecord:*`, `DomainEvent:*` |
| 딥링크 리다이렉트 | `LINK` | `DeepLink:Redirect` |
| 느린 API | (전체) | `HTTP:ResponseOut` + `message_data.elapseMillis` desc / `Feign:ResponseIn` `message_data.elapsedMs` desc |
| 에러 / 예외 | (전체) | `level:ERROR` OR `stack_trace:*` → `IoExceptionHandlerV2` 라면 `(none)` |

## 2. 공통 주의사항 (에러 추적 핵심)
- **env 기본 `SHOPL`**. 명시 없으면 SHOPL 가정 후 결과에 표시. CPS/SSS 언급 시 그 env. "운영 전체" → `terms: [SHOPL, CPS, SSS]`
- **`(none)` = message_type 없는 일반 문자열 로그**. IDP에서 특히 많음(3h 183만건). `ShoplLogEvent` 안 쓴 `logger.info("문자열")` 계열. **대부분의 예외 로그가 여기 해당**
- **예외 핸들러(`IoExceptionHandlerV2`, `ResponseExceptionHandler`) 로그는 `message_type`·`rId`가 null**. 따라서:
  1. `stack_trace`로 예외 잡기
  2. 해당 예외 로그의 `@timestamp` ±수초 범위에서 같은 thread/cId의 `HTTP:RequestIn` 역추적 → rId 확보
  3. 확보한 rId로 요청 흐름 복원
- `SecurityChain:AccessDenied`는 `message_data.requestId`에 rId를 가질 수 있음 → 직접 매칭 가능
- 시간대: `@timestamp`는 UTC (KST-9h). ES는 `r6g.large` 소규모 → 항상 `@timestamp` range 필수 (SKILL.md 부하 가드 참조)

---

## 3. IDP (인증서버: shopl-authorization-server)
`service_type:IDP`. 토큰·외부호출·디바이스·보안.

### OAuth2 (OAuth2LogEvent) — 인증 토큰 라이프사이클. 빈도 최상.
**주요 검색 키**: `clientId`, `userId`, `accountId`, `authorizationId`, `grantType`

| message_type | 용도 |
|---|---|
| `OAuth2:TokenLifecycle` | 토큰 발급/갱신/무효화 전 과정. 검색: `eventType`, `status`, `tokenType` |
| `OAuth2:TokenLookupResult` | 토큰 조회 결과. 검색: `found`, `tokenType` |
| `OAuth2:TokenRequestReceived` | 토큰 요청 진입 |
| `OAuth2:TokenRequestCompleted` | 토큰 요청 완료. 지연 분석: `elapsedMs`. **Shopl 계정 역추적 핵심**: `message_data.userId`/`accountId`로 실제 작업자 식별 (연결고리 rId, 보조 uId) |
| `OAuth2:AuthorizationCodeGenerated` | 인가코드 발급 |
| `OAuth2:OldAuthorizationDeletionCandidate` | 만료 인가 삭제 후보 |
| `OAuth2:OldAuthorizationDeletionCompleted` | 만료 인가 삭제 완료 |

**상세 필드**:
- `TokenLifecycle`: `eventType`*, `status`*, `tokenType`*, `tokenHash`, `tokenValue`, `parentTokenHash`, `authorizationId`, `clientId`, `userId`, `accountId`, `grantType`, `issuedAt`, `expiresAt`, `invalidated`, `reason` (* enum)
- `TokenLookupResult`: `tokenType`, `found`, `tokenValue`, `authorizationId`, `registeredClientId`, `principalName`, `userId`, `accountId`, `refreshTokenExpiresAt`, `refreshTokenInvalidated`
- `TokenRequestReceived`: `uri`, `method`, `grantType`, `clientId`, `refreshToken`, `authorizationHeaderType`
- `TokenRequestCompleted`: `uri`, `method`, `grantType`, `clientId`, `status`, `elapsedMs`, `userId`, `accountId`, `authorizationId`
- `AuthorizationCodeGenerated`: `clientId`, `userId`, `codeLength`, `authorizedScopes[]`
- `OldAuthorizationDeletionCandidate`: `identity`, `authorizationId`, `registeredClientId`, `principalName`, `hasAccessToken`, `accessTokenExpiresAt`, `hasRefreshToken`, `refreshTokenExpiresAt`, `maxExpiresAt`
- `OldAuthorizationDeletionCompleted`: `identity`, `deletedCount`, `deletedAuthorizationIds[]`

### Feign (FeignHttpLogEvent) — 외부 HTTP 클라이언트 호출
**주요 검색 키**: `targetServer`, `uri`, `status`, `elapsedMs`

| message_type | 용도 |
|---|---|
| `Feign:RequestOut` | 외부 API 요청. `targetServer`로 대상 식별 |
| `Feign:ResponseIn` | 외부 API 응답. `elapsedMs`로 외부 지연 분석 |

**상세 필드**: `RequestOut` = `targetServer`, `uri`, `parameter`, `headers`, `body` / `ResponseIn` = `targetServer`, `uri`, `status`, `headers`, `body`, `elapsedMs`

### Device (DeviceLogEvent) — 디바이스 검증/등록
**주요 검색 키**: `userId`, `deviceKey`

| message_type | 용도 |
|---|---|
| `Device:ValidationScenarioDetermined` | 검증 시나리오 결정. `scenario`는 enum |
| `Device:DeviceRegistered` | 디바이스 등록 완료 |

**상세 필드**: `ValidationScenarioDetermined` = `scenario`, `userId`, `deviceKey` / `DeviceRegistered` = `userId`, `deviceKey`

### DB (DataSourceLogEvent) — ⚠️ domainName이 파일명과 다름
파일명은 `DataSourceLogEvent`지만 `domainName()="DB"` → message_type은 `DB:*`. 멀티테넌트 스키마 라우팅 추적.

| message_type | 용도 |
|---|---|
| `DB:SchemaConnectionSuccess` | 스키마 연결 성공 |
| `DB:InvalidSchemaInContext` | 잘못된 스키마 → 폴백 |

**상세 필드**: `SchemaConnectionSuccess` = `schemaName` / `InvalidSchemaInContext` = `invalidSchema`, `fallbackSchema`

### SecurityChain (SecurityChainLogEvent) — Spring Security 필터 체인
**주요 검색 키**: `requestId`(=rId 매칭), `uri`, `remoteIp`

| message_type | 용도 |
|---|---|
| `SecurityChain:AccessDenied` | 접근 거부 (AccessDeniedHandler). `requestId`로 rId 직접 매칭 |

**상세 필드**: `AccessDenied` = `apiType`, `uri`, `method`, `remoteIp`, `errorMessage`, `exceptionType`, `requestId`

### Security (SecurityLogEvent) — 보안 모니터링
| message_type | 용도 |
|---|---|
| `Security:SuspiciousIpDetected` | 의심 IP 탐지 |

**상세 필드**: `SuspiciousIpDetected` = `ipAddress`, `failureCount`, `threshold`

---

## 4. Backend-API (메인: shopl-server-sub)
`service_type:Backend-API`. 근태/인센티브/인증/위치.

### AttendanceRecord (attendance-domain) — 출퇴근 기록
**주요 검색 키**: `clientId`, `workplaceId`

| message_type | 용도 |
|---|---|
| `AttendanceRecord:PunchIn` | 출근 |
| `AttendanceRecord:PunchOut` | 퇴근 |
| `AttendanceRecord:ApplyGraceTimeWithPunchIn` | 출근 유예시간 적용 |
| `AttendanceRecord:ApplyGraceTimeWithPunchOut` | 퇴근 유예시간 적용 |
| `AttendanceRecord:FindWorkplaceListForJpTarget` | 일본 대상 근무지 탐색 |
| `AttendanceRecord:FindWorkplaceListForNonJpTarget` | 비일본 대상 근무지 탐색 |

**상세 필드**: `PunchIn`/`PunchOut` = `clientId`, `workplaceId` / `ApplyGraceTime*` = `origin*Time`, `graced*Time` / `FindWorkplaceList*` = `coordinate`, `accuracy`, `containWorkplaceWithQRAuth`, `foundWorkplaceIds[]`

### Authentication (authorization) — 인증 실패
**주요 검색 키**: `uri`, `remoteAddr`, `exceptionType`

| message_type | 용도 |
|---|---|
| `Authentication:AuthenticationFailed` | 인증 실패 |

**상세 필드**: `uri`, `method`, `exceptionType`, `exceptionMessage`, `hasAuthorizationHeader`, `hasUserTokenHeader`, `userTokenValue`, `remoteAddr`, `userAgent`

### PunchInAvailability (att) — 출근 가능 여부 판정
**주요 검색 키**: `resultCode` (`AVAILABLE`/`NO_WORK_SCHEDULE`/`NO_AVAILABLE_PUNCH_IN_TIME`)

| message_type | 용도 |
|---|---|
| `PunchInAvailability:CurrentAvailableStatus` | 출근 가능 여부 판정 결과 |

**상세 필드**: `resultCode`, `availablePunchInTime`, `hasSchedule`, `hasApprovedOtw`

### LocationCheck (location_check) — 근무지 외 출근 알림
주로 Backend-API. External-API·BATCH에서도 일부 발생.
**주요 검색 키**: `targetId`, `ruleId`

| message_type | 용도 |
|---|---|
| `LocationCheck:Call` | 알림 발송 |
| `LocationCheck:PlanCalls*` | 알림 계획. `*` = `ForNotAttendanceUser`/`WhenModifySchedule`/`WhenPunchIn`/`WhenModifyPunchIn`/`WhenDeletePunchOut`/`WhenApprovePunchInModRequest` |
| `LocationCheck:ClearWaitingCalls*` | 대기 알림 해제. `*` = `WhenPunchOut`/`WhenRequestPunchOut`/`WhenDeletePunchIn` |
| `LocationCheck:RegisterRule` | 규칙 등록 |
| `LocationCheck:ModifyRule` | 규칙 수정 |
| `LocationCheck:RemoveRule` | 규칙 삭제 |

**상세 필드**: `Call` = `ruleId`, `callCount`, `targetUserIds[]` / `PlanCalls*` = `targetId`, `plannedCalls[]` / `ClearWaitingCalls*` = `targetId`, (`ruleId`) / `RegisterRule` = `rule` / `ModifyRule` = `before`, `after` / `RemoveRule` = `ruleId`

### AttClose (att_close) — 근태 마감
> 카탈로그엔 api/legacy로 있었으나 실제 데이터는 `BATCH`에서 주로 발생.

| message_type | 용도 |
|---|---|
| `AttClose:UnapprovalCountScraped` | 미승인 건수 스크랩 |

**상세 필드**: `userId`, `scheduleCount`, `leaveCount`, `punchOutCount`, `overTimeCount`

### IncentiveCalculation / IncentiveStatusUserSchemeAmount — 인센티브 계산·CAP 적용
**주요 검색 키**: `schemeId`, `userId` (계산→CAP 연계 추적은 아래 패턴)

**계산 (IncentiveCalculation)**:

| message_type | 용도 |
|---|---|
| `IncentiveCalculation:CalculationStarted` | 계산 시작 |
| `IncentiveCalculation:CalculationCompleted` | 계산 완료 |
| `IncentiveCalculation:MultiplierApplied` | 배수 적용 |
| `IncentiveCalculation:AmountCalculated` | 금액 계산 상세 |
| `IncentiveCalculation:CalculationError` | **계산 에러** |

**CAP 적용 (IncentiveStatusUserSchemeAmount)**:

| message_type | 용도 |
|---|---|
| `IncentiveStatusUserSchemeAmount:IndividualCapApplied` | 개별 CAP 적용 |
| `IncentiveStatusUserSchemeAmount:AggregateCapResolved` | 집계 CAP 결정 |
| `IncentiveStatusUserSchemeAmount:AggregateCapApplied` | 집계 CAP 적용 |
| `IncentiveStatusUserSchemeAmount:TotalAmountCalculated` | 총액 계산 |

**상세 필드**:
- `CalculationStarted` = `schemeId`, `incentiveType`, `selloutCount`
- `CalculationCompleted` = `schemeId`, `incentiveType`, `resultCount`, `totalAmount`
- `MultiplierApplied` = `schemeId`, `userId`, `categoryAR`, `segmentId`, `segmentAR`, `categoryMultiplier`, `segmentMultiplier`, `combinedMultiplier`
- `AmountCalculated` = `schemeId`, `periodCode`, `userId`, `modelId`, `categoryId`, `segmentId`, `quantity`, `modelPrice`, `commissionType`, `commissionValue`, `*AR`, `*Multiplier`, `incentiveAmount`, `formula`
- `CalculationError` = `schemeId`, `errorMessage`
- `IndividualCapApplied` = `userId`, `schemeId`, `amountBeforeCap`, `capEnabled`, `capAmount`, `isCapApplied`, `amountAfterCap`, `formula`
- `AggregateCapResolved` = `userId`, `schemeId`, `applicableCapCount`, `matchedCapCount`, `priorityRule`, `candidates[]`, `selectedCapId`, `selectedCapAmount`
- `AggregateCapApplied` = `userId`, `capId`, `capAmount`, `schemeAmounts[]`, `amountBeforeCap`, `isCapApplied`, `amountAfterCap`, `formula`
- `TotalAmountCalculated` = `userId`, `filteredSchemeIds[]`, `amountBySchemeId`, `schemesWithoutAggregateCap[]`, `aggregateCapResults[]`, `totalWithoutAggregateCap`, `totalWithAggregateCap`, `totalAmount`, `formula`

**추적 패턴** (계산 → CAP 적용 연계):
`message_data.schemeId`로 묶어 한 scheme의 전체 계산 흐름 추적.
```json
{
  "query": {"bool": {"filter": [
    {"range": {"@timestamp": {"gte": "now-24h"}}},
    {"term": {"service_type": "Backend-API"}},
    {"prefix": {"message_type": "IncentiveCalculation:"}},
    {"term": {"message_data.schemeId": "<SCHEME_ID>"}}
  ]}},
  "sort": [{"@timestamp": "asc"}]
}
```
CAP 적용까지 보려면 prefix를 `Incentive`로 확장: `{"prefix": {"message_type": "Incentive"}}` → `IncentiveCalculation:*` + `IncentiveStatusUserSchemeAmount:*` 한 번에 조회.

### IncentiveExcelFormat / IncentiveModelSpec — 엑셀 업로드 검증
| message_type | 용도 |
|---|---|
| `IncentiveExcelFormat:InvalidFormatDetected` | **엑셀 포맷 오류** |
| `IncentiveModelSpec:RowValidated` | 행 단위 검증 |

**상세 필드**: `InvalidFormatDetected` = `parserType`, `reason`, `fileName`, `sheetIndex`, `titleRow`, `headerRow`, `expectedTitle`, `actualTitle`, `expectedHeaders[]`, `alternateExpectedHeaders[]`, `actualHeaders[]`, `hasSegment`, `isUseEmpId`, `isUsePosition`, `expectedModelCount`, `resolvedReadonlyColumnCount`, `detail` / `RowValidated` = `draftId`, `uploadBatchId`, `rowNumber`, `categoryName`, `segmentName`, `modelName`, `modelPrice`, `isValid`, `shouldSave`, `errors[]`, `categoryId`, `segmentId`

### Retry (api, Java) — 재시도 AOP
| message_type | 용도 |
|---|---|
| `Retry:Counting` | 재시도 카운트 |
| `Retry:Exception` | 재시도 중 예외 |

**상세 필드**: `Counting` = `count`, `handlerName` / `Exception` = `count`, `exceptionName`, `message`

---

## 5. BATCH / Batch-New (shopl-server-sub 배치)
`service_type:BATCH`(레거시) / `Batch-New`(신규). `bJobExecutionId`로 잡 식별. `rId`=스케줄러 ID.

### BatchJob (batch-common) — 배치 라이프사이클
**주요 검색 키**: `jobName`, `jobExecutionId` (= `bJobExecutionId`)

| message_type | 용도 |
|---|---|
| `BatchJob:JobStart` | 잡 시작 |
| `BatchJob:JobEnd` | 잡 종료 |
| `BatchJob:JobFailed` | **잡 실패** (`failureExceptions[]`, `failedSteps[]`) |
| `BatchJob:JobRestart` | 잡 재시작 |

**상세 필드**: `JobStart` = `jobName`, `jobInstanceId`, `jobExecutionId`, `parameters`, `startTime` / `JobEnd` = `jobName`, `jobInstanceId`, `jobExecutionId`, `status`, `startTime`, `endTime`, `durationMillis`, `stepExecutions[]`, `exitDescription` / `JobFailed` = `jobName`, `jobInstanceId`, `jobExecutionId`, `errorMessage`, `failureExceptions[]`, `failedSteps[]` / `JobRestart` = `jobName`, `jobInstanceId`, `jobExecutionId`, `restartReason`

### StagingToAttRecord (batch-attendance) — 근태 기록 동기화
**주요 검색 키**: `stagingRecordId`, `syncStatus`

| message_type | 용도 |
|---|---|
| `StagingToAttRecord:ChunkProcessComplete` | 청크 처리 요약 |
| `StagingToAttRecord:RecordProcessComplete` | 레코드 단위 |
| `StagingToAttRecord:NoDataToProcess` | 처리 데이터 없음 |

**상세 필드**: `ChunkProcessComplete` = `processedCount`, `totalCount`, `skipCount`, `successCount`, `failCount`, `failTypeStats` / `RecordProcessComplete` = `stagingRecordId`, `externalUserMappingKey`, `syncStatus`, `failTypes[]`

### AcsRawDataToStaging (batch-attendance) — ACS 원시→스테이징
| message_type | 용도 |
|---|---|
| `AcsRawDataToStaging:WriteChunkResultSummary` | 쓰기 요약 (중복/삽입/스킵) |

**상세 필드**: `clientId`, `total`, `batchDuplicates`, `dbDuplicates`, `inserted`, `skipped`

### DomainEvent (core-domain-event) — 도메인 이벤트 파이프라인
주로 BATCH, 일부 Backend-API. SNS/SQS 기반.
**주요 검색 키**: (이벤트 내용 = `domainEvent` 객체)

| message_type | 용도 |
|---|---|
| `DomainEvent:DetectUnpublishedEvent` | 미발행 이벤트 감지 |
| `DomainEvent:SuccessPublishingUnpublishedEvent` | 발행 성공 |
| `DomainEvent:FailPublishingUnpublishedEvent` | 발행 실패 |
| `DomainEvent:FailHandlingEvent` | 처리 실패 |
| `DomainEvent:SetupAwsSnsTopicArn` | SNS 설정 |
| `DomainEvent:SetupAwsSqsEventQueueName` | SQS 큐 설정 |
| `DomainEvent:SetupAwsSqsSenderEnable` | SQS 송신 활성화 |
| `DomainEvent:SetupAwsSqsListenerEnable` | SQS 수신 활성화 |

**상세 필드**: `DetectUnpublishedEvent` = `size` / `*Publishing*`·`FailHandlingEvent` = `domainEvent` / `SetupAwsSnsTopicArn` = `snsTopicARN` / `SetupAwsSqsEventQueueName` = `name` / `SetupAwsSqs*Enable` = `isEnable`

---

## 6. LINK (별도 LINK 서비스)
`service_type:LINK`. LINK 서비스 소스 프로젝트 위치는 별도 확인 필요.

### DeepLink — 딥링크 리다이렉트
| message_type | 용도 |
|---|---|
| `DeepLink:Redirect` | 딥링크 리다이렉트 (데이터 구조 미확정 — ES 샘플 조회로 보충 필요) |

---

## 7. 공통 — HTTP (모든 API 서비스)
모든 API 요청/응답 자동 로깅. Backend-API·External-API·IDP 모두 발생. `service_type` 필터로 서비스 구분.

| message_type | 용도 |
|---|---|
| `HTTP:RequestIn` | 요청 진입 |
| `HTTP:RequestBody` | 요청 본문 |
| `HTTP:ResponseBody` | **오류 발생 시에만** |
| `HTTP:ResponseOut` | 응답 status + 소요시간. 느린 API 분석: `message_data.elapseMillis` desc |

**상세 필드**: `RequestIn` = `uri`, `parameter`, `header` / `RequestBody`·`ResponseBody` = `body` / `ResponseOut` = `status`, `elapseMillis`

---

## 8. 크로스 서비스 — AuthAccountSync (인증서버 계정 동기화)
**양쪽 프로젝트(Backend-API + IDP) 모두에서 정의.** `service_type`으로 어느 쪽인지 구분 필수.
- Backend-API(메인 → 인증서버 동기화 호출)
- IDP(인증서버 내 계정 생성: `AuthAccountSync:AccountCreated`)

**주요 검색 키**: `operationType`, `loginId`, `clientId`
`operationType`: `PASSWORD_CHANGE`/`TEMP_PASSWORD_ISSUE`/`LOGIN_ID_CHANGE`/`SIGNUP`/`ACCOUNT_STATUS_CHANGE`/`PASSWORD_UPDATE_DT_CHANGE`/`BATCH_PASSWORD_UPDATE_DT`.

| message_type | 용도 |
|---|---|
| `AuthAccountSync:SyncStarted` | 동기화 시작 |
| `AuthAccountSync:SyncSucceeded` | 성공 |
| `AuthAccountSync:SyncFailedClientError` | 실패(클라이언트 에러, 재시도 불가) |
| `AuthAccountSync:SyncFailedUnexpected` | 실패(예상치 못한 에러) |
| `AuthAccountSync:SyncFailedFinal` | 최종 실패 |
| `AuthAccountSync:ErrorResponseParseFailed` | 에러 응답 파싱 실패 |
| `AuthAccountSync:BatchSyncStarted` | 일괄 업데이트 시작 |
| `AuthAccountSync:BatchSyncSucceeded` | 일괄 성공 |
| `AuthAccountSync:BatchSyncFailedClientError` | 일괄 실패(클라이언트) |
| `AuthAccountSync:BatchSyncFailedFinal` | 일괄 최종 실패 |
| `AuthAccountSync:AccountCreated` | 계정 생성 완료 (IDP 전용) |

**상세 필드**: `SyncStarted` = `operationType`, `loginId`, `userId`, `clientId` / `SyncSucceeded` = `operationType`, `loginId` / `SyncFailedClientError`·`SyncFailedFinal` = `operationType`, `loginId`, (`httpStatus`), `errorCode`, `errorMessage` / `SyncFailedUnexpected` = `operationType`, `loginId`, `exceptionType`, `exceptionMessage` / `ErrorResponseParseFailed` = `exceptionMessage` / `BatchSyncStarted` = `operationType`, `clientId` / `BatchSyncSucceeded` = `operationType`, `clientId`, `updatedCount` / `BatchSyncFailedClientError`·`BatchSyncFailedFinal` = `operationType`, `clientId`, (`httpStatus`), `errorCode`, `errorMessage` / `AccountCreated` = `userId`, `clientId`
