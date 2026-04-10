# cliproxyapi-sync Config UX Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Author:** Brainstormed with OpenCode AI

---

## 1. Overview

`cliproxyapi-sync` 플러그인은 현재 `~/.config/opencode/opencode.json`의 `provider.cliproxyapi`를 seed provider로 가정하고 동작한다. 이 구조는 사용자가 OpenCode provider schema를 알아야 하고, seed provider가 없을 때 왜 로그가 뜨는지 이해하기 어렵다는 문제가 있다.

이번 설계의 목표는 플러그인 전용 설정 파일을 도입해 설정 UX를 단순화하고, 기존 `provider.cliproxyapi` 사용자는 자동 마이그레이션으로 새 구조로 옮기는 것이다.

### Goals

- `cliproxyapi-sync`의 사용자 입력 경로를 `~/.config/opencode/cliproxyapi-sync-config.jsonc` 하나로 단순화한다.
- 사용자가 `provider.cliproxyapi` 같은 내부 seed provider 구조를 몰라도 플러그인을 설정할 수 있게 한다.
- 전용 설정 파일이 없을 때 템플릿을 자동 생성해 최초 설정 진입 장벽을 낮춘다.
- 기존 `provider.cliproxyapi` 사용자는 자동 마이그레이션으로 새 설정 파일로 옮기고, legacy entry는 제거해 split-brain 상태를 방지한다.
- 필수 설정이 비어 있거나 파일이 없을 때, 사용자가 수정해야 할 정확한 파일 경로를 startup 로그로 안내한다.

### Non-Goals

- 모델 동기화 알고리즘 자체를 변경하지 않는다.
- sync 결과 toast, provider 생성 규칙, metadata fetch 규칙은 재설계하지 않는다.
- OpenCode 전체 설정 체계나 다른 플러그인의 설정 구조는 바꾸지 않는다.

---

## 2. Problem Statement

현재 구조에는 다음 문제가 있다.

- 설정 위치가 `opencode.json` 안의 `provider.cliproxyapi`라서 사용자가 플러그인 전용 설정 위치를 직관적으로 찾기 어렵다.
- `cliproxyapi-sync`는 seed provider가 없으면 startup 때 `cliproxyapi seed provider is not configured` 로그를 남기는데, 이 메시지만으로는 무엇을 어디에 넣어야 하는지 알기 어렵다.
- sync 자체는 플러그인 전용 관심사인데, 설정은 OpenCode 공용 provider 설정 아래에 섞여 있다.
- 기존 구조를 유지한 채 문서만 보강하면, 사용자가 여전히 provider object shape를 수동으로 작성해야 한다.

---

## 3. Options Considered

### Option A. `provider.cliproxyapi` 유지 + 문서 보강

- 장점: 구현 변경이 가장 작다.
- 단점: 사용자가 여전히 OpenCode provider schema를 이해해야 한다.
- 단점: 현재 UX 문제를 근본적으로 해결하지 못한다.

### Option B. 전용 `jsonc` 파일 도입 + legacy 자동 마이그레이션

- 장점: 사용자 입장에서 플러그인 설정 위치가 명확하다.
- 장점: `forge-plugin`의 `~/.config/opencode/forge-config.jsonc` 패턴과 일관된다.
- 장점: 기존 사용자도 자동 마이그레이션으로 무리 없이 전환할 수 있다.
- 단점: 설정 loader, bootstrap, migration 코드가 추가된다.

### Option C. 전용 `jsonc` 파일 우선 + legacy fallback 영구 유지

- 장점: 이전 설정 방식과의 호환성이 가장 넓다.
- 단점: 설정 source of truth가 둘이 되어 장기적으로 혼란을 만든다.
- 단점: 새 파일과 legacy provider가 어긋나는 split-brain 상태를 계속 허용하게 된다.

**Approved choice:** Option B.

---

## 4. Approved Design

### 4.1 Source of Truth

단일 source of truth는 아래 파일이다.

```text
~/.config/opencode/cliproxyapi-sync-config.jsonc
```

이 파일은 플러그인 전용 설정만 담는다. 기본 필드는 아래 세 가지다.

```jsonc
{
  // CLI Proxy API base URL, usually ending with /v1
  "baseURL": "http://localhost:8317/v1",

  // API key used for /v1/models
  "apiKey": "",

  // Optional. If omitted, plugin falls back to its default management key.
  "managementKey": ""
}
```

`managementKey`는 optional이며 비어 있으면 기존 기본 fallback을 유지한다.

### 4.2 Startup Bootstrap

플러그인은 startup 시 다음 순서로 동작한다.

1. `~/.config/opencode/cliproxyapi-sync-config.jsonc` 존재 여부를 확인한다.
2. 파일이 없으면 legacy `provider.cliproxyapi` 존재 여부를 확인한다.
3. 둘 다 없으면 주석 포함 템플릿 파일을 자동 생성한다.
4. 템플릿 자동 생성은 기존 파일을 절대 덮어쓰지 않는다.
5. 템플릿 생성 후 sync는 진행하지 않고, 사용자가 파일을 채워야 한다는 안내 로그를 남긴다.

### 4.3 Legacy Migration and Cleanup

legacy source는 `~/.config/opencode/opencode.json`의 `provider.cliproxyapi`다.

마이그레이션 규칙은 다음과 같다.

1. 새 `jsonc` 파일이 없고 legacy entry가 있으면, legacy 값을 읽어 새 `jsonc` 파일을 생성한다.
2. 새 파일 생성이 성공하면 `opencode.json`에서 `provider.cliproxyapi`를 자동 제거한다.
3. 새 `jsonc` 파일과 legacy entry가 둘 다 있으면, 새 파일을 유지하고 legacy entry만 자동 제거한다.
4. migration 이후에는 새 `jsonc` 파일만 읽고, legacy provider는 더 이상 source로 사용하지 않는다.

