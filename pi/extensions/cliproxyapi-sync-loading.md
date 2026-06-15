# cliproxyapi-sync Pi Extension — 로딩 및 동작 메커니즘

`pi/extensions/cliproxyapi-sync.ts`가 pi에 로드되고 동작하는 전체 흐름을 설명한다.

---

## 목차

- [전체 흐름 개요](#전체-흐름-개요)
- [1. pi 시작 — Extension 탐색 및 로드](#1-pi-시작--extension-탐색-및-로드)
- [2. async factory 실행 — 설정 로드 및 외부 API 호출](#2-async-factory-실행--설정-로드-및-외부-api-호출)
- [3. Provider 등록 — ModelRegistry 반영](#3-provider-등록--modelregistry-반영)
- [4. 정상 흐름 완료 후 — session_start 및 이후 라이프사이클](#4-정상-흐름-완료-후--session_start-및-이후-라이프사이클)
- [5. 오류 경로](#5-오류-경로)
- [주요 설계 포인트 요약](#주요-설계-포인트-요약)

---

## 전체 흐름 개요

```
pi 프로세스 시작
  └─► Extension 탐색 (auto-discovery / -e 플래그)
        └─► jiti로 cliproxyapi-sync.ts 로드
              └─► async default export 실행 (pi 가 await)
                    ├─► cliproxyapi-sync-config.jsonc 로드
                    ├─► cliproxyapi GET /v1/models
                    ├─► models.dev GET api.json
                    ├─► buildProviderConfigs()
                    └─► pi.registerProvider("cp-*", ...) × N
                          └─► ModelRegistry에 cp-* provider 등록 완료
  └─► session_start 발행
  └─► resources_discover 발행
  └─► (이후 일반 에이전트 루프)
```

---

## 1. pi 시작 — Extension 탐색 및 로드

```mermaid
sequenceDiagram
    actor User
    participant pi as pi 프로세스
    participant FS as 파일시스템
    participant jiti as jiti (TS loader)
    participant Ext as cliproxyapi-sync.ts

    User->>pi: pi 실행<br/>(또는 pi -e ./cliproxyapi-sync.ts)

    pi->>FS: Extension 경로 탐색
    Note over pi,FS: 탐색 순서:<br/>~/.pi/agent/extensions/*.ts<br/>.pi/extensions/*.ts<br/>settings.json extensions[]<br/>-e 플래그 경로

    FS-->>pi: cliproxyapi-sync.ts 경로 반환

    pi->>jiti: import(cliproxyapi-sync.ts)
    Note over pi,jiti: TypeScript를 컴파일 없이<br/>런타임에 직접 실행

    jiti->>Ext: 모듈 평가 (top-level)
    Note over Ext: 타입 정의, 상수 초기화<br/>DEFAULT_CONFIG, SUPPORTED_MODALITIES 등

    Ext-->>jiti: default export (async function) 반환
    jiti-->>pi: module.default = async function(pi)
```

---

## 2. async factory 실행 — 설정 로드 및 외부 API 호출

pi는 factory가 `async function`이면 **`await`하여 완료를 기다린 후** 다음 시작 단계로 진행한다.  
따라서 이 단계의 모든 처리가 끝나야 `session_start`가 발행된다.

```mermaid
sequenceDiagram
    participant pi as pi 프로세스
    participant Ext as cliproxyapi-sync.ts
    participant Cfg as cliproxyapi-sync-config.jsonc
    participant Proxy as cliproxyapi 서버<br/>(localhost:8317)
    participant MDev as models.dev<br/>(api.json)

    pi->>Ext: await module.default(piAPI)
    Note over pi,Ext: pi는 이 Promise가 resolve될 때까지<br/>session_start를 발행하지 않음

    %% 1. 설정 로드
    Ext->>Cfg: readFile(~/.config/opencode/cliproxyapi-sync-config.jsonc)
    Note over Ext,Cfg: CLIPROXYAPI_SYNC_CONFIG 환경변수로<br/>경로 재정의 가능

    alt 파일 존재
        Cfg-->>Ext: JSONC 텍스트 반환
        Ext->>Ext: stripJsonComments() → JSON.parse()
        Note over Ext: DEFAULT_CONFIG와 merge<br/>{baseURL, apiKey, managementKey?}
    else ENOENT (파일 없음)
        Cfg-->>Ext: ENOENT 에러
        Ext->>Ext: DEFAULT_CONFIG 사용<br/>(localhost:8317, apiKey="dummy")
    else 기타 파싱 오류
        Cfg-->>Ext: 에러 throw
        Ext-->>pi: console.warn + factory resolve<br/>(등록 없이 종료)
    end

    %% 2. /v1/models 호출
    Ext->>Proxy: GET /v1/models<br/>Authorization: Bearer {apiKey}

    alt HTTP 200
        Proxy-->>Ext: { data: [{id, owned_by?}, ...] }
        Ext->>Ext: payload.data 파싱<br/>ProxyModel[] 구성
    else HTTP 오류 (4xx/5xx)
        Proxy-->>Ext: 오류 응답
        Ext-->>pi: console.warn("[cliproxyapi-sync] disabled: ...")<br/>factory resolve (등록 없이 종료)
    end

    %% 3. models.dev 호출
    Ext->>MDev: GET https://models.dev/api.json
    Note over Ext,MDev: 모달리티/attachment 메타데이터 취득

    alt HTTP 200
        MDev-->>Ext: ModelsDevCatalog JSON
        Ext->>Ext: buildModelsDevMetadataByOwner()<br/>owner별 {attachment, modalities} 구성
    else 네트워크 오류 / HTTP 오류
        MDev-->>Ext: 오류
        Ext->>Ext: console.warn + metadataByOwner = {}
        Note over Ext: 모달리티 동기화 skip,<br/>나머지 흐름은 계속 진행
    end

    %% 4. Provider 구성
    Ext->>Ext: buildProviderConfigs(config, models, metadataByOwner)
    Note over Ext: 모델별 owner 결정<br/>(owned_by 필드 우선 → "/" 접두어 fallback)<br/>owner별 cp-{owner} provider 그룹핑<br/>input 모달리티 결정:<br/>  modalities.input에 image 포함 → ["text","image"]<br/>  modalities 없음 → isImageModel() 패턴 매칭<br/>  그 외 → ["text"]
```

---

## 3. Provider 등록 — ModelRegistry 반영

```mermaid
sequenceDiagram
    participant Ext as cliproxyapi-sync.ts
    participant piAPI as ExtensionAPI (pi)
    participant Registry as ModelRegistry
    participant Models as pi 모델 목록

    loop cp-{owner} provider마다
        Ext->>piAPI: pi.registerProvider("cp-openai", {<br/>  baseUrl, apiKey,<br/>  api: "openai-completions",<br/>  compat: {supportsDeveloperRole:false, maxTokensField:"max_tokens"},<br/>  models: [{id, name, reasoning, input, cost, contextWindow, maxTokens}]<br/>})

        piAPI->>Registry: validateProviderConfig()
        Note over Registry: baseUrl 필수 확인<br/>apiKey 필수 확인<br/>각 모델 api 확인

        Registry->>Models: 기존 cp-openai 모델 제거<br/>(full replacement)
        Registry->>Models: 새 모델 목록 추가

        Registry-->>piAPI: 등록 완료
        piAPI-->>Ext: (void)
    end

    Ext->>Ext: console.log("[cliproxyapi-sync] registered N models...")
    Ext-->>piAPI: factory Promise resolve
```

---

## 4. 정상 흐름 완료 후 — session_start 및 이후 라이프사이클

```mermaid
sequenceDiagram
    participant pi as pi 프로세스
    participant Registry as ModelRegistry
    participant User as 사용자 (TUI)

    Note over pi: factory await 완료 → 시작 단계 재개

    pi->>pi: session_start 발행 { reason: "startup" }
    pi->>pi: resources_discover 발행

    pi->>Registry: getAll() / getAvailable()
    Note over Registry: cp-* provider 포함 전체 모델 반환

    pi->>User: TUI 준비 완료 (모델 선택 가능)
    Note over User: /model 또는 Ctrl+P로<br/>cp-openai/openai/... 등 선택 가능

    User->>pi: 프롬프트 입력

    pi->>pi: before_agent_start
    pi->>pi: agent_start
    pi->>Registry: 선택된 cp-* provider 모델로 요청
    Note over Registry: baseUrl(cliproxyapi 서버) + apiKey 적용<br/>openai-completions API 사용

    pi-->>User: 응답 스트리밍
```

---

## 5. 오류 경로

```mermaid
sequenceDiagram
    participant pi as pi 프로세스
    participant Ext as cliproxyapi-sync.ts
    participant Proxy as cliproxyapi 서버

    pi->>Ext: await module.default(piAPI)

    Ext->>Proxy: GET /v1/models
    Proxy-->>Ext: 연결 거부 / timeout / 4xx

    Ext->>Ext: catch(error)<br/>message = error.message

    Ext->>pi: console.warn("[cliproxyapi-sync] disabled: model list request failed: HTTP 401")
    Note over pi,Ext: registerProvider() 호출 없음<br/>cp-* provider 등록 안 됨

    Ext-->>pi: factory Promise resolve (정상 종료)
    Note over pi: pi 자체는 계속 시작<br/>cliproxyapi 모델만 없는 상태로 동작
```

---

## 주요 설계 포인트 요약

| 항목 | 내용 |
|------|------|
| **로더** | [jiti](https://github.com/unjs/jiti) — 컴파일 없이 TypeScript 직접 실행 |
| **factory 타입** | `async function` — pi가 `await`하여 완료 보장 |
| **block 지점** | factory resolve 전까지 `session_start` 발행 안 됨 |
| **설정 파일** | `~/.config/opencode/cliproxyapi-sync-config.jsonc` (JSONC, 주석 허용) |
| **설정 미존재 시** | DEFAULT_CONFIG(`localhost:8317`)로 fallback, 오류 없이 진행 |
| **models.dev 실패 시** | warning만 출력, 모달리티 없이 나머지 동기화 계속 진행 |
| **proxy 서버 실패 시** | `console.warn` 후 factory resolve — pi는 계속 시작 |
| **provider 명명** | `cp-{normalizedOwner}` (예: `cp-openai`, `cp-github-copilot`) |
| **모달리티 결정** | models.dev `modalities.input` 우선 → 없으면 `isImageModel()` 패턴 매칭 |
| **pi 스키마 제약** | pi `registerProvider` 모델은 `input: ("text" \| "image")[]`만 지원 — audio/video/pdf는 image 유무로만 반영 |
| **hot-reload** | `~/.pi/agent/extensions/`에 배치 시 `/reload` 커맨드로 재실행 가능 |
