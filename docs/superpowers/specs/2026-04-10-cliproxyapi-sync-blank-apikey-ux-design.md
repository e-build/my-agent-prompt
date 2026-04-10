# cliproxyapi-sync Blank apiKey UX Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Author:** Brainstormed with OpenCode AI

---

## 1. Overview

`cliproxyapi-sync`는 현재 `~/.config/opencode/cliproxyapi-sync-config.jsonc`의 `apiKey`가 비어 있으면 startup 전체를 건너뛰고 짧은 로그만 남긴다. 이 동작은 두 가지 문제가 있다.

- 사용자는 `apiKey` 없이도 가능한 범위의 sync를 기대할 수 있다.
- startup 로그만으로는 OpenCode TUI가 바로 열릴 때 상태를 놓치기 쉽다.

이번 설계의 목표는 `apiKey`가 비어 있어도 가능한 sync를 계속 시도하고, 부분 실패나 설정 부족 상태를 warning toast로 더 명확하게 드러내는 것이다.

### Goals

- `apiKey`가 비어 있어도 management/OAuth 기반 sync는 계속 시도한다.
- `/v1/models` 요청은 `apiKey`가 없으면 무인증으로 시도해 서버가 허용하는지 확인한다.
- API-key 모델 단계만 실패하더라도 OAuth/management 단계의 성공 결과는 유지한다.
- startup 상태를 짧은 로그만이 아니라 지연된 warning toast로도 보여 준다.
- 부분 성공 상태를 사용자가 이해할 수 있는 메시지로 요약한다.

### Non-Goals

- `cliproxyapi-sync-config.jsonc` 구조 자체를 다시 바꾸지 않는다.
- OpenCode TUI 전반의 notification 정책을 재설계하지 않는다.
- `cp-*` provider 생성 규칙이나 reasoning metadata 규칙은 바꾸지 않는다.

---

## 2. Problem Statement

현재 구현은 `baseURL` 또는 `apiKey`가 비어 있으면 `loadSeedProviderState()`에서 곧바로 `seedProvider: null`을 반환하고 sync를 중단한다. 그 결과:

- management API만으로 가능한 OAuth provider 동기화도 수행되지 않는다.
- 사용자는 startup 로그를 놓치면 왜 sync가 안 되었는지 알기 어렵다.
- blank `apiKey`는 서버별로 허용 여부가 다를 수 있는데, 현재 구현은 시도 자체를 하지 않는다.

실제 현재 서버에서는 blank/no-key `/v1/models` 요청이 `401`이지만, 이것은 “API-key 모델 단계는 실패할 수 있다”는 뜻이지 “startup 전체를 시도하지 말아야 한다”는 뜻은 아니다.

---

## 3. Options Considered

### Option A. 현재 정책 유지 + warning toast만 추가

- 장점: 구현 변경이 가장 작다.
- 단점: 사용자가 원한 “`apiKey` 없이 시도” 요구를 충족하지 못한다.
- 단점: OAuth-only partial sync 기회를 버린다.

### Option B. blank `apiKey`에서도 partial sync 시도 + warning toast

- 장점: management/OAuth 단계는 계속 활용할 수 있다.
- 장점: 서버가 무인증 `/v1/models`를 허용하는 경우 자동으로 API-key 모델까지 확장된다.
- 장점: 현재 서버처럼 `/v1/models`가 실패하더라도 부분 성공 상태를 사용자에게 명확히 알릴 수 있다.
- 단점: success/partial-failure 상태를 구분하는 코드와 테스트가 추가된다.

### Option C. blank `apiKey`를 hard error로 승격

- 장점: 상태가 가장 명확하다.
- 단점: 사용자 요구와 반대다.
- 단점: 가능한 partial sync까지 막는다.

**Approved choice:** Option B.

---

## 4. Approved Design

### 4.1 Blank apiKey Semantics

`baseURL`은 여전히 필수다. 그러나 `apiKey`는 더 이상 startup 전체를 중단시키는 필수값으로 취급하지 않는다.

- `baseURL` 없음: sync 불가, guidance/warning 상태
- `baseURL` 있음 + `apiKey` 있음: 기존 full sync 경로
- `baseURL` 있음 + `apiKey` 없음: partial-sync mode

partial-sync mode에서는 management/OAuth 경로를 계속 시도한다.

### 4.2 Two-Phase Sync Behavior

sync는 아래 두 단계로 분리한다.

1. **Management/OAuth phase**
   - auth-files, auth-file models, metadata fetch를 계속 수행한다.
   - `managementKey` fallback 규칙은 기존과 동일하다.
2. **API-key models phase**
   - `apiKey`가 있으면 기존처럼 `Authorization: Bearer <apiKey>`로 `/v1/models`를 요청한다.
   - `apiKey`가 비어 있으면 `Authorization` header 없이 `/v1/models`를 한 번 시도한다.
   - 이 단계 실패는 non-fatal로 처리한다.

