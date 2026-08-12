# AGENTS.md

## 목적

이 저장소는 **Pi, OpenCode, Claude Code, Codex** 4개 코딩 에이전트가 공유하는 프롬프트 자원의 정본(canonical source)을 관리한다.

각 에이전트는 같은 디렉터리 계약을 따르되, 필요한 adapter만 구현한다. 모든 에이전트에 똑같은 wrapper를 강제하지 않는다.

---

## 구조

```
resources/          # 공통 자원의 정본 (도구에 독립적)
  skills/           #   Agent Skills — 에이전트가 자율 로드하는 능력
  commands/         #   공유 명령어 본문 — 사용자가 / 로 호출하는 실행 본문
  roles/            #   도구 독립 역할 정의 (현재 비어 있음, 향후 확장)
  references/       #   재사용 규칙, 아키텍처 가이드, 리뷰 체크리스트
  templates/        #   zz-workflow 명령이 대상 프로젝트로 복사하는 템플릿
    feature-workflow/

adapters/           # 도구별 adapter — frontmatter·호출 문법·경로 차이만 담당
  pi/commands/      #   Pi slash command wrapper (→ ~/.pi/agent/prompts/)
  opencode/
    commands/       #   OpenCode slash command wrapper
    agents/         #   OpenCode subagent 정의 (frontmatter 포함)
  claude/commands/  #   Claude Code adapter (현재 비어 있음)
  codex/commands/   #   Codex adapter (현재 비어 있음)

runtime/            # 도구별 실행 코드 — extension, plugin, theme, launcher
  pi/
    extensions/     #   Pi TypeScript extensions
    themes/         #   Pi 테마
    config/         #   설정 예시 (settings, mcp)
    bin/            #   compact Pi launcher
  opencode/
    plugins/        #   OpenCode plugin 패키지

integrations/       # 외부 서비스 연동
  cliproxyapi/      #   CLI Proxy API 서버 구성 + Claude Code/Codex 연동 가이드

scripts/            # 설치 및 검증 스크립트
  install-pi        #   Pi 자원 배포
  install-opencode  #   OpenCode 자원 배포
  install-claude    #   Claude Code 안내 (미구현)
  install-codex     #   Codex 안내 (미구현)
  check-resources   #   구조 무결성 검증
```

---

## 새 파일을 어디에 둘까?

| 만드는 것 | 위치 | 예시 |
|-----------|------|------|
| 에이전트가 자율 로드할 능력 | `resources/skills/<category>/<name>/SKILL.md` | `skills/dev/grill-me-heavily/` |
| `/` 명령어의 실행 본문 | `resources/commands/<name>.md` | `commands/me-ladder-explain.md` |
| Pi 전용 명령 wrapper | `adapters/pi/commands/<name>.md` | thin wrapper, `Read resources/commands/<name>.md` |
| OpenCode 전용 명령 wrapper | `adapters/opencode/commands/<name>.md` | thin wrapper, `` !`cat resources/commands/<name>.md` `` |
| Pi extension / theme | `runtime/pi/extensions/` 또는 `runtime/pi/themes/` | TypeScript 실행 코드 |
| OpenCode plugin | `runtime/opencode/plugins/<name>/` | |
| 외부 서비스 연동 구성 | `integrations/<service>/` | CLI Proxy API |

---

## 핵심 원칙

1. **정본은 하나.** 실행 지침은 `resources/`에만 작성한다. adapter에 본문을 복사하지 않는다.
2. **adapter는 필요할 때만.** 특정 명령을 Pi만 지원한다면 Pi adapter만 만든다.
3. **실행 코드와 프롬프트를 섞지 않는다.** TypeScript extension, theme, plugin은 `runtime/`에 둔다.
4. **AGENTS.md는 인벤토리가 아니다.** 파일 수나 상세 목록은 적지 않는다. `scripts/check-resources`로 검증한다.

---

## 설치

```bash
# Pi 전체 설치
bash scripts/install-pi --restore --copy-config

# OpenCode 전체 설치
bash scripts/install-opencode

# Claude Code / Codex는 현재 adapter가 없음
bash scripts/install-claude   # 안내만 출력
bash scripts/install-codex    # 안내만 출력

# 구조 무결성 검증
bash scripts/check-resources
```

---

## Pi 특이사항

- 저장소의 `adapters/pi/commands/`는 Pi 런타임에서 `~/.pi/agent/prompts/`로 로드된다.
- 공유 명령어 본문은 `~/.pi/agent/commands/`로 심링크되어 Pi wrapper의 `Read` fallback 경로로 사용된다.

## OpenCode 특이사항

- `adapters/opencode/agents/`의 agent 정의는 OpenCode 전용 frontmatter(`mode`, `tools`)를 포함한다. 도구 독립적인 역할 정의는 `resources/roles/`로 추출하는 것을 목표로 하되, 현재는 OpenCode가 include 문법을 지원하지 않아 adapter에 전체 정의를 둔다.
