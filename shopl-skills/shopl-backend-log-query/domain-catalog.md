# Shopl 로그 도메인 카탈로그

`message_type = {domainName}:{ClassName}`. 총 17개 domainName.
쿼리 시 `message_type`으로 prefix/term 검색하고, `message_data`의 json path로 데이터를 조건 검색.
`message_data`는 flattened 타입 — 모든 서브필드가 keyword 취급(`term`/`terms`, full-text 불가).

> 출처: `shopl-support/support-logging` 의 `ShoplLogEvent` 구현체 + 각 도메인 모듈.

---

## HTTP (support-logging) — API 추적의 뼈대
모든 API 요청/응답 자동 로깅. `message_data`에 uri/status/소요시간 포함.
| message_type | 데이터 (message_data) | 비고 |
|---|---|---|
| `HTTP:RequestIn` | `uri`, `parameter`, `header` | 요청 진입 |
| `HTTP:RequestBody` | `body` | 요청 본문 |
| `HTTP:ResponseBody` | `body` | **오류 발생 시에만** |
| `HTTP:ResponseOut` | `status`, `elapseMillis` | 응답 http status + 소요시간 |

## BatchJob (batch-common) — 배치 라이프사이클
`rId`=스케줄러 ID, `bJobExecutionId`와 연계.
| message_type | 데이터 | 비고 |
|---|---|---|
| `BatchJob:JobStart` | `jobName`, `jobInstanceId`, `jobExecutionId`, `parameters`, `startTime` | 잡 시작 |
| `BatchJob:JobEnd` | `jobName`, `jobInstanceId`, `jobExecutionId`, `status`, `startTime`, `endTime`, `durationMillis`, `stepExecutions[]`, `exitDescription` | 잡 종료 |
| `BatchJob:JobFailed` | `jobName`, `jobInstanceId`, `jobExecutionId`, `errorMessage`, `failureExceptions[]`, `failedSteps[]` | **잡 실패** |
| `BatchJob:JobRestart` | `jobName`, `jobInstanceId`, `jobExecutionId`, `restartReason` | 잡 재시작 |

## StagingToAttRecord (batch-attendance) — 근태 기록 동기화
| message_type | 데이터 | 비고 |
|---|---|---|
| `StagingToAttRecord:ChunkProcessComplete` | `processedCount`, `totalCount`, `skipCount`, `successCount`, `failCount`, `failTypeStats` | 청크 처리 요약 |
| `StagingToAttRecord:RecordProcessComplete` | `stagingRecordId`, `externalUserMappingKey`, `syncStatus`, `failTypes[]` | 레코드 단위 |
| `StagingToAttRecord:NoDataToProcess` | — | 처리 데이터 없음 |

## AcsRawDataToStaging (batch-attendance) — ACS 원시→스테이징
| message_type | 데이터 | 비고 |
|---|---|---|
| `AcsRawDataToStaging:WriteChunkResultSummary` | `clientId`, `total`, `batchDuplicates`, `dbDuplicates`, `inserted`, `skipped` | 쓰기 요약 (중복/삽입/스킵) |

## AttendanceRecord (attendance-domain) — 출퇴근 기록
| message_type | 데이터 | 비고 |
|---|---|---|
| `AttendanceRecord:PunchIn` | `clientId`, `workplaceId` | 출근 |
| `AttendanceRecord:PunchOut` | `clientId`, `workplaceId` | 퇴근 |
| `AttendanceRecord:ApplyGraceTimeWithPunchIn` | `originPunchInTime`, `gracedPunchInTime` | 출근 유예시간 적용 |
| `AttendanceRecord:ApplyGraceTimeWithPunchOut` | `originPunchOutTime`, `gracedPunchOutTime` | 퇴근 유예시간 적용 |
| `AttendanceRecord:FindWorkplaceListForJpTarget` | `coordinate`, `accuracy`, `containWorkplaceWithQRAuth`, `foundWorkplaceIds[]` | 일본 대상 근무지 탐색 |
| `AttendanceRecord:FindWorkplaceListForNonJpTarget` | `coordinate`, `accuracy`, `containWorkplaceWithQRAuth`, `foundWorkplaceIds[]` | 비일본 대상 근무지 탐색 |

## PunchInAvailability (api/legacy) — 출근 가능 여부 판정
| message_type | 데이터 | 비고 |
|---|---|---|
| `PunchInAvailability:CurrentAvailableStatus` | `resultCode`, `availablePunchInTime`, `hasSchedule`, `hasApprovedOtw` | resultCode: `AVAILABLE`/`NO_WORK_SCHEDULE`/`NO_AVAILABLE_PUNCH_IN_TIME` |

## LocationCheck (api/legacy) — 근무지 외 출근 알림
| message_type | 데이터 | 비고 |
|---|---|---|
| `LocationCheck:Call` | `ruleId`, `callCount`, `targetUserIds[]` | 알림 발송 |
| `LocationCheck:PlanCalls*` | `targetId`, `plannedCalls[]` | `*` = `ForNotAttendanceUser`/`WhenModifySchedule`/`WhenPunchIn`/`WhenModifyPunchIn`/`WhenDeletePunchOut`/`WhenApprovePunchInModRequest` |
| `LocationCheck:ClearWaitingCalls*` | `targetId`, (`ruleId`) | `*` = `WhenPunchOut`/`WhenRequestPunchOut`/`WhenDeletePunchIn` |
| `LocationCheck:RegisterRule` | `rule` | 규칙 등록 |
| `LocationCheck:ModifyRule` | `before`, `after` | 규칙 수정 |
| `LocationCheck:RemoveRule` | `ruleId` | 규칙 삭제 |

