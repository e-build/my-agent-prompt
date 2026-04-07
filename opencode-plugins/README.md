# OpenCode Plugins

이 디렉토리는 `my-agent-prompt` 안에서 재사용 가능한 OpenCode plugin 패키지를 모아두는 레지스트리다.

## 원칙

- 각 플러그인은 독립 디렉토리 하나로 관리한다.
- 패키지 내부에는 최소한 `package.json`, `index.js`, 설치 문서가 있어야 한다.
- markdown 자산이 필요하면 패키지 내부 `commands/`, `agents/`, `skills/`에 함께 포함한다.
- 저장소 루트의 `command/`는 standalone 커맨드용이고, 플러그인 내부는 OpenCode 패키지 규칙에 맞춰 `commands/`를 사용한다.

## 현재 패키지

| Package | 목적 | 로컬 설치 |
|---------|------|-----------|
| `opencode-autoresearch` | `lab-*` Bilevel Autoresearch 워크플로우 | `bash opencode-plugins/opencode-autoresearch/install-local.sh` |

## 새 플러그인 추가 체크리스트

1. `opencode-plugins/<package-name>/` 디렉토리 생성
2. `package.json`, `index.js`, `README.md` 추가
3. 필요한 경우 `commands/`, `agents/`, `skills/` 자산 동봉
4. 로컬 검증용 `install-local.sh` 또는 동등한 설치 스크립트 제공
5. 이 문서의 패키지 표에 항목 추가
