# Shopl 로그 도메인 카탈로그

`message_type = {domainName}:{ClassName}`. 구조화 로그는 `ShoplLogEvent`(shopl)/자체 구현(인증서버)에서 발생.
쿼리 시 `message_type`으로 prefix/term 검색하고, `message_data`의 json path로 데이터를 조건 검색.
`message_data`는 flattened 타입 — 모든 서브필드가 keyword 취급(`term`/`terms`, full-text 불가).

## 분류 기준: `service_type` (1차) → `domainName` (2차)
도메인은 대부분 단일 `service_type`에만 발생(데이터 검증 완료). service_type으로 먼저 좁히면 정확하고 빠르다.
여러 서비스에 걸치는 도메인은 [크로스 서비스](#크로스-서비스-도메인) 참조.

| service_type | 출처 프로젝트 | 전용 도메인 |
|---|---|---|
| `IDP` | shopl-authorization-server | OAuth2, Feign, Device, SecurityChain, Security, DB |
| `Backend-API` | shopl-server-sub (메인) | AttendanceRecord, Authentication, PunchInAvailability, Incentive*, LocationCheck, AttClose, IncentiveExcelFormat, IncentiveModelSpec, Retry |
| `BATCH` / `Batch-New` | shopl-server-sub (배치) | BatchJob, StagingToAttRecord, AcsRawDataToStaging |
| `LINK` | (별도 LINK 서비스) | DeepLink |
| 공통 | 모든 API 서비스 | HTTP |
| — | 모든 서비스 | `(none)` — message_type 없는 일반 문자열 로그 |

> 데이터 출처: ES 실제 집계(2026-07). 1:1 매핑이 깨지는 도메인은 개별 비고 참조.

---

## 공통 — HTTP (모든 API 서비스)
모든 API 요청/응답 자동 로깅. Backend-API·External-API·IDP 모두에서 발생. `service_type` 필터로 서비스 구분.
| message_type | 데이터 (message_data) | 비고 |
|---|---|---|
| `HTTP:RequestIn` | `uri`, `parameter`, `header` | 요청 진입 |
| `HTTP:RequestBody` | `body` | 요청 본문 |
| `HTTP:ResponseBody` | `body` | **오류 발생 시에만** |
| `HTTP:ResponseOut` | `status`, `elapseMillis` | 응답 http status + 소요시간 |

> 느린 API 분석: `message_type:HTTP:ResponseOut` + `message_data.elapseMillis` 내림차순 정렬 (flattened 정렬 가능).

---

## IDP (인증서버: shopl-authorization-server)
토큰·외부호출·디바이스·보안. `service_type:IDP`로 먼저 좁힐 것.

### OAuth2 (OAuth2LogEvent) — 인증 토큰 라이프사이클. 빈도 최상.
| message_type | 데이터 | 비고 |
|---|---|---|
| `OAuth2:TokenLifecycle` | `eventType`, `status`, `tokenType`, `tokenHash`, `tokenValue`, `parentTokenHash`, `authorizationId`, `clientId`, `userId`, `accountId`, `grantType`, `issuedAt`, `expiresAt`, `invalidated`, `reason` | 토큰 발급/갱신/무효화 전 과정. `eventType`/`status`는 enum |
| `OAuth2:TokenLookupResult` | `tokenType`, `found`, `tokenValue`, `authorizationId`, `registeredClientId`, `principalName`, `userId`, `accountId`, `refreshTokenExpiresAt`, `refreshTokenInvalidated` | 토큰 조회 결과 |
| `OAuth2:TokenRequestReceived` | `uri`, `method`, `grantType`, `clientId`, `refreshToken`, `authorizationHeaderType` | 토큰 요청 진입 |
| `OAuth2:TokenRequestCompleted` | `uri`, `method`, `grantType`, `clientId`, `status`, `elapsedMs`, `userId`, `accountId`, `authorizationId` | 토큰 요청 완료 (status/elapsedMs로 지연 분석) |
| `OAuth2:AuthorizationCodeGenerated` | `clientId`, `userId`, `codeLength`, `authorizedScopes[]` | 인가코드 발급 |
| `OAuth2:OldAuthorizationDeletionCandidate` | `identity`, `authorizationId`, `registeredClientId`, `principalName`, `hasAccessToken`, `accessTokenExpiresAt`, `hasRefreshToken`, `refreshTokenExpiresAt`, `maxExpiresAt` | 만료 인가 삭제 후보 |
| `OAuth2:OldAuthorizationDeletionCompleted` | `identity`, `deletedCount`, `deletedAuthorizationIds[]` | 만료 인가 삭제 완료 |

### Feign (FeignHttpLogEvent) — 외부 HTTP 클라이언트 호출
| message_type | 데이터 | 비고 |
|---|---|---|
| `Feign:RequestOut` | `targetServer`, `uri`, `parameter`, `headers`, `body` | 외부 API 요청. `targetServer`로 대상 식별 |
| `Feign:ResponseIn` | `targetServer`, `uri`, `status`, `headers`, `body`, `elapsedMs` | 외부 API 응답. `elapsedMs`로 외부 지연 분석 |

### Device (DeviceLogEvent) — 디바이스 검증/등록
| message_type | 데이터 | 비고 |
|---|---|---|
| `Device:ValidationScenarioDetermined` | `scenario`, `userId`, `deviceKey` | 디바이스 검증 시나리오 결정 (`scenario`는 enum) |
| `Device:DeviceRegistered` | `userId`, `deviceKey` | 디바이스 등록 완료 |

### DB (DataSourceLogEvent) — ⚠️ domainName이 파일명과 다름
파일명은 `DataSourceLogEvent`지만 `domainName()="DB"`. message_type은 `DB:*`. 멀티테넌트 스키마 라우팅 추적.
| message_type | 데이터 | 비고 |
|---|---|---|
| `DB:SchemaConnectionSuccess` | `schemaName` | 스키마 연결 성공 |
| `DB:InvalidSchemaInContext` | `invalidSchema`, `fallbackSchema` | 잘못된 스키마 → 폴백 |

### SecurityChain (SecurityChainLogEvent) — Spring Security 필터 체인
| message_type | 데이터 | 비고 |
|---|---|---|
| `SecurityChain:AccessDenied` | `apiType`, `uri`, `method`, `remoteIp`, `errorMessage`, `exceptionType`, `requestId` | 접근 거부 (AccessDeniedHandler). `requestId`는 rId와 매칭 가능 |

### Security (SecurityLogEvent) — 보안 모니터링
| message_type | 데이터 | 비고 |
|---|---|---|
| `Security:SuspiciousIpDetected` | `ipAddress`, `failureCount`, `threshold` | 의심 IP 탐지 |

---

## Backend-API (메인: shopl-server-sub)
근태/인센티브/인증/위치. `service_type:Backend-API`로 먼저 좁힐 것.

### AttendanceRecord (attendance-domain) — 출퇴근 기록
| message_type | 데이터 | 비고 |
|---|---|---|
| `AttendanceRecord:PunchIn` | `clientId`, `workplaceId` | 출근 |
| `AttendanceRecord:PunchOut` | `clientId`, `workplaceId` | 퇴근 |
| `AttendanceRecord:ApplyGraceTimeWithPunchIn` | `originPunchInTime`, `gracedPunchInTime` | 출근 유예시간 적용 |
| `AttendanceRecord:ApplyGraceTimeWithPunchOut` | `originPunchOutTime`, `gracedPunchOutTime` | 퇴근 유예시간 적용 |
| `AttendanceRecord:FindWorkplaceListForJpTarget` | `coordinate`, `accuracy`, `containWorkplaceWithQRAuth`, `foundWorkplaceIds[]` | 일본 대상 근무지 탐색 |
| `AttendanceRecord:FindWorkplaceListForNonJpTarget` | `coordinate`, `accuracy`, `containWorkplaceWithQRAuth`, `foundWorkplaceIds[]` | 비일본 대상 근무지 탐색 |

### Authentication (authorization) — 인증 실패
| message_type | 데이터 | 비고 |
|---|---|---|
| `Authentication:AuthenticationFailed` | `uri`, `method`, `exceptionType`, `exceptionMessage`, `hasAuthorizationHeader`, `hasUserTokenHeader`, `userTokenValue`, `remoteAddr`, `userAgent` | 인증 실패 |

### PunchInAvailability (att) — 출근 가능 여부 판정
| message_type | 데이터 | 비고 |
|---|---|---|
| `PunchInAvailability:CurrentAvailableStatus` | `resultCode`, `availablePunchInTime`, `hasSchedule`, `hasApprovedOtw` | resultCode: `AVAILABLE`/`NO_WORK_SCHEDULE`/`NO_AVAILABLE_PUNCH_IN_TIME` |

### LocationCheck (location_check) — 근무지 외 출근 알림
주로 Backend-API. External-API·BATCH에서도 일부 발생.
| message_type | 데이터 | 비고 |
|---|---|---|
| `LocationCheck:Call` | `ruleId`, `callCount`, `targetUserIds[]` | 알림 발송 |
| `LocationCheck:PlanCalls*` | `targetId`, `plannedCalls[]` | `*` = `ForNotAttendanceUser`/`WhenModifySchedule`/`WhenPunchIn`/`WhenModifyPunchIn`/`WhenDeletePunchOut`/`WhenApprovePunchInModRequest` |
| `LocationCheck:ClearWaitingCalls*` | `targetId`, (`ruleId`) | `*` = `WhenPunchOut`/`WhenRequestPunchOut`/`WhenDeletePunchIn` |
| `LocationCheck:RegisterRule` | `rule` | 규칙 등록 |
| `LocationCheck:ModifyRule` | `before`, `after` | 규칙 수정 |
| `LocationCheck:RemoveRule` | `ruleId` | 규칙 삭제 |

### AttClose (att_close) — 근태 마감
> 카탈로그엔 api/legacy로 있었으나 실제 데이터는 `BATCH`에서 주로 발생.
| message_type | 데이터 | 비고 |
|---|---|---|
| `AttClose:UnapprovalCountScraped` | `userId`, `scheduleCount`, `leaveCount`, `punchOutCount`, `overTimeCount` | 미승인 건수 스크랩 |

### IncentiveCalculation (target-evaluation) — 인센티브 계산
| message_type | 데이터 | 비고 |
|---|---|---|
| `IncentiveCalculation:CalculationStarted` | `schemeId`, `incentiveType`, `selloutCount` | 계산 시작 |
| `IncentiveCalculation:CalculationCompleted` | `schemeId`, `incentiveType`, `resultCount`, `totalAmount` | 계산 완료 |
| `IncentiveCalculation:MultiplierApplied` | `schemeId`, `userId`, `categoryAR`, `segmentId`, `segmentAR`, `categoryMultiplier`, `segmentMultiplier`, `combinedMultiplier` | 배수 적용 |
| `IncentiveCalculation:AmountCalculated` | `schemeId`, `periodCode`, `userId`, `modelId`, `categoryId`, `segmentId`, `quantity`, `modelPrice`, `commissionType`, `commissionValue`, `*AR`, `*Multiplier`, `incentiveAmount`, `formula` | 금액 계산 상세 |
| `IncentiveCalculation:CalculationError` | `schemeId`, `errorMessage` | **계산 에러** |

### IncentiveStatusUserSchemeAmount (incentive) — 인센티브 CAP 적용
| message_type | 데이터 | 비고 |
|---|---|---|
| `IncentiveStatusUserSchemeAmount:IndividualCapApplied` | `userId`, `schemeId`, `amountBeforeCap`, `capEnabled`, `capAmount`, `isCapApplied`, `amountAfterCap`, `formula` | 개별 CAP 적용 |
| `IncentiveStatusUserSchemeAmount:AggregateCapResolved` | `userId`, `schemeId`, `applicableCapCount`, `matchedCapCount`, `priorityRule`, `candidates[]`, `selectedCapId`, `selectedCapAmount` | 집계 CAP 결정 |
| `IncentiveStatusUserSchemeAmount:AggregateCapApplied` | `userId`, `capId`, `capAmount`, `schemeAmounts[]`, `amountBeforeCap`, `isCapApplied`, `amountAfterCap`, `formula` | 집계 CAP 적용 |
| `IncentiveStatusUserSchemeAmount:TotalAmountCalculated` | `userId`, `filteredSchemeIds[]`, `amountBySchemeId`, `schemesWithoutAggregateCap[]`, `aggregateCapResults[]`, `totalWithoutAggregateCap`, `totalWithAggregateCap`, `totalAmount`, `formula` | 총액 계산 |

#### IncentiveCalculation — IncentiveStatusUserSchemeAmount 추적 패턴
`IncentiveCalculation`(계산 도메인) → `IncentiveStatusUserSchemeAmount`(CAP 적용) 순서로 연계. `message_data.schemeId`로 묶어 한 scheme의 전체 계산 흐름을 추적.
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
→ CAP 적용까지 보려면 `message_type` prefix를 `Incentive` 전체로 확장:
```json
{"prefix": {"message_type": "Incentive"}}
```
이렇게 하면 `IncentiveCalculation:*` + `IncentiveStatusUserSchemeAmount:*` 한 번에 조회.

### IncentiveExcelFormat / IncentiveModelSpec (incentive) — 엑셀 업로드 검증
| message_type | 데이터 | 비고 |
|---|---|---|
| `IncentiveExcelFormat:InvalidFormatDetected` | `parserType`, `reason`, `fileName`, `sheetIndex`, `titleRow`, `headerRow`, `expectedTitle`, `actualTitle`, `expectedHeaders[]`, `alternateExpectedHeaders[]`, `actualHeaders[]`, `hasSegment`, `isUseEmpId`, `isUsePosition`, `expectedModelCount`, `resolvedReadonlyColumnCount`, `detail` | **엑셀 포맷 오류** |
| `IncentiveModelSpec:RowValidated` | `draftId`, `uploadBatchId`, `rowNumber`, `categoryName`, `segmentName`, `modelName`, `modelPrice`, `isValid`, `shouldSave`, `errors[]`, `categoryId`, `segmentId` | 행 단위 검증 |

### Retry (api, Java) — 재시도 AOP
| message_type | 데이터 | 비고 |
|---|---|---|
| `Retry:Counting` | `count`, `handlerName` | 재시도 카운트 |
| `Retry:Exception` | `count`, `exceptionName`, `message` | 재시도 중 예외 |

---

## BATCH / Batch-New (shopl-server-sub 배치)
`service_type:BATCH`(레거시) / `Batch-New`(신규). `bJobExecutionId`로 잡 식별.

### BatchJob (batch-common) — 배치 라이프사이클
`rId`=스케줄러 ID, `bJobExecutionId`와 연계.
| message_type | 데이터 | 비고 |
|---|---|---|
| `BatchJob:JobStart` | `jobName`, `jobInstanceId`, `jobExecutionId`, `parameters`, `startTime` | 잡 시작 |
| `BatchJob:JobEnd` | `jobName`, `jobInstanceId`, `jobExecutionId`, `status`, `startTime`, `endTime`, `durationMillis`, `stepExecutions[]`, `exitDescription` | 잡 종료 |
| `BatchJob:JobFailed` | `jobName`, `jobInstanceId`, `jobExecutionId`, `errorMessage`, `failureExceptions[]`, `failedSteps[]` | **잡 실패** |
| `BatchJob:JobRestart` | `jobName`, `jobInstanceId`, `jobExecutionId`, `restartReason` | 잡 재시작 |

### StagingToAttRecord (batch-attendance) — 근태 기록 동기화
| message_type | 데이터 | 비고 |
|---|---|---|
| `StagingToAttRecord:ChunkProcessComplete` | `processedCount`, `totalCount`, `skipCount`, `successCount`, `failCount`, `failTypeStats` | 청크 처리 요약 |
| `StagingToAttRecord:RecordProcessComplete` | `stagingRecordId`, `externalUserMappingKey`, `syncStatus`, `failTypes[]` | 레코드 단위 |
| `StagingToAttRecord:NoDataToProcess` | — | 처리 데이터 없음 |

### AcsRawDataToStaging (batch-attendance) — ACS 원시→스테이징
| message_type | 데이터 | 비고 |
|---|---|---|
| `AcsRawDataToStaging:WriteChunkResultSummary` | `clientId`, `total`, `batchDuplicates`, `dbDuplicates`, `inserted`, `skipped` | 쓰기 요약 (중복/삽입/스킵) |

### DomainEvent (core-domain-event) — 도메인 이벤트 파이프라인
주로 BATCH, 일부 Backend-API. SNS/SQS 기반.
| message_type | 데이터 | 비고 |
|---|---|---|
| `DomainEvent:DetectUnpublishedEvent` | `size` | 미발행 이벤트 감지 |
| `DomainEvent:SuccessPublishingUnpublishedEvent` | `domainEvent` | 발행 성공 |
| `DomainEvent:FailPublishingUnpublishedEvent` | `domainEvent` | 발행 실패 |
| `DomainEvent:FailHandlingEvent` | `domainEvent` | 처리 실패 |
| `DomainEvent:SetupAwsSnsTopicArn` | `snsTopicARN` | SNS 설정 |
| `DomainEvent:SetupAwsSqsEventQueueName` | `name` | SQS 큐 설정 |
| `DomainEvent:SetupAwsSqsSenderEnable` | `isEnable` | SQS 송신 활성화 |
| `DomainEvent:SetupAwsSqsListenerEnable` | `isEnable` | SQS 수신 활성화 |

---

## LINK (별도 LINK 서비스)
> LINK 서비스 소스 프로젝트 위치는 별도 확인 필요.

### DeepLink — 딥링크 리다이렉트
| message_type | 데이터 | 비고 |
|---|---|---|
| `DeepLink:Redirect` | (데이터 구조 미확정 — ES 샘플 조회로 보충 필요) | 딥링크 리다이렉트 |

---

## 크로스 서비스 도메인
여러 service_type에 걸쳐 발생. service_type 필터 없이 도메인만 쿼리하면 결과가 섞임.

### AuthAccountSync — 인증서버 계정 동기화
**양쪽 프로젝트(Backend-API + IDP) 모두에서 정의.** `service_type`으로 어느 쪽인지 구분 필수.
- Backend-API(498건/3h): 메인 서버 → 인증서버 동기화 호출
- IDP(249건/3h): 인증서버 내 계정 생성 (`AuthAccountSync:AccountCreated` `userId`, `clientId`)

`operationType`: `PASSWORD_CHANGE`/`TEMP_PASSWORD_ISSUE`/`LOGIN_ID_CHANGE`/`SIGNUP`/`ACCOUNT_STATUS_CHANGE`/`PASSWORD_UPDATE_DT_CHANGE`/`BATCH_PASSWORD_UPDATE_DT`.
| message_type | 데이터 | 비고 |
|---|---|---|
| `AuthAccountSync:SyncStarted` | `operationType`, `loginId`, `userId`, `clientId` | 동기화 시작 |
| `AuthAccountSync:SyncSucceeded` | `operationType`, `loginId` | 성공 |
| `AuthAccountSync:SyncFailedClientError` | `operationType`, `loginId`, `httpStatus`, `errorCode`, `errorMessage` | 실패(클라이언트 에러, 재시도 불가) |
| `AuthAccountSync:SyncFailedUnexpected` | `operationType`, `loginId`, `exceptionType`, `exceptionMessage` | 실패(예상치 못한 에러) |
| `AuthAccountSync:SyncFailedFinal` | `operationType`, `loginId`, `errorCode`, `errorMessage` | 최종 실패 |
| `AuthAccountSync:ErrorResponseParseFailed` | `exceptionMessage` | 에러 응답 파싱 실패 |
| `AuthAccountSync:BatchSyncStarted` | `operationType`, `clientId` | 일괄 업데이트 시작 |
| `AuthAccountSync:BatchSyncSucceeded` | `operationType`, `clientId`, `updatedCount` | 일괄 성공 |
| `AuthAccountSync:BatchSyncFailedClientError` | `operationType`, `clientId`, `httpStatus`, `errorCode`, `errorMessage` | 일괄 실패(클라이언트) |
| `AuthAccountSync:BatchSyncFailedFinal` | `operationType`, `clientId`, `errorCode`, `errorMessage` | 일괄 최종 실패 |
| `AuthAccountSync:AccountCreated` | `userId`, `clientId` | 계정 생성 완료 (IDP 전용) |

---

## `(none)` — message_type 없는 일반 문자열 로그
`message_type`이 비어 있는 로그. `ShoplLogEvent`를 쓰지 않고 `logger.info("문자열")`로 찍은 일반 로그.
**IDP에서 특히 많음(3h에 183만건).** stack_trace 기반 예외 로그의 대부분이 여기 해당.

- `message_type`/`rId`가 null → message_type 기반 추적 불가, rId 확장 불가
- 예외 핸들러(`IoExceptionHandlerV2`, `ResponseExceptionHandler`) 로그가 여기 해당
- **에러 추적 시 핵심 허점**: SKILL.md "에러 분석(recipe)"의 timestamp 역추적 패턴 참조