## AttClose (api/legacy) — 근태 마감
| message_type | 데이터 | 비고 |
|---|---|---|
| `AttClose:UnapprovalCountScraped` | `userId`, `scheduleCount`, `leaveCount`, `punchOutCount`, `overTimeCount` | 미승인 건수 스크랩 |

## IncentiveCalculation (target-evaluation) — 인센티브 계산
`schemeId`로 계산 흐름 추적.
| message_type | 데이터 | 비고 |
|---|---|---|
| `IncentiveCalculation:CalculationStarted` | `schemeId`, `incentiveType`, `selloutCount` | 계산 시작 |
| `IncentiveCalculation:CalculationCompleted` | `schemeId`, `incentiveType`, `resultCount`, `totalAmount` | 계산 완료 |
| `IncentiveCalculation:MultiplierApplied` | `schemeId`, `userId`, `categoryAR`, `segmentId`, `segmentAR`, `categoryMultiplier`, `segmentMultiplier`, `combinedMultiplier` | 배수 적용 |
| `IncentiveCalculation:AmountCalculated` | `schemeId`, `periodCode`, `userId`, `modelId`, `categoryId`, `segmentId`, `quantity`, `modelPrice`, `commissionType`, `commissionValue`, `*AR`, `*Multiplier`, `incentiveAmount`, `formula` | 금액 계산 상세 |
| `IncentiveCalculation:CalculationError` | `schemeId`, `errorMessage` | **계산 에러** |

## IncentiveStatusUserSchemeAmount (api/legacy) — 인센티브 CAP 적용
`IncentiveCalculation` 이후 단계. userId/schemeId로 묶어 추적.
| message_type | 데이터 | 비고 |
|---|---|---|
| `IncentiveStatusUserSchemeAmount:IndividualCapApplied` | `userId`, `schemeId`, `amountBeforeCap`, `capEnabled`, `capAmount`, `isCapApplied`, `amountAfterCap`, `formula` | 개별 CAP 적용 |
| `IncentiveStatusUserSchemeAmount:AggregateCapResolved` | `userId`, `schemeId`, `applicableCapCount`, `matchedCapCount`, `priorityRule`, `candidates[]`, `selectedCapId`, `selectedCapAmount` | 집계 CAP 결정 |
| `IncentiveStatusUserSchemeAmount:AggregateCapApplied` | `userId`, `capId`, `capAmount`, `schemeAmounts[]`, `amountBeforeCap`, `isCapApplied`, `amountAfterCap`, `formula` | 집계 CAP 적용 |
| `IncentiveStatusUserSchemeAmount:TotalAmountCalculated` | `userId`, `filteredSchemeIds[]`, `amountBySchemeId`, `schemesWithoutAggregateCap[]`, `aggregateCapResults[]`, `totalWithoutAggregateCap`, `totalWithAggregateCap`, `totalAmount`, `formula` | 총액 계산 |

## CapSync (target-evaluation) — CAP-스킴 매핑 동기화
| message_type | 데이터 | 비고 |
|---|---|---|
| `CapSync:MappingsAdded` | `schemeId`, `capIds[]`, `trigger` | 매핑 추가 |
| `CapSync:MappingsRemoved` | `schemeId`, `capIds[]`, `trigger` | 매핑 제거 |
| `CapSync:MappingsRebuilt` | `aggregateCapId`, `removedSchemeIds[]`, `addedSchemeIds[]`, `trigger` | 매핑 재구성 |

## IncentiveExcelFormat (api/legacy) — 인센티브 엑셀 포맷
| message_type | 데이터 | 비고 |
|---|---|---|
| `IncentiveExcelFormat:InvalidFormatDetected` | `parserType`, `reason`, `fileName`, `sheetIndex`, `titleRow`, `headerRow`, `expectedTitle`, `actualTitle`, `expectedHeaders[]`, `alternateExpectedHeaders[]`, `actualHeaders[]`, `hasSegment`, `isUseEmpId`, `isUsePosition`, `expectedModelCount`, `resolvedReadonlyColumnCount`, `detail` | **엑셀 포맷 오류** |

## IncentiveModelSpec (api/legacy) — 모델 스펙 검증
| message_type | 데이터 | 비고 |
|---|---|---|
| `IncentiveModelSpec:RowValidated` | `draftId`, `uploadBatchId`, `rowNumber`, `categoryName`, `segmentName`, `modelName`, `modelPrice`, `isValid`, `shouldSave`, `errors[]`, `categoryId`, `segmentId` | 행 단위 검증 |

## AuthAccountSync (api/legacy) — 인증서버 계정 동기화
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

## Authentication (api/legacy) — 인증 실패
| message_type | 데이터 | 비고 |
|---|---|---|
| `Authentication:AuthenticationFailed` | `uri`, `method`, `exceptionType`, `exceptionMessage`, `hasAuthorizationHeader`, `hasUserTokenHeader`, `userTokenValue`, `remoteAddr`, `userAgent` | 인증 실패 |

## DomainEvent (core-domain-event) — 도메인 이벤트 파이프라인
SNS/SQS 기반 이벤트 발행/처리.
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

## Retry (api/legacy, Java) — 재시도 AOP
| message_type | 데이터 | 비고 |
|---|---|---|
| `Retry:Counting` | `count`, `handlerName` | 재시도 카운트 |
| `Retry:Exception` | `count`, `exceptionName`, `message` | 재시도 중 예외 |
