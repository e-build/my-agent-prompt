# CLI Proxy API 연동 가이드

로컬에서 실행 중인 CLI Proxy API(`localhost:8317`)를 **Claude Code** 와 **Codex** 의 기본 엔드포인트로 교체하는 절차. 한 번의 프록시 구성으로 OpenAI 계정(OAuth), DeepSeek API 키, Z.AI API 키로 노출된 모델을 단일 엔드포인트에서 함께 사용.

## 목차

- [서버 구성 설치](#서버-구성-설치)
- [대상 독자](#대상-독자)
- [전제 조건](#전제-조건)
- [사용 가능 모델](#사용-가능-모델)
- [빠른 검증](#빠른-검증)
- [문서 구성](#문서-구성)
- [핵심 주의사항](#핵심-주의사항)

## 서버 구성 설치

이 디렉토리에는 서버 실행에 필요한 구성 소스가 함께 보관되어 있다.

| 파일 | 용도 |
|------|------|
| `config.template.yaml` | 서버 구성 템플릿. API 키는 `__CLIPROXY_*__` 플레이스홀더 |
| `docker-compose.yml` | `eceasy/cli-proxy-api` 컨테이너 실행 정의 |
| `install.sh` | 어느 머신에서든 동일 구성 설치 + 템플릿 동기화 스크립트 |

> 관리 UI는 컨테이너가 `http://localhost:8317/management.html` 에서 자체 서빙한다.
> 별도 파일 보관/마운트 불필요 (`docker-compose.yml` 에 static 마운트 없음).

```bash
# 기본: $HOME/cliproxyapi 에 설치 + docker compose up
bash integrations/cliproxyapi/install.sh

# 키는 환경변수로 주입 (bash 네이티브, python/sed 외부 의존 없음)
CLIPROXY_SECRET_KEY=... CLIPROXY_ZAI_API_KEY=... CLIPROXY_DEEPSEEK_API_KEY=... \
  bash integrations/cliproxyapi/install.sh

# 기존 config.yaml을 통째로 복사해 신규 머신에 동일 구성 재현
bash integrations/cliproxyapi/install.sh --from /path/to/기존/config.yaml

# 실제 config 변경 → 템플릿에 반영 (키는 플레이스홀더화, 드리프트 방지)
bash integrations/cliproxyapi/install.sh --sync-from ~/cliproxyapi/config.yaml

# 대상 디렉토리/동작 변경
CLIPROXY_DIR=/opt/cpa bash integrations/cliproxyapi/install.sh --no-compose
```

동작 방식 (설치 모드):

1. 대상 디렉토리(기본 `$HOME/cliproxyapi`, `CLIPROXY_DIR`로 변경)에 `docker-compose.yml` 복사
2. `config.yaml` 이 없으면 템플릿에서 생성하고 환경변수로 키를 주입.
   `--from` 이 있으면 템플릿 생성 대신 그 파일을 통째로 복사.
   이미 `config.yaml` 이 있으면 유지 (재실행해도 안전)
3. `docker compose up -d` 후 `/v1/models` 응답을 재시도로 검증

동기화 모드 (`--sync-from`):

- 실제 config.yaml 의 구조(프로바이더/모델/alias)를 템플릿에 덮어쓰고,
- 3개 키(secret-key, zai api-key, deepseek api-key)만 플레이스홀더로 되돌린다.
- 실제 config에 모델을 추가한 뒤 실행하면 템플릿이 따라감 (보관 = 유지)

> **보안**: 이 저장소는 **public** 이다. 실제 API 키가 담긴 `config.yaml` 을 커밋하지 말 것.
> 템플릿의 플레이스홀더를 실제 값으로 바꾼 파일은 git 에 올리지 않는다 (`.gitignore` 에 `cliproxyapi/config.yaml` 등록됨).

### OAuth 인증 파일 (`auth-dir`)

`config.yaml` 의 `auth-dir` 은 컨테이너 내부 경로(`/root/.cli-proxy-api`)이며, 호스트의 `~/.cli-proxy-api/` 가 마운트된다.
여기 담기는 OAuth 토큰(`codex-*.json` 등)은 머신/계정별 인증 파일이므로 **저장소에 보관하지 않는다.**
새 머신에서는 프록시 관리 UI(또는 프록시 OAuth 플로우)로 재로그인한다.

## 대상 독자

- 회사 컴퓨터(macOS)에서 Claude Code, Codex 를 모두 쓰는 사용자
- CLI Proxy API 를 로컬에 이미 띄운 상태 (Docker 등)
- Claude Code 는 `~/.claude/settings.json`, Codex 는 `~/.codex/config.toml` 로 설정하는 환경

## 전제 조건

- CLI Proxy API 가 `localhost:8317` 에서 LISTEN 중
- 프록시는 인증 키를 무시함 (더미 키로 호출 가능)
- 사용하려는 모델이 프록시 config 에 노출되어 있음
- macOS (Codex.app 데스크톱 앱 기준)

검증:

```bash
docker ps | grep cli-proxy-api
curl -s http://localhost:8317/v1/models | python3 -m json.tool | head -40
```

## 사용 가능 모델

본 세션에서 사용한 모델. 모델 ID 는 프록시 config 에 따라 변함.

| 모델 ID | 업스트림 | 용도 |
|---------|---------|------|
| `gpt-5.4` | OpenAI (ChatGPT Plus OAuth) | 메인 코딩 |
| `gpt-5.4-mini` | OpenAI | 가벼운 작업 / OpenAI 네이티브 탈출구 |
| `deepseek-v4-pro` | DeepSeek API | 메인 코딩 대안 |
| `deepseek-v4-flash` | DeepSeek API | 빠른/경량 호출 |
| `glm-5.2` | Z.AI API | 고성능 / 서브에이전트 |

## 빠른 검증

설정 변경 전, 프록시가 두 엔드포인트를 모두 서브하는지 먼저 확인. **Claude Code 는 Anthropic Messages API(`/v1/messages`), Codex 는 OpenAI Responses API(`/v1/responses`) 사용** 이 핵심. 둘은 다른 엔드포인트.

```bash
# Claude Code 용 (/v1/messages)
curl -s -o /dev/null -w "messages=%{http_code}\n" http://localhost:8317/v1/messages \
  -H "Content-Type: application/json" -H "x-api-key: dummy" -H "anthropic-version: 2023-06-01" \
  -d '{"model":"glm-5.2","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'

# Codex 용 (/v1/responses)
curl -s -o /dev/null -w "responses=%{http_code}\n" http://localhost:8317/v1/responses \
  -H "Content-Type: application/json" -H "Authorization: Bearer dummy" \
  -d '{"model":"gpt-5.4","input":"hi"}'
```

둘 다 `200` 이면 진행.

## 문서 구성

- [claude-code.md](./claude-code.md) — Claude Code 설정 (`~/.claude/settings.json`)
- [codex.md](./codex.md) — Codex 설정 (`~/.codex/config.toml` + profile 분리 + PATH)
- [pitfalls.md](./pitfalls.md) — 시행착오 정리 (가장 먼저 읽을 것)

**최초 적용 시 `pitfalls.md` 를 먼저 훑으면 동일한 실패 회피 가능.**

## 핵심 주의사항

1. **Codex 0.142 는 `wire_api = "chat"` 거부. 무조건 `"responses"`.**
2. **Codex `env_key` 환경변수는 필수. 값은 더미라도 있어야 함.**
3. **Codex profile 은 `config.toml` 의 `[profiles.*]` 가 아니라 별도 파일 `~/.codex/<이름>.config.toml`.**
4. **`codex` 바이너리는 앱 번들 안에만 있음. PATH 심볼릭 링크 필요.**
5. **GUI 앱 환경변수는 `launchctl setenv` 로. 재부팅 후엔 풀리므로 LaunchAgent 필요.**

상세는 [pitfalls.md](./pitfalls.md).
