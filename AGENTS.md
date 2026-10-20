# AGENTS.md

## 목차

- [목적](#목적)
- [구조](#구조)
- [새 파일을 어디에 둘까?](#새-파일을-어디에-둘까)
- [핵심 원칙](#핵심-원칙)
- [설치](#설치)
- [스킬 배포 (Agent Skills 표준)](#스킬-배포-agent-skills-표준)
- [외부 스킬 요청 처리](#외부-스킬-요청-처리)
- [Pi 특이사항](#pi-특이사항)
- [OpenCode 특이사항](#opencode-특이사항)

## 목적

이 저장소는 **Pi, OpenCode, Claude Code, Codex** 4개 코딩 에이전트가 공유하는 프롬프트 자원의 정본(canonical source)을 관리한다.

각 에이전트는 같은 디렉터리 계약을 따르되, 필요한 adapter만 구현한다. 모든 에이전트에 똑같은 wrapper를 강제하지 않는다.

---

## 구조

```
resources/          # 공통 자원의 정본 (도구에 독립적)
  skills/           #   직접 관리하는 Agent Skills
  external-skills.json # 외부 스킬 사용 목록 (원본은 upstream에서 관리)
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
  install-skills    #   Agent Skills → ~/.agents/skills/ (표준 위치, 전 도구 공유)
  sync-external-skills # 외부 스킬 클론·연결 및 명시적 업데이트
  install-pi        #   Pi 자원 배포 (스킬 제외)
  install-opencode  #   OpenCode 자원 배포 (스킬 제외)
  install-claude    #   Claude Code 안내 (미구현)
  install-codex     #   Codex 안내 (미구현)
  check-resources   #   구조 무결성 검증
```

---

## 새 파일을 어디에 둘까?

| 만드는 것 | 위치 | 예시 |
|-----------|------|------|
| 직접 관리하는 스킬 | `resources/skills/<category>/<name>/SKILL.md` | `skills/dev/grill-me-heavily/` |
| 외부 스킬 참조 | `resources/external-skills.json` | URL·브랜치·선택 스킬 경로만 등록 |
| `/` 명령어의 실행 본문 | `resources/commands/<name>.md` | `commands/me-ladder-explain.md` |
| Pi 전용 명령 wrapper | `adapters/pi/commands/<name>.md` | thin wrapper, `Read resources/commands/<name>.md` |
| OpenCode 전용 명령 wrapper | `adapters/opencode/commands/<name>.md` | thin wrapper, `` !`cat resources/commands/<name>.md` `` |
| Pi extension / theme | `runtime/pi/extensions/` 또는 `runtime/pi/themes/` | TypeScript 실행 코드 |
| OpenCode plugin | `runtime/opencode/plugins/<name>/` | |
| 외부 서비스 연동 구성 | `integrations/<service>/` | CLI Proxy API |

---

## 핵심 원칙

1. **정본은 하나.** 직접 관리하는 실행 지침은 `resources/`에만 작성한다. adapter에 본문을 복사하지 않는다. 외부 스킬의 실행 지침은 upstream이 정본이다.
2. **adapter는 필요할 때만.** 특정 명령을 Pi만 지원한다면 Pi adapter만 만든다.
3. **실행 코드와 프롬프트를 섞지 않는다.** TypeScript extension, theme, plugin은 `runtime/`에 둔다.
4. **AGENTS.md는 인벤토리가 아니다.** 파일 수나 상세 목록은 적지 않는다. `scripts/check-resources`로 검증한다.
5. **외부 스킬 원본은 upstream에 둔다.** 이 저장소에는 사용 목록만 기록하며 원본 복사·수정 없이 저장소 밖의 클론에 연결한다.

---

## 설치

```bash
# 직접 관리하는 스킬만 설치 (외부 스킬 제외)
bash scripts/install-skills

# 외부 스킬 설치 / 필요할 때만 upstream 업데이트
python3 scripts/sync-external-skills
python3 scripts/sync-external-skills --update

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

## 스킬 배포 (Agent Skills 표준)

`resources/skills/`의 스킬은 도구별 경로가 아니라 Agent Skills 표준 위치 `~/.agents/skills/`로 심링크된다.

- **Pi, OpenCode**: 표준 위치를 네이티브로 읽는다. 별도 링크 불필요.
- **Claude Code**: `~/.claude/skills/`만 읽으므로 `install-skills`가 브릿지 심링크를 만든다.
- **Codex**: `~/.codex/skills/`를 읽는다. 아직 자동화되지 않았다.
- 사용자가 직접 관리하는 실제 디렉터리는 절대 덮어쓰지 않는다.
- 외부 스킬은 별도 명령으로 설치하며, 관리 계약·경로·호환성은 [외부 스킬 관리](resources/external-skills.md) 참고.

## 외부 스킬 요청 처리

GitHub 스킬 추가·설치·동기화·업데이트 요청 시 먼저 [외부 스킬 관리](resources/external-skills.md)와 [사용 목록](resources/external-skills.json)을 읽는다. 이전 세션 대화 없이도 이 두 파일을 기준으로 처리한다.

- 새 외부 스킬은 원본 복사 없이 URL·추적 브랜치·선택 경로만 등록한다. 범위가 불명확하면 등록만 할지 설치까지 할지 확인한다.
- `category`는 목록의 분류이며 로컬 스킬 디렉터리를 만들라는 의미가 아니다.
- 설치에는 `python3 scripts/sync-external-skills [source-id]`, 명시적 최신화 요청에만 `--update`를 사용한다.
- 조회만 요청하면 클론·링크를 변경하지 않는다. 기존 경로 충돌이나 로컬 수정은 자동 해결하지 않는다.
- 등록된 목록을 전역 설치 상태로 간주하지 않는다. 완료 보고에서 등록·설치·갱신·실행 검증을 구분한다.
- 요청 예시와 상세 처리 절차는 관리 문서에만 유지한다. `AGENTS.md`에 스킬별 인벤토리를 복제하지 않는다.

---

## Pi 특이사항

- 저장소의 `adapters/pi/commands/`는 Pi 런타임에서 `~/.pi/agent/prompts/`로 로드된다.
- 공유 명령어 본문은 `~/.pi/agent/commands/`로 심링크되어 Pi wrapper의 `Read` fallback 경로로 사용된다.

## OpenCode 특이사항

- `adapters/opencode/agents/`의 agent 정의는 OpenCode 전용 frontmatter(`mode`, `tools`)를 포함한다. 도구 독립적인 역할 정의는 `resources/roles/`로 추출하는 것을 목표로 하되, 현재는 OpenCode가 include 문법을 지원하지 않아 adapter에 전체 정의를 둔다.
