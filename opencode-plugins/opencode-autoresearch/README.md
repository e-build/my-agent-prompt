# opencode-autoresearch

`lab-*` Bilevel Autoresearch 워크플로우를 OpenCode plugin 패키지 형태로 캡슐화한 디렉토리다.

## 포함 내용

- `index.js`: OpenCode plugin 엔트리
- `postinstall.js`: `commands`, `agents`, `skills` 설치 스크립트
- `install-local.sh`: 로컬 검증용 설치 스크립트
- `commands/`: `lab-init`, `lab-run`, `lab-status`, `lab-analyze`
- `agents/`: `lab-orchestrator`
- `skills/`: `autoresearch`

## 구조

```text
opencode-plugins/
  opencode-autoresearch/
    package.json
    index.js
    postinstall.js
    install-local.sh
    agents/
    commands/
    skills/
```

## 사용

1. 로컬 검증: `bash opencode-plugins/opencode-autoresearch/install-local.sh`
2. 프로젝트에서 `/lab-init`
3. 이어서 `/lab-run`
