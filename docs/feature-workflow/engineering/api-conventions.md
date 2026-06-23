# API 공통 규약

> **오버라이드 가이드**: 이 문서는 기본값을 정의합니다. 프로젝트에서 다른 응답 포맷이나 규약을 쓴다면 이 파일의 내용을 교체하세요. 기능별 API 문서(`04-api.md`)는 이 파일을 참조만 하므로, 한 곳만 바꾸면 전체가 일관되게 업데이트됩니다.
> 도메인 접두어 예시(AUTH, MEMBER, ORDER 등)와 인증게이트 단계는 예시입니다 — 프로젝트 도메인 구조에 맞게 자유롭게 수정하세요.

## 목차
- [문서 목적](#문서-목적)
- [적용 범위](#적용-범위)
- [응답 기본 원칙](#응답-기본-원칙)
- [공통 응답 포맷](#공통-응답-포맷)
- [HTTP Status 사용 원칙](#http-status-사용-원칙)
- [error 객체 규약](#error-객체-규약)
- [에러 코드 네이밍 규칙](#에러-코드-네이밍-규칙)
- [페이지네이션 규약](#페이지네이션-규약)
- [인증 / 인가 검증 순서](#인증--인가-검증-순서)
- [예시](#예시)
- [후속 문서 연결](#후속-문서-연결)

## 문서 목적

- 프로젝트 전반에서 공통으로 사용하는 API 응답 규약 정의 목적
- 서버 / 웹 / 모바일이 동일한 해석 기준을 가지도록 하기 위함
- 기능별 API 문서 작성 시 반복되는 공통 포맷 논의를 줄이기 위함

## 적용 범위

이 문서는 아래 항목에 공통 적용.

- REST API 응답 body
- 성공 / 실패 응답 기본 구조
- HTTP status 사용 기준
- 공통 error 포맷
- error code 네이밍 규칙
- 페이지네이션 규약
- 인증 / 인가 검증 순서

이 문서에서 아직 다루지 않는 항목:

- 파일 업로드 응답 세부 포맷
- 비동기 작업 상태 조회 포맷
- WebSocket / SSE 이벤트 포맷

## 응답 기본 원칙

- **HTTP status는 의미 있게 사용**
- 응답 body는 **공통 envelope** 유지
- 성공과 실패 모두 **일관된 최상위 구조** 사용
- 클라이언트는 HTTP status와 body를 함께 해석
- 사용자에게 보여줄 수 있는 오류 문구는 서버에서 기본 제공

## 공통 응답 포맷

### 성공 응답

```json
{
  "result": "SUCCESS",
  "data": {},
  "error": null
}
```

### 실패 응답

```json
{
  "result": "ERROR",
  "data": null,
  "error": {
    "code": "INVITE_LINK_EXPIRED",
    "message": "이 초대 링크는 만료되었습니다."
  }
}
```

### 최상위 필드 규칙

- `result`
  - 문자열 enum 사용
  - 허용값: `SUCCESS`, `ERROR`
- `data`
  - 성공 시 실제 응답 본문
  - 실패 시 `null`
- `error`
  - 성공 시 `null`
  - 실패 시 에러 객체
- `meta`
  - **공통 기본 필드로 두지 않음**

## HTTP Status 사용 원칙

### 성공 계열

- `200 OK`
  - 일반 조회 / 수정 / 처리 성공
- `201 Created`
  - 생성 성공
- `204 No Content`
  - 필요 시 사용 가능
  - 단, 공통 envelope 유지 방침과 충돌 가능하므로 신중 사용

### 클라이언트 오류 계열

- `400 Bad Request`
  - 잘못된 요청 형식
- `401 Unauthorized`
  - 인증 필요
- `403 Forbidden`
  - 권한 부족
- `404 Not Found`
  - 대상 리소스 없음
- `409 Conflict`
  - 상태 충돌
  - 예: 이미 가입됨, 이미 삭제됨, 정원 초과 등
- `410 Gone`
  - 만료 또는 더 이상 유효하지 않은 리소스 표현 후보
  - 실제 사용 여부는 기능별 문서에서 확정

### 서버 오류 계열

- `500 Internal Server Error`
  - 예상하지 못한 서버 오류

## error 객체 규약

### 구조

```json
{
  "code": "INVITE_LINK_EXPIRED",
  "message": "이 초대 링크는 만료되었습니다."
}
```

### 필드 의미

- `code`
  - 클라이언트 분기 처리용 안정적인 식별값
- `message`
  - **사용자 노출 가능한 문장 기준**
  - 앱/웹에서 그대로 쓰거나 거의 그대로 사용할 수 있는 수준

### message 작성 기준

- 내부 구현 용어 최소화
- 기술적 예외 문구 노출 지양
- 사용자가 다음 행동을 이해할 수 있는 문장 선호

좋은 예:

- `이 초대 링크는 만료되었습니다.`
- `이 그룹은 현재 정원이 가득 찼습니다.`
- `그룹을 찾을 수 없습니다.`

피해야 할 예:

- `invite link expired`
- `membership validation failed`
- `entity not found`

## 에러 코드 네이밍 규칙

### 기본 규칙

- **대문자 스네이크 케이스** 사용
- **도메인 접두어 포함**
- 형식:
  - `DOMAIN_REASON`
  - 예: `CIRCLE_NOT_FOUND`

### 기본 예시 도메인

- `AUTH_...` — 인증
- `MEMBER_...` — 멤버/사용자
- `ORDER_...` — 주문
- `PRODUCT_...` — 상품
- `PAYMENT_...` — 결제

> 프로젝트 도메인에 맞게 이 목록을 교체하세요 (예: CIRCLE_, PROJECT_, TASK_ 등).

### 기본 예시 코드

- `AUTH_UNAUTHORIZED`
- `AUTH_FORBIDDEN`
- `MEMBER_NOT_FOUND`
- `MEMBER_ALREADY_REMOVED`
- `ORDER_NOT_FOUND`
- `ORDER_INVALID_STATUS`
- `PRODUCT_OUT_OF_STOCK`
- `PAYMENT_EXPIRED`

> 위 코드는 예시입니다. 실제 프로젝트 도메인에 맞게 수정하세요.

## 페이지네이션 규약

### 기본 원칙

- **Cursor 기반 페이지네이션** 사용 (offset/page 번호 미사용)
- 정렬 기준은 기능별로 정의하되 암시적 정렬은 최신순(createdAt DESC)을 기본값으로 함
- 페이지 단위는 기능별 문서에서 기본값 설정 가능
- 커서가 없는 첫 요청은 첫 페이지를 의미

### 요청 형식

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `cursor` | string | N | 마지막 항목의 정렬 기준값 (ISO 8601 또는 ID) |
| `limit` | int | N | 한 페이지당 항목 수 (기본값 20, 최대 100) |

요청 예시:

```
GET /api/v1/resources?cursor=2025-06-18T10:00:00Z&limit=20
```

### 응답 형식

```json
{
  "result": "SUCCESS",
  "data": {
    "items": [],
    "cursor": null
  },
  "error": null
}
```

### 필드 규칙

- **`items`**: 현재 페이지의 항목 배열
- **`cursor`**: 다음 페이지 조회 시 cursor 파라미터로 사용할 값
  - 다음 페이지가 있으면 문자열 (마지막 항목의 정렬 기준값)
  - 마지막 페이지이면 `null`
- 리스트만 반환하는 API에서 `data`는 항상 위 구조 유지
- 첫 페이지에는 기능별로 추가 메타데이터 포함 가능 (예: hero, summary)
  - 이 경우 `items`는 보조 데이터와 함께 반환

## 인증 / 인가 검증 순서

### 검증 계층

> 아래는 한 프로젝트의 인증 게이트 예시입니다. 프로젝트의 인증 정책에 맞게 단계를 추가/제거/변경하세요.

모든 보호 API는 아래 순서로 검증함. 이전 단계를 통과해야 이후 단계로 진행.

| 단계 | 검증 | 실패 시 응답 |
|------|------|-------------|
| 1 | 로그인 여부 (유효 세션 존재) | `401 AUTH_UNAUTHORIZED` |
| 2 | 이메일 인증 완료 여부 | `403 AUTH_EMAIL_NOT_VERIFIED` |
| 3 | 닉네임 설정 완료 여부 | `403 AUTH_NICKNAME_SETUP_REQUIRED` |
| 4 | 기능별 도메인 권한 | 기능별 403/404 에러 코드 |

### 계층별 처리 기준

- **1단계 실패 시**: 클라이언트는 로그인 화면으로 이동하고, 재로그인 성공 시 저장된 `pending intent`를 재실행
- **2~3단계 실패 시**: 클라이언트는 해당 gate 화면으로 이동하고, 완료 후 `pending intent`를 재실행
- **4단계 실패 시**: 클라이언트는 해당 에러 코드에 따라 분기 (비활성 or 비노출 처리 등)
- 에러 응답 구조는 모두 공통 `error` 포맷을 준수

### 기능별 문서 작성 기준

- 각 기능 API 문서는 도메인 권한 검증(4단계)에 집중
- 1~3단계는 공통 규약에 따르므로 중복 기술하지 않음
- 필요 시 1~3단계와 연결된 에러 코드를 참조로 표기 가능

## 예시

### 1. 그룹 생성 성공

HTTP status:

```http
201 Created
```

Body:

```json
{
  "result": "SUCCESS",
  "data": {
    "circleId": 123,
    "role": "OWNER"
  },
  "error": null
}
```

### 2. 만료된 초대 링크

HTTP status:

```http
410 Gone
```

Body:

```json
{
  "result": "ERROR",
  "data": null,
  "error": {
    "code": "INVITE_LINK_EXPIRED",
    "message": "이 초대 링크는 만료되었습니다."
  }
}
```

### 3. 권한 부족

HTTP status:

```http
403 Forbidden
```

Body:

```json
{
  "result": "ERROR",
  "data": null,
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "이 작업을 수행할 권한이 없습니다."
  }
}
```

## 후속 문서 연결

- 기능별 API 문서는 이 규약을 전제로 작성
- 기능별 `04-api.md` 문서는 이 규약을 전제로 작성
- 공통 규약을 변경하면 모든 기능 문서가 자동으로 반영 (참조만 하므로)
