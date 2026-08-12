# 시행착오 정리 (Codex CLI Proxy 연동)

본 세션에서 실제로 겪은 실패 7건. 각 항목 구조: **현상 / 원인 / 해결**. 최초 적용 전 이 문서를 먼저 읽으면 동일한 시간 낭비 회피 가능.

## 목차

- [#1 wire_api = "chat" 거부](#1-wire_api--chat-거부)
- [#2 env_key 환경변수 미설정](#2-env_key-환경변수-미설정)
- [#3 profile 레거시 테이블 거부](#3-profile-레거시-테이블-거부)
- [#4 codex 명령 PATH 누락](#4-codex-명령-path-누락)
- [#5 GUI 환경변수 / 재부팅 소멸](#5-gui-환경변수--재부팅-소멸)
- [#6 macOS timeout 명령 부재](#6-macos-timeout-명령-부재)
- [#7 인증 키 불필요 오해](#7-인증-키-불필요-오해)
- [재발 방지 체크리스트](#재발-방지-체크리스트)

---

## #1 wire_api = "chat" 거부

- **현상**: `codex exec` 실행 시 `Error loading config.toml: wire_api = "chat" is no longer supported.`
- **원인**: codex-cli 0.142 가 OpenAI Chat Completions 호환 모드를 제거. Responses API 로 단일화. (과거 문서/가이드는 대부분 `chat` 기준으로 작성되어 있어 함정)
- **해결**: `wire_api = "responses"` 사용. 단, 이 경우 **프록시가 `/v1/responses` 를 서브해야 함**. 사전에 `curl /v1/responses` 200 확인 필수.
- **탐지 팁**: 바이너리 `strings` grep 으로 `wire_api` 허용값 / `no longer supported` 문자열 확인 가능.

## #2 env_key 환경변수 미설정

- **현상**: `Missing environment variable: LOCAL_PROXY_KEY` 에러. 모델 카탈로그 새로고침 실패로 호출 차단.
- **원인**: Codex 가 `env_key` 로 지정한 환경변수를 호출 시점에 반드시 읽음. 값이 비어있거나 미정의면 에러.
- **해결**: 환경변수를 더미 값이라도 export. 터미널은 `.zshrc`, GUI 앱은 `launchctl setenv`.
- **함정**: 프록시가 키를 무시하므로 "값은 상관없다" 고 착각하기 쉬우나, **"변수 존재 여부" 는 Codex 가 검사** 함. 값이 더미여도 변수 자체는 반드시 정의.

## #3 profile 레거시 테이블 거부

- **현상**: `--profile pro cannot be used while config.toml contains legacy profile = "pro" or [profiles.pro] config`
- **원인**: codex 0.142 가 profile 시스템 변경. `config.toml` 내 `[profiles.<name>]` 테이블 지원 중단. 별도 파일 방식만 허용.
- **해결**: profile 정의를 `~/.codex/<name>.config.toml` 로 분리. `config.toml` 에서 `[profiles.*]` 전부 제거.
- **문서**: https://developers.openai.com/codex/config-advanced#profiles

## #4 codex 명령 PATH 누락

- **현상**: `zsh: command not found: codex`
- **원인**: codex-cli 가 Codex.app 번들 내부(`/Applications/Codex.app/Contents/Resources/codex`)에만 존재. PATH 미등록.
- **해결**: `~/.local/bin/codex` 심볼릭 링크 + `.zshrc` PATH 추가. `/usr/local/bin` 은 sudo 필요하므로 회피.

## #5 GUI 환경변수 / 재부팅 소멸

- **현상**: 터미널에선 동작, Dock 에서 띄운 Codex.app 에선 환경변수 누락. 재부팅 후 `launchctl setenv` 효과 소멸.
- **원인**: GUI 앱은 로그인 셸 환경을 상속하지 않음. `launchctl setenv` 는 현재 세션에만 유효.
- **해결 (임시)**: 매 재부팅 후 `launchctl setenv LOCAL_PROXY_KEY dummy` 수동 실행.
- **해결 (영구)**: LaunchAgent plist 로 부팅 시 setenv 자동 실행.

### LaunchAgent plist (재부팅 후 Codex.app 환경변수 영구화)

`~/Library/LaunchAgents/local.proxy-env.plist` 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>local.proxy-env</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/launchctl</string>
        <string>setenv</string>
        <string>LOCAL_PROXY_KEY</string>
        <string>dummy</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

등록:

```bash
launchctl load -w ~/Library/LaunchAgents/local.proxy-env.plist
launchctl getenv LOCAL_PROXY_KEY   # dummy 확인
```

환경변수를 여러 개로 늘리면 `ProgramArguments` 의 setenv 를 변수별로 나누거나 plist 를 추가. 본 가이드에선 `LOCAL_PROXY_KEY` 한 개만 사용.
- **참고**: CLI(`codex`) 는 `.zshrc` 때문에 재부팅 후에도 항상 동작. 문제는 Codex.app 데스크톱 UI 만.

## #6 macOS timeout 명령 부재

- **현상**: 테스트 스크립트에서 `timeout: command not found` (exit 127). 검증 명령이 실행 자체를 안 함.
- **원인**: macOS coreutils 에 `timeout` 미포함.
- **해결**: 테스트 명령에서 `timeout` 생략하거나 `gtimeout`(coreutils) 사용.
- **영향**: 기능 문제 아님. 검증 스크립트 작성 시 주의.

## #7 인증 키 불필요 오해

- **현상**: `AUTH_TOKEN` / `api-key` 를 실제 값으로 맞추려 시도. 불필요한 작업으로 시간 소모.
- **원인**: CLI Proxy API 가 `Authorization` / `x-api-key` 헤더를 무시함.
- **해결**: 더미 값 사용. Claude Code `ANTHROPIC_AUTH_TOKEN` 도 기존 값 유지. Codex `env_key` 도 더미.
- **검증**: dummy 키로 `/v1/messages`, `/v1/responses` 200 확인으로 확증 가능.

---

## 재발 방지 체크리스트

적용 전 순서대로 확인하면 한 번에 통과:

1. 백업 (`settings.json` / `config.toml`)
2. `/v1/models` 로 모델 ID 정확히 확인
3. Claude Code 용 `/v1/messages`, Codex 용 `/v1/responses` 각각 200 확인
4. Codex: `codex-cli` 버전 확인 (0.142 기준 위 규칙)
5. Codex: 환경변수 export + `launchctl setenv` 양쪽
6. Codex: `config.toml` 에 `[profiles.*]` 남기지 않기
7. `-c` override 로 비파괴 사전 검증 후 config 저장
8. 저장 후 기본 + 각 profile 엔드투엔드 호출
