# cliproxyapi-sync (Pi extension)

Pi 전용 확장. 로컬 CLIProxyAPI(`router-for-me/CLIProxyAPI`) 인스턴스에서 모델을 발견해 `cp-*` provider로 등록한다.

- 소스: [`cliproxyapi-sync.ts`](./cliproxyapi-sync.ts)
- 심링크 설치: `bash pi/install.sh --restore` → `~/.pi/agent/extensions/cliproxyapi-sync.ts`

## 동작 흐름

1. `loadConfig()` — `~/.config/opencode/cliproxyapi-sync-config.jsonc` 로드
2. `fetchModels()` — `GET /v1/models` 로 모델 목록/owner 확보
3. `fetchCodexContextWindows()` — `GET /v1/models?client_version=1` 로 `slug → context_window` 맵 구성
4. `fetchModelsDevMetadataByOwner()` — image/tool capability 보강(models.dev)
5. `buildProviderConfigs()` — 위 결과를 merge해 `pi.registerProvider()` 인자 생성

## context window 소스

CLIProxyAPI의 plain `/v1/models`는 OpenAI 표준 4필드(`id`, `object`, `created`, `owned_by`)만 노출한다(`OpenAIModels` 핸들러가 의도적으로 필터링). 대신 Codex 호환 분기인 `/v1/models?client_version=1` 응답이 모델별 `context_window`를 포함한다.

- 응답 예: `{ "models": [{ "slug": "openai/gpt-5.4", "context_window": 272000, "max_context_window": 1000000 }] }`
- `slug` 가 plain `/v1/models` 의 `id` 와 1:1 매칭된다.
- 이 확장은 **`context_window`** 필드만 사용한다 (`max_context_window` 미사용).

### 해석 우선순위

`resolveContextWindow` 는 모델별로 아래 순서로 값을 고른다:

1. reasoning suffix(`-low/-medium/-high/...`)를 제거한 id로 codex 맵 조회 → variant가 base 모델 창을 상속
2. 정규화된 id(`owner/raw`)
3. raw id
4. `DEFAULT_CONTEXT_WINDOW` (128000)

모든 단계는 `asPositiveInteger` 로 양의 정수만 통과시킨다. codex fetch 실패 / slug 누락 / 0 이하 값은 전부 128000으로 graceful degrade하며 startup을 깨지 않는다.

## maxTokens

이번 변경에서 다루지 않는다. codex 응답에 신뢰할 수 있는 max-output 필드가 없기 때문(`truncation_policy.limit`은 truncation 룰이지 출력 한도가 아님). 기존 기본값(16384)을 유지한다.

## 설정

`~/.config/opencode/cliproxyapi-sync-config.jsonc`:

```jsonc
{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "dummy",
  "reasoningVariants": {
    "gpt-5.5": ["low", "medium", "high"]
  }
}
```

## 테스트

```bash
NODE=/Users/.../node-v22.22.3-darwin-arm64/bin/node
$NODE --test --experimental-strip-types pi/extensions/cliproxyapi-sync.test.ts
```

`buildProviderConfigs` 의 context window 해석 로직을 `node:test` 로 검증한다. bun 불필요.
