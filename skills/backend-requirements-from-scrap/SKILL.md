---
name: backend-requirements-from-scrap
description: "Scrap된 기획서, Figma 캡처, 와이어프레임, 샘플 Excel을 현재 백엔드 구현과 대조하여 구현 기준의 백엔드 변경 요구사항, 확인 필요 항목, 기능 단위 하위작업을 추출한다. Trigger: scrap 기획서 분석, 백엔드 요구사항 추출, 현재 구현 반영 요구사항 정리, 기획-구현 gap 분석, Figma scrap 기반 요구사항 문서화."
---

# Backend Requirements From Scrap

## 목차

1. [목적](#목적)
2. [사용 시점](#사용-시점)
3. [필수 입력 계약](#필수-입력-계약)
4. [핵심 원칙](#핵심-원칙)
5. [입력 자료 수집 순서](#입력-자료-수집-순서)
6. [분석 절차](#분석-절차)
7. [요구사항 작성 형식](#요구사항-작성-형식)
8. [참고 자료 링크 작성 규칙](#참고-자료-링크-작성-규칙)
9. [권장 문서 구조](#권장-문서-구조)
10. [현재 구현 확인 체크리스트](#현재-구현-확인-체크리스트)
11. [요구사항 작성 체크리스트](#요구사항-작성-체크리스트)
12. [출력 시 주의사항](#출력-시-주의사항)

## 목적

Scrap된 기획 자료를 그대로 요약하지 않고, **현재 백엔드 구현과 대조하여 실제 변경이 필요한 백엔드 요구사항**으로 재구성함.

주요 산출물:

- 현재 구현 상태 정리
- 기획 요구사항 요약
- 현재 구현 대비 Gap 분석
- 기능 단위 백엔드 변경 요구사항
- API/DB/계산/Excel/검증 영향 범위
- 기획/정책 확인 필요 항목
- 향후 백엔드 구현용 기능 단위 하위작업 이름

최종 결과에서 반드시 구분할 항목:

- 이미 구현된 기능
- 부분 구현된 기능
- 신규 구현 필요 기능
- 현재 구현과 기획이 어긋나는 기능
- 기획/정책 확인 필요 항목
- 프론트 중심 가능성이 높은 항목

## 사용 시점

사용자가 다음과 같이 요청하면 이 스킬 사용.

- “scrap된 기획서에서 백엔드 요구사항 뽑아줘”
- “Figma scrap 보고 백엔드 요구사항 정리해줘”
- “현재 구현 기준으로 기획서를 어떻게 바꿔야 하는지 정리해줘”
- “기획서와 구현을 비교해서 gap 분석해줘”
- “스크린샷/와이어프레임/엑셀 샘플을 보고 서버 작업 목록 뽑아줘”
- “이번 스프린트에서 백엔드가 실제로 해야 할 일 정리해줘”

## 필수 입력 계약

이 스킬은 scrap 자료와 현재 구현을 대조하는 스킬이므로, **scrap 자료 경로와 구현 확인 범위가 모두 있어야 실행 가능**함.

### 1. 필수 입력

다음 입력을 모두 받아야 함.

- Scrap 자료 경로
  - 예: `docs/<feature>/scrap`
  - 예: `docs/<feature>/scrap/index.md`
  - 예: `docs/<feature>/scrap/02_requirements/README.md`
- 구현 확인 범위
  - 특정 클래스 파일
  - 특정 패키지 디렉터리
  - 특정 모듈
  - 특정 API/controller/service 진입점
  - 사용자가 명시한 기능 흐름

### 2. 허용 가능한 구현 범위 예

특정 클래스:

- `core/src/main/kotlin/.../IoAttAggregationReportSet.kt`
- `api/src/main/kotlin/.../AttAggregationExcelDownloadService.kt`

특정 패키지:

- `api/src/main/kotlin/com/planetory/io/feature/export/service`
- `api/src/main/kotlin/com/planetory/io/feature/att_aggregation`

특정 모듈:

- `api`
- `core`
- `shopl-api/api-attendance`
- `shopl-core/core-system-feature`

기능 진입점:

- “근태 종합 리포트 다운로드 API”
- “Excel 생성 서비스”
- “리포트 설정 저장/수정 API”

### 3. 범위 미지정 시 동작

구현 확인 범위가 지정되지 않은 경우 다음 규칙 적용.

- 분석 시작 금지
- 전체 코드베이스 탐색 금지
- 임의 관련 패키지 추정 금지
- 백엔드 요구사항 문서 작성 금지
- 현재 구현 대비 Gap 분석 금지
- 구현 하위작업 목록 작성 금지
- 먼저 사용자에게 구현 확인 범위 지정 요청

사용자에게 요청할 질문 예:

```text
현재 구현과 대조할 클래스/패키지/모듈 범위를 지정해주세요.
예: `AttAggregationExcelDownloadService`, `IoAttAggregationReportSet`, `api/.../export/service`
```

### 4. 범위 확장 제한

지정된 범위 밖의 코드는 다음 경우에만 추가 확인 가능.

- 지정 클래스가 직접 import하거나 호출하는 경우
- DTO/Entity/Mapper/Validator/Repository처럼 기능 흐름상 필수 연결인 경우
- 지정 패키지 내부 동작을 이해하는 데 필요한 인접 파일인 경우
- 사용자가 추가 범위 확인을 승인한 경우

범위 확장이 필요하면 다음 형식으로 먼저 설명 후 진행.

```md
추가 확인이 필요한 범위:

- `path/to/AdditionalFile.kt`
- 사유: 다운로드 요청 DTO가 해당 서비스의 필수 입력값이므로 검증 기준 확인 필요
```

### 5. 최종 문서 분석 범위 기록

최종 요구사항 문서에는 반드시 “분석 범위”를 기록.

예:

```md
## 분석 범위

### Scrap 자료

- [Scrap index](./scrap/index.md)
- [요구사항 README](./scrap/02_requirements/README.md)

### 현재 구현 확인 범위

- `core/src/main/kotlin/.../IoAttAggregationReportSet.kt`
- `api/src/main/kotlin/.../AttAggregationExcelDownloadService.kt`

### 범위 제외

- 출퇴근 다운로드 구현은 이번 분석 범위 제외
- 프론트 라우팅 구현은 이번 분석 범위 제외
```

## 핵심 원칙

### 1. 기획서 원문 전사 금지

Scrap 문서나 화면에 있는 내용을 그대로 “신규 요구사항”으로 쓰지 않음.

현재 구현 확인 후 다음 중 하나로 분류 필요.

- 현재 구현 완료
- 현재 구현 일부 존재
- 데이터 모델만 존재
- API 요청값만 존재
- 계산 로직만 존재
- Excel 출력만 미구현
- 신규 구현 필요
- 기획 확인 필요
- 프론트 중심 가능

### 2. 변경 필요사항 중심 작성

요구사항은 “기능 설명”이 아니라 **현재 구현 대비 변경 필요사항** 중심으로 작성.

나쁜 예:

- “사용자는 휴무유형별 휴일 근로시간을 확인할 수 있다.”

좋은 예:

- “현재 휴일 근로시간은 합산값만 산출되므로, 휴무유형별 산출값을 담는 도메인 구조와 요약/상세 Excel 동적 컬럼 추가 필요.”

### 3. 화면 요소와 백엔드 구현 요소 매핑

화면/기획 요소는 가능한 한 다음 구현 요소와 연결.

- Entity
- Request DTO
- Response DTO
- Mapper
- Validator
- Controller
- Service entrypoint
- Reader/Factory/Aggregator
- Repository/Query
- Excel drawer
- Column adjustor
- Message key
- Error code
- Migration/Flyway SQL

### 4. 불명확 항목 단정 금지

다음 항목은 반드시 “확인 필요”로 분리.

- OCR로 식별이 애매한 화면 문구
- scrap 문서와 이미지가 충돌하는 내용
- 기획 문서와 샘플 Excel이 다른 내용
- 현재 구현과 기획 의도가 다른 내용
- 경계값이 명확하지 않은 정책
- 프론트 처리인지 백엔드 처리인지 불명확한 내용
- 저장형 설정인지 다운로드 1회성 옵션인지 불명확한 내용

### 5. 근거 링크 필수화

요구사항 작성 시 가능한 한 scrap 자료와 구현 파일의 근거를 함께 명시.

링크 작성 기준:

- 요구사항 항목마다 관련 scrap 문서 링크 포함
- 같은 기능 디렉터리 내 문서끼리는 상대 경로 링크 사용
- 이미지/샘플 Excel도 가능한 경우 상대 경로 링크 사용
- 구현 근거는 코드 파일 경로를 backtick으로 명시
- 링크를 남길 수 없으면 “확인된 문서 없음” 또는 “스크린샷 OCR 기반 추정”으로 표시

## 입력 자료 수집 순서

### 1. 프로젝트 규칙 확인

작업 전 프로젝트 지침 확인.

- 최상위 `AGENTS.md`
- 작업 디렉터리에 더 가까운 `AGENTS.md`
- 문서 작성 규칙 또는 conventions 문서
- 필요한 경우 `docs-readability` 스킬

문서 작성 시 우선 적용할 규칙:

- H1 바로 아래 목차 포함
- 긴 줄글보다 목록/표 중심 구성
- 명사형 마무리 우선
- 파일명은 소문자 + 하이픈 선호
- 문서명에 날짜 포함 금지
- 확인되지 않은 내용은 추정 또는 확인 필요로 분리

### 2. Scrap 인덱스 확인

Scrap 디렉터리에서 우선 확인할 파일:

- `index.md`
- `README.md`
- `requirements.md`
- `02_requirements/README.md`
- `policy` 관련 문서
- `wireframes` 관련 문서
- `excel_samples` 관련 문서 또는 이미지

확인 순서:

1. 인덱스/README 계열로 전체 구조 파악
2. 요구사항 문서로 기능 후보 추출
3. 정책 문서로 경계값 확인
4. 와이어프레임/이미지로 화면 동작 확인
5. 샘플 Excel로 출력 구조 확인

### 3. 주요 화면/이미지 확인

우선 확인할 이미지 유형:

- 정책 요약 화면
- 다운로드 진입 화면
- 기간 변경 화면
- 설정 모달
- 상세 설정 화면
- Shortcut 화면
- Excel 샘플 이미지

이미지 분석 시 주의사항:

- 이미지 OCR 기반 내용은 확정도가 낮음
- 문서 근거나 코드 근거가 없으면 확인 필요로 분리
- 이미지 파일도 요구사항 항목의 관련 scrap 링크로 연결

### 4. 현재 구현 진입점 확인

기능 구현 확인 순서:

1. Entity 또는 Domain model
2. Request DTO
3. Response DTO
4. Mapper
5. Validator
6. Controller 또는 service entrypoint
7. Download/export service
8. Reader/Factory/Aggregator
9. Excel drawer
10. Column adjustor
11. Repository/Query
12. Error code/message
13. Migration/Flyway SQL

## 분석 절차

### 1. Scrap 요구사항 추출

Scrap 자료에서 기능 단위 후보를 먼저 추출.

기능 후보별 정리 항목:

- 기능명
- 사용자 화면/동작
- 정책/경계값
- 입력값
- 출력값
- Excel 영향
- 관련 scrap 파일 링크
- 불명확한 문구

예시:

```md
| 기능 후보 | 설명 | 관련 scrap | 비고 |
|---|---|---|---|
| 다운로드 기간 제한 | 직원 수에 따라 최대 기간 제한 | [요구사항](./scrap/02_requirements/README.md) | 100일 경계 확인 필요 |
| 주 단위 요약 | 선택 기간을 주 단위 시트로 분리 | [주간 설정 화면](./scrap/03_wireframes/01_dashboard/screenshot_weekly_summary_setting.png) | 저장형 옵션 여부 확인 필요 |
```

### 2. 현재 구현 매핑

각 기능 후보를 현재 구현 파일에 매핑.

매핑 기준:

- Entity 필드 존재 여부
- Request DTO 수신 여부
- Response DTO 노출 여부
- Mapper 변환 여부
- Validator 검증 여부
- Service 사용 여부
- 계산 로직 반영 여부
- Excel 헤더 반영 여부
- Excel 데이터 반영 여부
- 테스트 또는 샘플 존재 여부

예시:

```md
| 기능 | Entity | DTO | Validator | 계산 | Excel 출력 | 판단 |
|---|---|---|---|---|---|---|
| 야간근로 시간대 | 있음 | 있음 | 있음 | 있음 | 있음 | 기존 구현 존재 |
| 휴무유형별 휴일근로 | dayOffIds만 있음 | 일부 | 없음 | 합산만 있음 | 유형별 없음 | 신규 변경 필요 |
```

### 3. Gap 분류

각 기능을 다음 상태 중 하나로 분류.

| 상태 | 의미 |
|---|---|
| 구현 완료 | 기획 요구와 현재 구현이 대체로 일치 |
| 구현 일부 존재 | 필드/요청/계산 중 일부만 존재 |
| 구현 보정 필요 | 기능은 있으나 정책/경계값/대상 기준이 다름 |
| 신규 구현 필요 | 현재 구현 기반이 거의 없음 |
| 기획 확인 필요 | 요구사항 자체가 불명확하거나 충돌 |
| 프론트 중심 가능 | 백엔드 변경이 없거나 제한적일 수 있음 |

### 4. 백엔드 변경 요구사항 재서술

Gap 분석 결과를 바탕으로 백엔드 변경 요구사항 작성.

작성 기준:

- “현재 상태”와 “변경 필요” 분리
- scrap 근거와 구현 근거 함께 명시
- API/DB/계산/Excel/검증 영향 범위 구분
- 기획 확인 필요 항목 별도 분리
- 이미 구현된 기능을 신규 구현처럼 작성하지 않음

### 5. 구현 하위작업 이름 추출

문서 마지막에는 백엔드 구현용 하위작업 이름을 기능 단위로 추출.

작성 기준:

- 문서 작성 단계가 아니라 구현 작업 단위로 작성
- 동사형 또는 명사형 작업명 사용
- 큰 작업은 API/Domain/Excel/Validation으로 분리
- 테스트 작업도 별도 포함
- 작업명만 요청받은 경우 설명 없이 이름 목록 중심 작성

예시:

```md
1. 다운로드 기간 제한 검증 구현
2. 미래 날짜 다운로드 차단 구현
3. 공통 대상자 후보 추출 로직 정리
4. 기록 존재 사용자 필터 구현
5. 휴무유형별 계산 결과 도메인 모델 추가
6. 요약 시트 휴무유형별 동적 헤더 구현
7. 상세 시트 휴무유형별 동적 헤더 구현
8. 주 단위 기간 분할 로직 구현
9. 주간 요약 시트 생성 로직 구현
10. 대상자 필터 회귀 테스트 케이스 작성
```

## 요구사항 작성 형식

기능 단위 요구사항은 아래 형식 사용.

```md
### 기능명

#### 관련 자료

- Scrap
  - [문서명](./relative/path.md)
  - [화면명](./relative/image.png)
- 현재 구현
  - `path/to/Entity.kt`
  - `path/to/Service.kt`

#### 현재 상태

- 현재 구현에서 확인한 사실
- 코드 기준 동작

#### 변경 필요

- 현재 구현 대비 바뀌어야 하는 내용
- API/DB/계산/Excel 영향

#### 확인 필요

- 정책/경계값/기획 충돌
```

예시:

```md
### 휴무유형별 휴일 근로시간 구분 계산

#### 관련 자료

- Scrap
  - [요구사항 README](./scrap/02_requirements/README.md)
  - [추가 설정 화면](./scrap/03_wireframes/01_dashboard/screenshot_additional_settings_full.png)
  - [FR02 Excel 샘플](./scrap/03_wireframes/01_dashboard/excel_samples/fr02/screenshot_excel_image23.png)
- 현재 구현
  - `core/src/main/kotlin/.../IoAttAggregationReportSet.kt`
  - `api/src/main/kotlin/.../UserAttendanceReport.kt`
  - `api/src/main/kotlin/.../AttAggregationExcelReportSheetDrawer.kt`

#### 현재 상태

- 휴일 근로시간 합산값 존재
- 휴무유형별 산출값 구조 없음

#### 변경 필요

- 휴무유형별 산출 모델 추가 필요
- 요약/상세 Excel 동적 컬럼 추가 필요

#### 확인 필요

- 휴무유형 정렬 기준 확인 필요
- 복수 휴무유형이 같은 날짜에 존재할 때 집계 기준 확인 필요
```

## 참고 자료 링크 작성 규칙

요구사항 문서와 scrap 디렉터리가 같은 기능 디렉터리 안에 있을 때는 상대 경로 사용.

예시:

```md
- [Scrap index](./scrap/index.md)
- [요구사항 README](./scrap/02_requirements/README.md)
- [다운로드 기간 변경 화면](./scrap/03_wireframes/01_dashboard/screenshot_download_period_change.png)
- [주간 요약 설정 화면](./scrap/03_wireframes/01_dashboard/screenshot_weekly_summary_setting.png)
- [FR02 Excel 샘플](./scrap/03_wireframes/01_dashboard/excel_samples/fr02/screenshot_excel_image23.png)
```

요구사항 항목별 관련 자료가 다르면 항목 내부에 별도 링크 배치.

예시:

```md
### 직원 수 기반 기간 제한

#### 관련 자료

- Scrap
  - [요구사항 README](./scrap/02_requirements/README.md)
  - [기간 변경 화면](./scrap/03_wireframes/01_dashboard/screenshot_download_period_change.png)
- 현재 구현
  - `api/src/main/java/.../AttAggregationReportDownloadRequest.java`
  - `api/src/main/kotlin/.../AttAggregationExcelDownloadService.kt`
```

링크를 남길 수 없는 경우:

```md
- 관련 scrap: 확인된 문서 없음, 스크린샷 OCR 기반 추정
```

## 권장 문서 구조

최종 백엔드 요구사항 문서는 아래 구조를 기본으로 함.

```md
# <기능명> 백엔드 변경 요구사항

## 목차

1. [문서 목적](#1-문서-목적)
2. [참고 자료](#2-참고-자료)
3. [확인한 현재 구현](#3-확인한-현재-구현)
4. [기획 요구사항 요약](#4-기획-요구사항-요약)
5. [현재 구현 대비 Gap](#5-현재-구현-대비-gap)
6. [기능 단위 변경 요구사항](#6-기능-단위-변경-요구사항)
7. [데이터 모델 변경 후보](#7-데이터-모델-변경-후보)
8. [API 변경 후보](#8-api-변경-후보)
9. [계산 로직 변경 요구사항](#9-계산-로직-변경-요구사항)
10. [Excel 출력 변경 요구사항](#10-excel-출력-변경-요구사항)
11. [검증 및 방어 로직](#11-검증-및-방어-로직)
12. [확인 필요 항목](#12-확인-필요-항목)
13. [구현 하위작업 이름](#13-구현-하위작업-이름)
```

## 현재 구현 확인 체크리스트

- [ ] Entity 필드 확인
- [ ] Request DTO 확인
- [ ] Response DTO 확인
- [ ] Mapper 확인
- [ ] Validator 확인
- [ ] Controller 확인
- [ ] Service entrypoint 확인
- [ ] 대상자 조회/필터 확인
- [ ] 계산 factory/aggregator 확인
- [ ] Excel 요약 시트 drawer 확인
- [ ] Excel 상세 시트 drawer 확인
- [ ] Column adjustor 확인
- [ ] Repository/query 확인
- [ ] Error code/message 확인
- [ ] Migration 필요 여부 확인

## 요구사항 작성 체크리스트

- [ ] H1 바로 아래 목차 포함
- [ ] 관련 scrap 링크 포함
- [ ] 관련 구현 파일 경로 포함
- [ ] 현재 상태와 변경 필요 분리
- [ ] 이미 구현된 기능을 신규 기능처럼 쓰지 않음
- [ ] 정책/경계값 불명확 항목을 확인 필요로 분리
- [ ] API/DB/계산/Excel/검증 영향 범위 구분
- [ ] 기능 단위 하위작업 이름 작성
- [ ] 테스트/회귀 검증 작업 포함
- [ ] 이모티콘 미사용
- [ ] 날짜 포함 파일명 미사용

## 출력 시 주의사항

- 사용자가 “점검”을 요청하면 코드와 문서를 모두 읽고 단계별로 추적
- 사용자가 “검토”를 요청하면 구현하지 않고 방향성과 구조 의견 중심 응답
- 사용자가 “작성” 또는 “만들어”를 요청하면 실제 Markdown 파일 작성
- build, compile, test 실행이 금지된 프로젝트에서는 해당 명령 실행 금지
- 확인되지 않은 내용은 “추정”, “확인 필요”, “정책 결정 필요”로 표현
- 최종 응답에는 변경 파일 경로와 핵심 반영 사항 요약 포함