즉, OAuth/management 결과는 유지하고 API-key models만 선택적으로 합친다.

### 4.3 Failure Handling

`/v1/models` 실패는 startup 전체 실패로 취급하지 않는다.

- OAuth/management 단계가 성공했으면 그 결과로 `cp-*` provider state를 갱신한다.
- API-key 단계 실패 원인은 사용자에게 warning 메시지로 알려 준다.
- warning에는 partial-sync임을 드러내는 문구가 포함되어야 한다.

예시:

```text
[cliproxyapi-sync] Partial sync: API-key models skipped (401 Missing API key)
```

### 4.4 Visibility UX

현재 `client.app.log()` 기반 startup 로그는 유지한다. 추가로, success toast와 별도로 warning toast 경로를 도입한다.

- warning toast는 startup 직후 TUI 준비 시점을 고려해 지연 표시한다.
- toast `variant`는 `warning`을 사용한다.
- toast 메시지는 원인과 상태를 함께 보여 준다.

표시 대상 예시는 다음과 같다.

- `baseURL`이 비어 sync 자체가 불가능한 경우
- `apiKey`가 비어 partial-sync mode로 내려간 경우
- `/v1/models` 요청이 401/403/5xx 등으로 실패해 API-key models를 건너뛴 경우

### 4.5 Message Rules

메시지는 아래 원칙을 따른다.

- 설정 부족 메시지는 여전히 정확한 config path를 가리켜야 한다.
- blank `apiKey`는 더 이상 “startup 전체 skip”만 의미하지 않는다.
- partial-sync가 실제로 일어났다면 `synced`와 `skipped`를 함께 설명해야 한다.

예시 메시지:

```text
[cliproxyapi-sync] Partial sync: OAuth providers updated, API-key models skipped. Fill ~/.config/opencode/cliproxyapi-sync-config.jsonc to enable /v1/models sync.
```

### 4.6 Boundaries

이번 변경은 loader와 startup UX에 집중한다.

- `config.ts`: blank `apiKey`를 허용하는 seed-provider state semantics로 조정
- `core.ts`: OAuth phase와 API-key phase를 분리하고 warning toast 추가
- tests: blank `apiKey` partial-sync, warning toast, API-key phase non-fatal handling 추가

---

## 5. Implementation Scope

1. `loadSeedProviderState()`가 blank `apiKey`에서 startup 전체를 중단하지 않도록 변경
2. `/v1/models` fetch를 optional/non-fatal 단계로 분리
3. warning toast 경로 추가
4. partial-sync와 config-path guidance 메시지 정리
5. 관련 테스트 추가/수정

범위 밖:

- 새로운 config 파일 필드 추가
- sync 결과 저장 포맷 변경
- OpenCode 모델/provider naming 정책 변경

---

## 6. Validation

변경 후 아래 항목을 검증한다.

- `baseURL`만 있고 `apiKey`가 비어 있으면 OAuth/management sync는 계속 시도된다.
- blank `apiKey` 상태에서 `/v1/models` 실패가 startup 전체 실패로 이어지지 않는다.
- partial-sync가 발생하면 warning toast가 표시된다.
- `baseURL`까지 비어 있는 경우에는 여전히 guidance message/toast로 정확한 config path를 안내한다.
- 기존 full-sync (`apiKey` 있음) 경로는 회귀 없이 유지된다.

---

## 7. Testing Strategy

### 7.1 Config State Tests

- blank `apiKey`에서도 `seedProvider`를 반환한다.
- missing `baseURL`은 여전히 guidance 상태를 반환한다.

### 7.2 Sync Behavior Tests

- blank `apiKey`에서 OAuth-only sync가 진행된다.
- blank `apiKey`에서 `/v1/models`가 401이어도 OAuth 결과는 반영된다.
- `apiKey`가 있으면 full sync가 기존처럼 동작한다.

### 7.3 Visibility Tests

- partial-sync 시 warning toast가 예약/표시된다.
- missing `baseURL` 또는 config guidance 상태에서도 warning toast 메시지가 적절히 생성된다.

---

## 8. Rationale

이번 변경의 핵심은 “blank `apiKey`를 setup 오류로만 취급하지 말고, 가능한 작업은 계속 하자”는 것이다. 현재 서버에서는 무인증 `/v1/models`가 실패하지만, management/OAuth 경로까지 막을 이유는 없다. partial sync를 허용하고 warning toast로 더 잘 보이게 만들면, 사용자는 startup 로그를 놓치더라도 현재 상태를 이해할 수 있고, 서버가 허용하는 범위에서는 `apiKey` 없이도 최대한 동작하는 UX를 얻게 된다.
