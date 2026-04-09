# cliproxyapi-sync Plugin Linkage Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Author:** Brainstormed with OpenCode AI

---

## 1. Overview

`cliproxyapi-sync` 플러그인은 현재 `~/.config/opencode/opencode.json`의 `plugin` 배열에 빌드 출력 파일 절대 경로를 직접 등록해서 로드되고 있다. 이 설계의 목표는 해당 플러그인을 다른 로컬 OpenCode 플러그인과 같은 방식으로 `~/.config/opencode/plugins/` 아래의 심링크로 연결하도록 정리하는 것이다.

### Goals

- `cliproxyapi-sync` 로드 방식을 `plugins` 디렉토리 심링크 패턴으로 통일한다.
- 글로벌 설정 파일의 `plugin` 배열에서 로컬 빌드 산출물 절대 경로 의존성을 제거한다.
- 저장소 문서가 실제 운영 방식과 일치하도록 정리한다.
- 플러그인별 설치 스크립트 없이도 수동 절차가 충분히 명확하도록 문서화한다.

### Non-Goals

- `cliproxyapi-sync` 플러그인 동작 로직 자체는 변경하지 않는다.
- npm 배포나 자동 설치 흐름은 추가하지 않는다.
- 범용 `install-local.sh`를 새로 만들지 않는다.

---

## 2. Problem Statement

현재 방식은 `opencode.json` 안에 특정 저장소 경로의 `dist/index.js`를 직접 적어 두기 때문에 다음 문제가 있다.

- 로컬 개발용 플러그인임에도 설정 파일이 빌드 산출물의 절대 경로를 직접 알아야 한다.
- 같은 저장소 안의 다른 플러그인 문서와 설치 패턴이 일관되지 않다.
- 나중에 플러그인 관리를 볼 때 `plugins` 디렉토리 기반 설치와 `plugin` 배열 기반 설치가 혼재되어 이해 비용이 커진다.

---

## 3. Options Considered

### Option A. `opencode.json` 직접 등록 유지

- 장점: 이미 동작 중이고 추가 파일이 필요 없다.
- 단점: 로컬 플러그인 운영 패턴이 분산되고, 절대 경로가 설정 파일에 남는다.

### Option B. `plugins` 디렉토리 심링크 + 패키지 README 제공

- 장점: 운영 방식이 단순하고 OpenCode의 플러그인 디렉토리 로딩 순서와도 자연스럽게 맞는다.
- 장점: 패키지 디렉토리만 봐도 빌드와 심링크 연결 방법을 바로 확인할 수 있다.
- 단점: README 파일 하나가 추가된다.

### Option C. `plugins` 디렉토리 심링크 + 설치 스크립트 제공

- 장점: 반복 설치 자동화가 가능하다.
- 단점: 현재 요구 범위에 비해 관리 포인트가 늘어나고, 단일 플러그인용 스크립트 유지 비용이 생긴다.

**Approved choice:** Option B.

---

## 4. Approved Design

### 4.1 Local OpenCode Config

`~/.config/opencode/opencode.json`의 `plugin` 배열에서 다음 항목을 제거한다.

```json
"/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/dist/index.js"
```

대신 아래 심링크를 생성한다.

```bash
~/.config/opencode/plugins/cliproxyapi-sync.js -> /Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/dist/index.js
```

이 방식은 글로벌 플러그인 디렉토리 기반 로드 순서와 맞고, 설정 파일에서 로컬 빌드 산출물 경로를 제거할 수 있다.

### 4.2 Repository Documentation

다음 문서를 실제 운영 방식에 맞게 수정한다.

- `AGENTS.md`
- `opencode-plugins/README.md`

문서 변경 원칙은 다음과 같다.

- `cliproxyapi-sync`도 `forge-plugin`과 같은 `plugins` 디렉토리 심링크 패턴으로 설명한다.
- `opencode.json` 직접 등록은 일반 개발 기본 패턴이 아니라 특수한 대안 또는 기존 방식 정도로만 남기거나, `cliproxyapi-sync` 설명에서는 제거한다.
- 루트 문서의 리소스 매핑표와 설치 예제가 실제 연결 경로를 반영하도록 맞춘다.

### 4.3 Package-Level Documentation

`opencode-plugins/cliproxyapi-sync/README.md`를 새로 추가한다.

이 README는 아래 내용만 간단히 포함한다.

- 플러그인 목적 한 줄 설명
- `bun run build`
- `~/.config/opencode/plugins/cliproxyapi-sync.js` 심링크 생성 명령
- 필요 시 기존 잘못된 `opencode.json` 등록을 제거해야 한다는 짧은 메모

이 패키지에는 `install-local.sh`를 추가하지 않는다. 현재는 수동 `ln -s` 한 줄이 더 단순하고 유지 비용이 낮다.

---

## 5. Implementation Scope

이 설계가 승인되면 실제 작업은 아래 범위만 포함한다.

1. 로컬 `~/.config/opencode/opencode.json` 편집
2. 로컬 `~/.config/opencode/plugins/cliproxyapi-sync.js` 심링크 생성
3. 저장소 문서 2개 수정
4. 패키지 README 1개 추가

다음은 제외한다.

- 플러그인 코드 수정
- 빌드 시스템 구조 변경
- 범용 설치 스크립트 도입

---

## 6. Validation

변경 후 아래 상태를 확인한다.

- `~/.config/opencode/opencode.json`의 `plugin` 배열에 `cliproxyapi-sync` 절대 경로가 더 이상 없다.
- `~/.config/opencode/plugins/cliproxyapi-sync.js`가 올바른 `dist/index.js`를 가리키는 심링크다.
- `AGENTS.md`와 `opencode-plugins/README.md`가 새 연결 방식을 설명한다.
- `opencode-plugins/cliproxyapi-sync/README.md`에서 수동 빌드 및 심링크 절차를 확인할 수 있다.

---

## 7. Rationale

이번 변경은 기능 추가가 아니라 운영 방식 정리다. 따라서 자동화 스크립트보다 설치 패턴의 일관성과 문서 정확성이 더 중요하다. `plugins` 디렉토리 심링크는 현재 저장소의 다른 로컬 플러그인 운영 방식과 잘 맞고, `opencode.json`에 개발용 산출물 경로를 남기지 않아도 되므로 가장 단순한 장기 유지보수 해법이다.
