# cliproxyapi-sync (Pi extension)

Pi 전용 확장. 로컬 CLIProxyAPI(`router-for-me/CLIProxyAPI`) 인스턴스에서 모델을 발견해 `cp-*` provider로 등록한다.

- 소스: [`index.ts`](./index.ts)
- 심링크 설치: `bash scripts/install-pi --restore` → `~/.pi/agent/extensions/cliproxyapi-sync/` (디렉토리)

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

models.dev `limit.output` 을 출력 한도 소스로 쓴다(codex 응답의 `truncation_policy.limit`은 truncation 룰이지 출력 한도가 아니므로 쓰지 않는다).

```
maxTokens = models.dev limit.output   // limit.output 없으면 16384
```

- extension에서 임의 상한을 두지 않고 공급사·모델이 선언한 출력 한도를 그대로 쓴다. 남은 context 기준 조정은 pi-ai(`clampMaxTokensToContext`)가 요청 시점에 한다.
- reasoning variant(`-high` 등)는 base 모델의 한도를 그대로 쓴다.
- 배경: 16384 고정값에서 Claude가 thinking과 큰 `write` 도구 호출을 함께 내보내다 한도에 닿아 `stopReason: "length"`("Response was truncated before completion.")가 반복됐다.

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
$NODE --test --experimental-strip-types runtime/pi/extensions/cliproxyapi-sync/cliproxyapi-sync.test.ts
```

`buildProviderConfigs` 의 context window 해석 로직을 `node:test` 로 검증한다. bun 불필요.
