# Codex 연동

`~/.codex/config.toml` 에 커스텀 provider 를 정의하고, 모델별 profile 을 별도 파일로 분리. **OpenAI Responses API(`/v1/responses`) 사용.** Claude Code 보다 단계가 많고 버전 의존적임. **반드시 [pitfalls.md](./pitfalls.md) 를 먼저 읽을 것.**

## 목차

- [사전 확인](#사전-확인)
- [1단계: codex 명령 PATH 등록](#1단계-codex-명령-path-등록)
- [2단계: 환경변수 주입](#2단계-환경변수-주입)
- [3단계: config.toml provider 정의](#3단계-configtoml-provider-정의)
- [4단계: profile 분리](#4단계-profile-분리)
- [5단계: 검증](#5단계-검증)
- [운영 팁](#운영-팁)

## 사전 확인

codex-cli 버전과 프록시 `/v1/responses` 지원 여부 확인. 본 가이드는 **0.142.x** 기준. 아직 `codex` 명령이 PATH 에 없을 수 있으므로 앱 번들 경로로 먼저 확인.

```bash
CODEX=/Applications/Codex.app/Contents/Resources/codex
"$CODEX" --version        # 0.142.x 확인

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8317/v1/responses \
  -H "Authorization: Bearer dummy" -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","input":"hi"}'   # 200 이어야 함
```

## 1단계: codex 명령 PATH 등록

codex-cli 는 Codex.app 번들 안에만 존재. 터미널에서 `codex` 로 부르려면 심볼릭 링크 필요.

```bash
mkdir -p ~/.local/bin
ln -sf /Applications/Codex.app/Contents/Resources/codex ~/.local/bin/codex

# ~/.zshrc 에 PATH 추가 (한 번만)
grep -q 'HOME/.local/bin' ~/.zshrc || \
  printf '\n# Codex CLI (from Codex.app bundle)\nexport PATH="$HOME/.local/bin:$PATH"\n' >> ~/.zshrc

source ~/.zshrc
codex --version
```

참고: `/usr/local/bin` 은 sudo 필요. `~/.local/bin` 이 sudo 없는 가장 단순한 경로.

## 2단계: 환경변수 주입

provider 의 `env_key` 로 지정할 환경변수. 프록시가 키를 무시하므로 더미 값이어도 됨. 단 **반드시 존재해야 함** (미설정 시 Codex 에러).

터미널용 (`.zshrc`):

```bash
grep -q 'LOCAL_PROXY_KEY=dummy' ~/.zshrc || \
  printf '\n# Codex -> local CLI Proxy API (key ignored by proxy)\nexport LOCAL_PROXY_KEY=dummy\n' >> ~/.zshrc
```

GUI 앱용 (Dock 실행 Codex.app):

```bash
launchctl setenv LOCAL_PROXY_KEY dummy
```

주의: `launchctl setenv` 는 **재부팅 후 소멸**. 영구화는 [pitfalls.md](./pitfalls.md) #5 의 LaunchAgent 항목 참조.

## 3단계: config.toml provider 정의

`~/.codex/config.toml` 백업 후 편집:

```bash
cp ~/.codex/config.toml ~/.codex/config.toml.bak.$(date +%Y%m%d_%H%M%S)
```

상단 기본 모델 변경:

```toml
model_provider = "cliproxy"
model = "gpt-5.4"
model_reasoning_effort = "medium"
```

파일 끝에 provider 추가:

```toml
[model_providers.cliproxy]
name = "Local CLIProxy"
base_url = "http://localhost:8317/v1"
wire_api = "responses"
env_key = "LOCAL_PROXY_KEY"
```

**`wire_api` 는 반드시 `"responses"`. `"chat"` 은 0.142 에서 거부됨.**

## 4단계: profile 분리

codex 0.142 는 `config.toml` 내 `[profiles.*]` 테이블을 레거시로 취급. 모델별 profile 은 **별도 파일** `~/.codex/<이름>.config.toml` 로 작성.

`~/.codex/pro.config.toml`:

```toml
model_provider = "cliproxy"
model = "deepseek-v4-pro"
```

`~/.codex/glm.config.toml`:

```toml
model_provider = "cliproxy"
model = "glm-5.2"
```

`~/.codex/flash.config.toml`:

```toml
model_provider = "cliproxy"
model = "deepseek-v4-flash"
```

`~/.codex/openai-native.config.toml` (탈출구, OpenAI 호스팅 복귀용):

```toml
model_provider = "openai"
model = "gpt-5.4-mini"
```

profile 파일명 규칙: `~/.codex/<name>.config.toml`. `--profile <name>` 이 해당 파일을 base config 위에 오버레이.

## 5단계: 검증

비파괴 사전 검증 (config 저장 전에도 가능, `-c` override):

```bash
LOCAL_PROXY_KEY=dummy codex exec -s read-only --skip-git-repo-check \
  -c 'model_providers.cliproxy.name="Local CLIProxy"' \
  -c 'model_providers.cliproxy.base_url="http://localhost:8317/v1"' \
  -c 'model_providers.cliproxy.wire_api="responses"' \
  -c 'model_providers.cliproxy.env_key="LOCAL_PROXY_KEY"' \
  -c 'model_provider="cliproxy"' -m gpt-5.4 \
  "Reply with exactly one token: OK"
```

저장 후 엔드투엔드 (기본 + 각 profile):

```bash
LOCAL_PROXY_KEY=dummy codex exec -s read-only --skip-git-repo-check "Reply: DEFAULT"
LOCAL_PROXY_KEY=dummy codex exec -s read-only --skip-git-repo-check --profile pro   "Reply: PRO"
LOCAL_PROXY_KEY=dummy codex exec -s read-only --skip-git-repo-check --profile glm   "Reply: GLM"
LOCAL_PROXY_KEY=dummy codex exec -s read-only --skip-git-repo-check --profile flash "Reply: FLASH"
```

`exit=0` 이고 응답 토큰이 나오면 성공.

## 운영 팁

- 모델 전환은 `--profile`. 기본은 `config.toml` 상단 `model`.
- 데스크톱 네이티브 기능(computer-use/plugins/browser)이 필요하면 `--profile openai-native` 으로 복귀.
- Codex.app **UI 의 모델 피커는 이 config 과 별개로 동작할 수 있음**. 본 가이드는 CLI(`codex`, `codex exec`) 기준으로만 검증됨.
