# API Draft 상세 컨벤션

## 1. 프로젝트 컨벤션 요약

### 1.1 모듈 구조

Shopl은 멀티모듈 + 도메인 우선 패키지 구조를 사용한다. breakdown §14.1 확정 기준:

| 레이어 | 모듈 | 패키지 예시 |
|---|---|---|
| Controller / DTO / Application(Facade) | `api/` | `com.planetory.io.feature.workplace_attendance` |
| Domain / Infrastructure(Reader, Repo) | `shopl-api/` | 신규 집계 도메인 |

### 1.2 HTTP/Routing

- **필터·조건 기반 조회는 POST + RequestBody** (기존 `AttendancePeriodQueryController` 참조)
- 관리자 화면: `/admin/attendance/workplaces/**`
- 인증: `CommonParamInfo` (hidden `@Parameter`) 주입

### 1.3 API spec 출력 형태 (중요)

API spec 문서는 **순수 JSON 형태**로 작성한다. **DTO 클래스명을 포함하지 않는다**.

- **금지**: `WorkplaceAttendanceXxxRequest`, `WorkplaceAttendanceXxxResponse` 같은 클래스명을 섹션 헤더나 응답 정의에 붙이지 않는다.
- **금지**: pseudo-class code block (`ClassName { field: Type }` 형태)을 사용하지 않는다.
- **요청**: 필드 표로 정의 (필드·타입·필수·설명·예시). 클래스명 없이 `### X.Y Request` 헤더만.
- **응답**: JSON 예시 block (` ```json `)으로 정의. 값과 인라인 주석으로 구조를 보여준다.
- 아래 §1.3.1의 Kotlin DTO 패턴은 **구현 시 참고용**이며 spec 문서에 직접 넣지 않는다.

#### 1.3.1 구현용 DTO 패턴 (참고만 — spec 문서에 미포함)

```kotlin
// Request: outer class 내부 data class
class WorkplaceAttendanceXxxRequest {
    data class Filter(
        val field: Type,
    )
}

// Response: data class
data class WorkplaceAttendanceXxxResponse(
    val field: Type,
)
```

Swagger: `@Schema(name = "...", description = "...")`, `requiredMode = Schema.RequiredMode.REQUIRED`

### 1.4 페이징

**요청**: `PageRequest<SortType>`
```kotlin
data class PageRequest<out PageSortType>(
    val sortType: PageSortType?,
    val direction: Sort.Direction = Sort.Direction.ASC,
    val page: Int,          // 0-based
    val records: Int,       // page size
)
```

**응답**: `PageResponse<T>` 또는 `PageResponseWithAdditionalInfo<T, AdditionalInfo>`
- `content`, `totalElements`, `page`, `size`, `isLast`

### 1.5 예외

AGENTS.md 규칙: raw throw 금지. 프로젝트 전용 `ErrorCode` enum 정의 후 `throwEx()` / `wrapEx(errorData)` 사용.

```java
public interface ErrorCode {
    HttpStatus retrieveHttpStatus();
    String retrieveErrorCode();
    String retrieveErrorMessage();
    default ResponseErrorException throwEx() { throw ResponseErrorException.of(this); }
    default ResponseErrorException wrapEx(Object errorData) { return ResponseErrorException.of(this, errorData); }
}
```

신규 API 전용 `ErrorCode` 예: `WorkplaceAttendanceErrorCode`

### 1.6 CommonParamInfo 권한 메서드

```java
boolean isAdmin()    // 관리자 + 슈퍼관리자
boolean isLeader()   // 리더
boolean isOperator() // 운영자
boolean isUser()     // 일반 직원
```

---

## 2. 문서 구조 템플릿

```md
# <기능명> — API 초안 설계
> 상태: 초안 (Draft) | 작성일: YYYY-MM-DD
> 근거: [breakdown 문서](./backend-implementation-breakdown.md) + 정책 문서

## 목차 (API 목록까지)
1. 문서 목적과 범위
2. 설계 전제와 컨벤션
3. 공통 타입/Enum 정의
4. API 목록 요약 (표)
5~. 개별 API 명세 (각 API마다 1개 섹션)
N. 기존 API 재사용 매핑
N+1. 미확정/설계 검토 필요 항목
```

## 3. Enum 정의 규칙

### 3.1 명명

- enum 값: 영문 `SCREAMING_SNAKE_CASE`
- 한글 표시명을 표의 별도 컬럼으로

### 3.2 필수 포함 정보

각 enum 표에는 최소한:
- enum 상수 값
- 한글 표시명
- 집계 기준 근무지 (해당 시)
- default 선택 여부 (해당 시)
- 비고 (해당 시)

### 3.3 템플릿 동적 항목

스케줄 템플릿처럼 동적으로 늘어나는 항목은:
- enum 값 예시: `SCHEDULE_METRIC_TEMPLATE:{templateId}`
- 표시명: 템플릿명 (동적)
- 요청 파라미터로 templateId 목록을 별도 필드(`includeScheduleTemplateIds`)로 분리

---

## 4. API 명세 작성 규칙

### 4.1 엔드포인트 네이밍

- `POST /admin/attendance/workplaces/daily/{기능명}`
- `POST /admin/attendance/workplaces/monthly/{기능명}`
- path variable이 필요한 경우: `POST /admin/attendance/workplaces/{workplaceId}/detail`

### 4.2 Request

**필드 표**로 정의. 클래스명은 붙이지 않는다. 헤더에는 **전송 방식을 명시**한다.

| 헤더 형식 | 의미 |
|---|---|
| `### X.Y Request (body)` | POST RequestBody (JSON body) |
| `### X.Y Request (param)` | GET Query Parameter |
| `### X.Y Request (path + body)` | path variable + POST RequestBody |
| `### X.Y Request (path + param)` | path variable + GET Query Parameter |

필드 표는 전송 방식과 무관하게 동일 형식:

| 필드 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `date` | LocalDate | ✅ | 조회 날짜 | `2026-07-09` |
| `workplaceIds` | Set\<String\> | ❌ | 근무지 필터 | `["WP001"]` |

path variable이 있는 경우 필드 표 아래에 `path variable` 안내문으로 별도 표기.

**JSON 예시 (body 전용)**: `(body)` Request는 응답과 동일한 JSON 예시 block을 field table 아래에 추가한다. 동일한 `[타입, non null|nullable] 설명` 주석 포맷을 사용한다.

```json
{
  "date": "2026-07-09",        // [LocalDate, non null] 조회 날짜
  "workplaceIds": ["WP001", "WP002"]  // [Set<String>, nullable] 근무지 필터
}
```

`(path + body)`인 경우 path variable은 JSON 밖에 주석으로 표기한다.

### 4.3 Response

**JSON 예시 block**으로 정의. pseudo-class 구문(`ClassName { field: Type }`)이나 DTO 클래스명은 사용하지 않는다.

**주석 포맷 (필수)**: 모든 필드에 `[타입, nullable 여부] 설명` 포맷의 인라인 주석을 단다. 요청의 필드 표와 동일한 정보 밀도를 유지한다.

```json
{
  "total": 0,                    // [Long, non null] 전체 근무지 수
  "statuses": [                  // [List, non null] 상태별 집계
    {
      "status": "BEFORE_WORK",   // [Enum, non null] 근무지 상태
      "count": 0                  // [Long, non null] 근무지 수
    }
  ]
}
```

**주석 작성 규칙**:
- 포맷: `// [타입, non null|nullable] 설명`
- 타입: `String`, `Long`, `Int`, `Boolean`, `BigDecimal`, `LocalDate`, `LocalDateTime`, `LocalTime`, `List`, `Object`, `Map`, `Enum`
- nullable 여부: `non null` 또는 `nullable` (nullable 여부)
- nullable 필드는 예시값 `null`로 표시한다.
- 중첩 객체는 JSON 중첩 구조로 표현한다.
- 다른 섹션의 구조를 재사용하는 경우 `{ /* §8.4 schedule 구조 */ }` 형태로 참조 가능.

### 4.4 페이징 정보 명시

- API별 page size (기본값, 선택 가능값)
- 정렬 기준 enum (`SortType`)
- `additionalInfo` 필요 여부

### 4.5 예외 케이스

표 형식:

| HTTP | ErrorCode | 조건 |
|---|---|---|
| 403 | `NO_PERMISSION` | 직원 역할 |
| 400 | `INVALID_PARAMS` | date 누락 |

---

## 5. Cross-Reference 링크화 규칙

### 5.1 문서 간 참조

| 대상 | 링크 패턴 |
|---|---|
| 같은 문서 섹션 | `[섹션 N.M](#nn-헤딩명)` |
| breakdown 문서 | `[breakdown 섹션 N.M](./backend-implementation-breakdown.md#nn-헤딩명)` |
| 정책 문서 | `[정책 섹션 N](0X-policy-문서명.md#n-헤딩명)` |

### 5.2 헤딩 앵커 생성 규칙

GitHub Flavored Markdown 기준:
1. 소문자 변환
2. 영문/숫자/공백/하이픈 외 제거
3. 공백 → `-`
4. 중복 앵커는 `-1`, `-2` 접미사

예: `### 3.4 출퇴근 탭 조회 항목 (최대 8개 선택)` → `#34-출퇴근-탭-조회-항목-최대-8개-선택`

### 5.3 URL 내 괄호 인코딩

파일명에 `(` `)`가 포함된 경우 URL 인코딩:
- `03-policy-근무 현황(근무지).md` → `03-policy-근무-현황%28근무지%29.md`

마크다운 `](url)` 구문에서 `)`를 URL 종료로 인식하기 때문.

### 5.4 치환 시 주의

`breakdown 섹션 10.1` 과 `breakdown 섹션 10` 같은 중첩 패턴은 **긴 문자열부터 먼저** 치환해야 한다. 그렇지 않으면 `[breakdown 섹션 10](./...).1` 로 깨진다.

### 5.5 코드 주석 내 참조

`// 섹션 3.2`, `// 섹션 8.4 재사용` 등 코드 블록/DTO 필드 주석에 있는 섹션 참조는 변수·타입을 가리키는 것이므로 링크화하지 않는다.

---

## 6. 검증 체크리스트

문서 작성 완료 후:

- [ ] breakdown §9의 모든 API 후보가 명세에 포함되었는가
- [ ] 각 API에 Request(필드 표)/Response(JSON 예시)/예외 케이스가 모두 기재되었는가
- [ ] **Request 헤더에 전송 방식(body/param/path)이 명시되었는가**
- [ ] **Request(body) JSON 예시 block이 field table 아래에 추가되었는가** (응답과 동일한 주석 포맷)
- [ ] **응답 JSON의 모든 필드에 `[타입, non null|nullable] 설명` 주석이 있는가**
- [ ] **DTO 클래스명이 섹션 헤더/응답 정의에 포함되지 않았는가** (`XxxRequest`, `XxxResponse` 금지)
- [ ] **응답이 pseudo-class 구문이 아닌 JSON 예시인가** (`ClassName { ... }` 금지)
- [ ] 페이징이 필요한 API에 page/records 파라미터 + 응답 구조 명시
- [ ] 모든 enum이 정책 문서 값과 1:1 대응하는가 (교차 검증)
- [ ] 모든 `섹션 N` 참조가 실제 markdown 링크로 변환되었는가 (코드 주석 제외)
- [ ] `[[` 이중 링크 없음
- [ ] URL에 미인코딩 괄호 `(` `)` 없음
- [ ] breakdown §16에 api-draft.md 링크 추가 확인
- [ ] 미확정/검토 필요 항목 섹션이 비어있지 않은가

---

## 7. 전체 예시

`docs/근무지별-출퇴근/api-draft.md` 참조.
