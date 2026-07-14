# 분석 예시 모음

SKILL.md의 분석 절차에서 참조하는 상세 예시. 분석 중 해당 단계에서 형식이 필요할 때만 읽는다.

## 1. 화면 목록 표 (절차 2단계)

화면 단위 분해 결과를 정리하는 형식.

```md
| 화면 | 백엔드 역할 | 사용하는 공통 로직 | 관련 scrap |
|---|---|---|---|
| 일간 메인 | 근무지별 집계 API | 조회 범위, 배치 근무지, 집계 기준 | [일간 화면](./scrap/01_policy/screenshot_policy_일간_집계_화면.png) |
| 월간 메인 | 매트릭스 API | 조회 범위, 배치 근무지 | [월간 화면](./scrap/01_policy/screenshot_policy_월간.png) |
| 구성원 모달 | 구성원 목록 API | 조회 범위, 권한 분기 | [권한 범위](./scrap/01_policy/screenshot_policy_일간_권한_범위.png) |
```

## 2. 공통 로직 목록 표 (절차 2단계)

여러 화면이 공유하는 집계/권한/추출 로직을 별도 식별.

```md
| 공통 로직 | 사용 화면 | 비고 |
|---|---|---|
| 조회 가능 근무지 범위 계산 | 전체 화면 | 역할별 분기 |
| 배치 근무지 결정 (구성원 추출) | 일간, 월간, 모달 | 중복 귀속 허용 |
| 컬럼별 집계 기준 근무지 분기 | 일간, 근무지 상세 | 컬럼마다 기준 상이 |
```

원칙:
- 화면 단위로 먼저 나눈 뒤, 공통 로직은 별도 섹션으로 식별(분석 산출물). 단, 이 식별은 절차 8 하위작업 분해에서 **별도 큰 분류로 만드는 것이 아님** — 공통 로직은 처음 필요로 하는 API 태스크에 흡수된다(절차 8, §7 예시 참조).
- 공통 로직은 개별 화면 섹션에서 중복 작성하지 말고 참조.
- 하나의 화면이 여러 API/뷰 모드를 가질 수 있음 (예: 일간/월간 토글, 출퇴근뷰/스케줄뷰).

## 3. 기능 후보 추출 표 (절차 3단계)

화면 단위로 Scrap 자료에서 기능 후보를 추출하는 형식.

```md
| 화면 | 기능 후보 | 설명 | 관련 scrap | 비고 |
|---|---|---|---|---|
| 일간 메인 | 블록1 근무지 현황 | 출근전/근무중/근무종료/배정없음 | [집계 화면](./scrap/01_policy/screenshot_policy_일간_집계_화면.png) | 상태 판정 조건 확인 |
| 일간 메인 | 페이지네이션 | 50/100/150행 | [요구사항](./scrap/02_requirements/README.md) | 행 수 경계 확인 |
```

## 4. 현재 구현 매핑 표 (절차 4단계)

각 기능 후보를 현재 구현 파일에 매핑.

```md
| 기능 | Entity | DTO | Validator | 계산 | Excel 출력 | 판단 |
|---|---|---|---|---|---|---|
| 야간근로 시간대 | 있음 | 있음 | 있음 | 있음 | 있음 | 기존 구현 존재 |
| 휴무유형별 휴일근로 | dayOffIds만 있음 | 일부 | 없음 | 합산만 있음 | 유형별 없음 | 신규 변경 필요 |
```

매핑 확인 항목: Entity 필드 / Request DTO / Response DTO / Mapper / Validator / Service 사용 / 계산 로직 / Excel 헤더 / Excel 데이터 / 테스트·샘플 존재 여부.

## 5. 구현 분해 항목 작성 형식 예시 (절차 6단계)

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

## 6. 참고 자료 링크 작성 규칙 예시

구현 분해 문서와 scrap 디렉터리가 같은 기능 디렉터리 안에 있을 때는 상대 경로 사용.

```md
- [Scrap index](./scrap/index.md)
- [요구사항 README](./scrap/02_requirements/README.md)
- [다운로드 기간 변경 화면](./scrap/03_wireframes/01_dashboard/screenshot_download_period_change.png)
- [주간 요약 설정 화면](./scrap/03_wireframes/01_dashboard/screenshot_weekly_summary_setting.png)
- [FR02 Excel 샘플](./scrap/03_wireframes/01_dashboard/excel_samples/fr02/screenshot_excel_image23.png)
```

구현 분해 항목별 관련 자료가 다르면 항목 내부에 별도 링크 배치.

링크를 남길 수 없는 경우:

```md
- 관련 scrap: 확인된 문서 없음, 스크린샷 OCR 기반 추정
```

## 7. 구현 큰 분류 분해 예시 (절차 8단계)

### 분류 기준