이 규칙의 목적은 설정 소스를 하나로 고정하고 split-brain 상태를 장기적으로 허용하지 않는 것이다.

### 4.4 Loader and Adapter Layer

기존 sync 핵심 로직은 유지한다. 대신 sync 진입 전에 작은 loader/adapter 레이어를 둔다.

이 레이어의 책임은 아래와 같다.

- 전용 `jsonc` 파일 읽기
- 파일 없음 시 bootstrap 템플릿 생성
- legacy `provider.cliproxyapi` 감지 및 migration
- `baseURL`, `apiKey`, `managementKey` 파싱
- 현재 sync 로직이 기대하는 내부 seed provider object로 변환

즉, 사용자 입력 형태는 단순한 전용 config로 바꾸되, 내부 sync 로직은 가능한 한 그대로 재사용한다.

### 4.5 Missing Config UX

다음 경우에는 fetch를 시도하지 않는다.

- 설정 파일이 템플릿만 있고 `baseURL`이 비어 있음
- 설정 파일이 템플릿만 있고 `apiKey`가 비어 있음
- 설정 파일이 없어서 방금 bootstrap만 수행함

이 경우에는 startup마다 안내 로그를 남긴다. 로그는 기존의 모호한 메시지 대신 실제 수정 위치를 알려야 한다.

예시 로그:

```text
[cliproxyapi-sync] Sync skipped: fill ~/.config/opencode/cliproxyapi-sync-config.jsonc
```

로그는 항상 남긴다. 조용한 no-op로 바꾸지 않는다.

### 4.6 Persisted Config Boundaries

전용 `jsonc` 파일은 플러그인 입력 설정만 가진다. 동기화된 `cp-*` provider 결과는 기존처럼 `opencode.json`의 provider state에 반영한다.

즉, 역할을 분리한다.

- `cliproxyapi-sync-config.jsonc`: 사용자 입력과 bootstrap/migration 대상
- `opencode.json`: 최종 provider 상태와 동기화 결과 저장

이 분리는 사용자가 직접 편집해야 하는 최소 설정과 플러그인이 관리하는 generated state를 섞지 않기 위한 것이다.

---

## 5. Implementation Scope

이 설계가 승인된 뒤 실제 작업 범위는 아래와 같다.

1. `cliproxyapi-sync`에 전용 `jsonc` config loader 추가
2. 템플릿 bootstrap 로직 추가
3. legacy `provider.cliproxyapi` -> `cliproxyapi-sync-config.jsonc` migration 추가
4. migration 성공 후 legacy entry 자동 제거 로직 추가
5. README와 저장소 문서를 새 설정 UX에 맞게 수정
6. 관련 테스트 추가/수정

다음은 범위 밖이다.

- provider 모델 생성 규칙 변경
- metadata channel 목록 변경
- toast UI 동작 변경
- 다른 플러그인 설정 구조 재설계

---

## 6. Validation

변경 후 아래 항목을 검증한다.

- 새 사용자 환경에서 startup 시 `~/.config/opencode/cliproxyapi-sync-config.jsonc` 템플릿이 자동 생성된다.
- 템플릿 상태에서는 fetch 없이 안내 로그만 출력된다.
- 유효한 `jsonc` 설정이 있으면 `provider.cliproxyapi` 없이도 sync가 진행된다.
- legacy `provider.cliproxyapi`만 있는 환경에서는 새 `jsonc`로 마이그레이션되고, `opencode.json`의 legacy entry는 제거된다.
- 새 `jsonc`와 legacy entry가 동시에 있으면 새 파일 기준으로 동작하고 legacy entry는 제거된다.
- README와 `AGENTS.md`가 새 설정 파일 경로와 bootstrap/migration 동작을 설명한다.

---

## 7. Testing Strategy

테스트는 세 층으로 나눈다.

### 7.1 Config Loader Tests

- 파일 없음 -> 템플릿 생성
- 기존 파일 있음 -> 덮어쓰지 않음
- 유효한 `jsonc` -> 값 파싱 성공
- `baseURL` 또는 `apiKey` 누락 -> 안내 가능한 상태 반환

### 7.2 Migration Tests

- legacy `provider.cliproxyapi`만 있을 때 새 파일 생성
- migration 후 `opencode.json`에서 legacy entry 제거
- 새 파일과 legacy entry가 동시에 있으면 새 파일 우선 + legacy 제거

### 7.3 Sync Entry Tests

- 전용 설정 파일이 유효하면 fetch가 호출되고 sync가 진행됨
- 전용 설정 파일이 없거나 필수 값이 비어 있으면 fetch 없이 안내 로그만 남김
- `provider.cliproxyapi`가 없어도 새 파일만으로 sync 가능함

---

## 8. Rationale

이번 변경의 핵심은 sync 기능 자체보다 설정 UX를 플러그인 관점에서 자연스럽게 만드는 것이다. `provider.cliproxyapi`는 내부 구현에는 편하지만 사용자에게는 OpenCode provider schema를 강요한다. 전용 `jsonc` 파일과 자동 bootstrap, 그리고 1회성 legacy migration을 도입하면 사용자 입력 경로는 단순해지고 기존 사용자도 부드럽게 전환할 수 있다. 동시에 legacy entry를 자동 제거해 source of truth를 하나로 고정하면 장기 유지보수 비용도 낮출 수 있다.