- **이 문서에서는 큰 분류만 작성한다.** 작은 분류/스켈레톤 골격/테스트 케이스/테스트 코드는 이 문서의 범위가 아니다(작은 분류는 `shopl-dev-task-flow` Orientation, 테스트 케이스는 `shopl-dev-task-flow-unit`에서 정의).
- 큰 분류는 하나의 API 단위를 넘지 않는다.
- **공통 로직은 별도 큰 분류로 분리하지 않는다.** 공통 로직은 그것을 처음 필요로 하는 큰 분류(API) 안에 **흡수**한다고 표시한다. 작은 분류 수준 분해는 task-flow로 위임한다.
- 흡수된 공통 컴포넌트는 후속 큰 분류에서 재사용하므로 §15 최상단에 **공통 컴포넌트 매핑표**를 둬서 누락을 방지한다.
- 각 큰 분류에는 관련 자료/현재 상태/변경 필요/주요 정책 조건/**API Draft 후보**/구현·재사용 공통 컴포넌트/확인 필요를 포함한다.

### 공통 컴포넌트 매핑표 예시 (§15 최상단)

공통 로직이 하나 이상 있을 때 §15 최상단에 둔다. 어느 큰 분류에서 구현하고 어느 큰 분류에서 재사용하는지 한눈에 추적.

```md
| 공통 컴포넌트 | 구현 위치 (신규 생성 큰 분류) | 재사용하는 큰 분류 |
|---|---|---|
| 대상자 후보 추출 로직 | 큰 분류 1 (주간 요약 API) | 큰 분류 2, 3 |
| 다운로드 기간 검증 로직 | 큰 분류 1 (주간 요약 API) | 큰 분류 3 |
```

### 예시

```md
### 큰 분류 1. 주간 요약 시트 생성 API

- 목적: 주간 근무 요약 시트 생성 API 신규 구현
- 엔드포인트: `POST /admin/reports/weekly-summary`
- 관련 자료:
  - Scrap: [주간 요약 설정 화면](./scrap/02_wireframes/01_dashboard/screenshot_weekly_summary_setting.png)
  - 현재 구현: (해당 없음, 신규)
- 현재 상태: 주간 요약 기반 없음
- 변경 필요: API 신규, 대상자 추출·기간 검증 공통 로직 신규
- 주요 정책 조건: 기록 존재 사용자 필터, 다운로드 기간 상한, 미래 날짜 차단
- 구현 공통 컴포넌트: 대상자 후보 추출 로직, 다운로드 기간 검증 로직
- 재사용 공통 컴포넌트: 없음 (최초 작업)
- API Draft 후보: `POST /admin/reports/weekly-summary` 신규, 관리자 권한, 요청=기간/조직, 응답=요약 수치+목록
- 미확인/확인 필요: 빈 결과 응답 형태(API 초안에서 확정)

### 큰 분류 2. 월간 요약 시트 생성 API

- 목적: 월간 근무 요약 시트 생성 API 신규 구현
- 엔드포인트: `POST /admin/reports/monthly-summary`
- 관련 자료:
  - Scrap: [월간 화면](./scrap/02_wireframes/01_dashboard/screenshot_monthly.png)
  - 현재 구현: (해당 없음, 신규)
- 현재 상태: 월간 요약 기반 없음
- 변경 필요: API 신규
- 주요 정책 조건: 월간 집계 기준
- 구현 공통 컴포넌트: 없음
- 재사용 공통 컴포넌트: 큰 분류 1의 대상자 후보 추출 로직
- API Draft 후보: `POST /admin/reports/monthly-summary` 신규, 관리자 권한
- 미확인/확인 필요: 없음

### 큰 분류 3. 휴무유형별 계산/출력 (도메인 + Excel)

- 목적: 휴무유형별 휴일 근로시간 계산 및 Excel 동적 헤더
- 엔드포인트: `없음` (도메인 + Excel 전용)
- 관련 자료:
  - Scrap: [FR02 Excel 샘플](./scrap/02_wireframes/01_dashboard/excel_samples/fr02/screenshot_excel_image23.png)
  - 현재 구현: `core/src/main/kotlin/.../IoAttAggregationReportSet.kt`
- 현재 상태: 휴일 근로시간 합산값만 존재, 휴무유형별 산출 모델 없음
- 변경 필요: 도메인 모델 신규, 요약/상세 Excel 동적 컬럼
- 주요 정책 조건: 복수 휴무유형 동일일 집계 기준, 휴무유형 정렬 기준
- 구현 공통 컴포넌트: 없음
- 재사용 공통 컴포넌트: 큰 분류 1의 대상자 후보 추출 로직, 다운로드 기간 검증 로직
- API Draft 후보: 해당 없음 (API 엔드포인트 없음)
- 미확인/확인 필요: 휴무유형 정렬 기준 확인 필요
```

### 흡수 방식의 핵심 포인트

- 공통 로직(대상자 추출, 기간 검증)이 별도 큰 분류가 아니라 **큰 분류 1에 흡수**된다(구현 책임 표시만).
- 큰 분류 2, 3은 해당 공통 로직을 `재사용 공통 컴포넌트`로 선언만 한다.
- 매핑표와 각 큰 분류의 `구현/재사용 공통 컴포넌트` 라벨이 일치해야 한다.
- 어떤 공통 로직을 어느 API에 흡수할지는 "가장 먼저 그 로직이 필요한 API" 기준으로 정한다.
- 실제 작은 분류 분해(골격/DTO 설계/테스트/구현 단계)는 큰 분류 1을 진행할 때 `shopl-dev-task-flow` Orientation에서 수행한다.

