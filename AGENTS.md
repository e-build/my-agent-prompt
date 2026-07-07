# AGENTS.md

## Project Overview

이 저장소는 **OpenAI Codex, Claude Code, OpenCode, Pi** 4개 코딩 에이전트를 중심으로,
공통 프롬프트 자원과 도구별 wrapper/config 자원을 함께 버전 관리하는 저장소임.

핵심 원칙은 아래와 같음.

- **에이전트 스킬(자율 실행)은 `skills/`에 둠**
- **공유 명령어 본문(사용자 `/` 호출)은 `bodies/`에 둠**
- **도구별 진입점(command / prompt template)은 각 도구 디렉토리 하위에 둠**
- **로컬 설정 디렉토리에는 심링크 또는 복사로 배포함**
- **도구별 포맷 차이(frontmatter, 디렉토리 구조)는 wrapper 계층에서 흡수함**

즉, 이 저장소는 단순히 "OpenCode 설정 모음"이 아니라,
**4개 에이전트 중 현재 주력인 Pi / OpenCode를 우선 구현하고,
Claude Code / Codex도 같은 수준의 비교 축에서 관리하는 저장소**임.

---

## Supported Agents

현재 이 저장소에서 명시적으로 관리 대상으로 보는 에이전트는 아래 4개임.

| Agent | 역할 |
|------|------|
| **OpenAI Codex** | 프로젝트/글로벌 instruction 중심 사용 (`AGENTS.md`, 기타 instruction 파일) |
| **Claude Code** | skills / commands / `CLAUDE.md` 계열 구조를 갖는 에이전트 |
| **OpenCode** | `commands/`, `agents/`, `skills/`, plugin 구조를 적극 활용 |
| **Pi** | `prompts`, `skills`, `extensions` 구조를 활용 |

> 이 문서에서는 위 4개만 기준으로 설명함.
> Amp, Antigravity 등은 현재 이 문서의 관리 대상에서 제외함.

---

## Shared Architecture

### Canonical Source vs Tool Wrapper

이 저장소의 구조는 아래 2계층으로 이해하면 됨.

1. **공통 본문 계층**
   - `skills/` — 에이전트가 자율적으로 로드하는 Agent Skills (진단, 검색, 가이드라인 등)
   - `bodies/` — 사용자가 `/` 슬래시 명령어로 호출하는 공유 명령어 본문 (docs, ladder, flip, zz-workflow 계열)
   - 여러 도구에서 재사용 가능한 실행 본문 / 역할 정의 / 워크플로우 저장
   - 가능한 한 여기만 수정하면 되도록 유지

2. **도구별 wrapper 계층**
   - `opencode/commands/`
   - `pi/commands/`
   - 향후 필요 시 `claude/commands/`, `codex/...` 추가 가능
   - 각 도구 포맷에 맞는 frontmatter / 실행 진입점만 담당

### Current Status

| Layer | OpenCode | Pi | Claude Code | Codex |
|------|----------|----|-------------|-------|
| **Shared skills** | 사용함 | 사용함 | 개념적으로 호환 가능 | 직접 skill 로더는 없지만 instruction source로 재사용 가능 |
| **Tool-specific commands** | `opencode/commands/` 구현됨 | `pi/commands/` 구현됨 | 아직 별도 wrapper 디렉토리 없음 | 아직 별도 wrapper 디렉토리 없음 |
| **Tool-specific extensions/plugins** | `opencode-plugins/` 사용 | `pi/extensions/` 사용 | 현재 없음 | 현재 없음 |
| **Primary local target** | `~/.config/opencode/` | `~/.pi/agent/` | `~/.claude/` | Codex 로컬 instruction 경로 |

---

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `agents/` | 공통 에이전트 정의. 주로 OpenCode subagent 자원으로 사용하지만, 다른 도구용 역할 정의의 참고 원문으로도 사용 가능 |
| `bodies/` | **공유 명령어 본문**. 사용자가 `/` 로 호출하는 docs/ladder/flip/zz-workflow 계열 실행 본문. 스킬과 달리 시스템 프롬프트에 노출되지 않음 |
| `skills/` | **Agent Skills** (카테고리별 구성). 에이전트가 자율적으로 로드하는 능력 (진단, 검색, 가이드라인 등). `skills/{shopl,super,tool,dev}/` 4개 카테고리로 분류 |
| `opencode/commands/` | OpenCode 전용 command wrapper |
| `pi/commands/` | Pi 전용 command wrapper |
| `opencode-plugins/` | OpenCode plugin 패키지 및 배포 자원 |
| `pi/extensions/` | Pi 전용 extension 소스 |
| `refs/` | 공통 규칙, 정책, 가이드라인 문서 |
| `prompt/` | 프롬프트 템플릿, 아키텍처 가이드, 설계 문서 |
| `command/` | `opencode/commands/` 로 연결된 하위 호환용 심링크 |

> `pi/commands/` 라는 이름을 저장소에서 사용하지만,
> **실제 Pi 런타임은 이를 `~/.pi/agent/prompts/` 경로에서 로드**함.
> 즉, 저장소의 정보 구조와 Pi 런타임의 실제 로딩 경로 이름은 다를 수 있음.

---

## What Lives Here vs. Local Config

### 이 저장소에 두는 것

- 팀/프로젝트 공유가 필요한 설정
- 버전 이력이 필요한 설정
- 여러 도구에서 공통 참조할 본문 (`skills/`, `refs/`)
- 도구별 wrapper (`opencode/commands/`, `pi/commands/`)
- 배포 가능한 plugin / extension 소스

### 각 도구의 로컬 설정 디렉토리에 두는 것

- 개인 전용 설정
- 토큰/비밀값/머신별 설정
- 특정 사용자만 쓰는 실험성 설정
- 이 저장소에서 심링크/복사해 간 최종 배포본

---

## Tool-by-Tool Mapping

## 1. OpenCode

### Source in Repo

- `opencode/commands/` — OpenCode용 command wrapper
- `agents/` — OpenCode agent/subagent 정의
- `skills/` — OpenCode skills로도 재사용 가능
- `opencode-plugins/` — OpenCode plugin 자산

### Local Target

- `~/.config/opencode/commands/`
- `~/.config/opencode/agents/`
- `~/.config/opencode/skills/`
- `~/.config/opencode/plugins/`

### Current Mapping

| 저장소 경로 | OpenCode 대상 경로 | 비고 |
|-------------|-------------------|------|
| `agents/doc-manager.md` | `~/.config/opencode/agents/doc-manager.md` | |
| `agents/skill-creator.md` | `~/.config/opencode/agents/skill-creator.md` | |
| `opencode/commands/*.md` (19개) | `~/.config/opencode/commands/` | thin wrapper, `!\`cat bodies/<name>.md\`` 로 본문 주입 |
| `skills/shopl/*/` (8개), `skills/super/*/` (4개), `skills/tool/*/` (5개), `skills/dev/*/` (7개) | `~/.config/opencode/skills/{skill}/` | OpenCode에서 재사용하는 Agent Skills (24개, 카테고리별 구성) |
| `opencode-plugins/opencode-autoresearch/` | `~/.config/opencode/{commands,agents,skills,plugins}/` | `install-local.sh` 실행 |
| `opencode-plugins/forge-plugin/dist/index.js` | `~/.config/opencode/plugins/forge-plugin.js` | 빌드 후 심링크 |
| `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts` | `~/.config/opencode/plugins/cliproxyapi-sync.ts` | 설정은 `~/.config/opencode/cliproxyapi-sync-config.jsonc` |

---

## 2. Pi

### Source in Repo

- `pi/commands/` — Pi용 command wrapper
- `skills/` — Pi skills로 재사용
- `pi/extensions/` — Pi extension 소스

### Local Target

- `~/.pi/agent/prompts/`
- `~/.pi/agent/skills/`
- `~/.pi/agent/extensions/`

### Current Mapping

| 저장소 경로 | Pi 대상 경로 | 비고 |
|-------------|-------------|------|
| `pi/commands/*.md` (19개) | `~/.pi/agent/prompts/` | 저장소에서는 `commands/`로 관리하지만 Pi는 `prompts/`로 로드 |
| `bodies/{docs-execute,docs-help,docs-make-book,docs-quiz,docs-review,docs-status,flip-action-plan,flip-think,ladder-compare,ladder-debug-me,ladder-explain,ladder-find-gaps,ladder-quiz-me,ladder-roadmap,ladder-show-code,ladder-summarize,zz-workflow-design-system,zz-workflow-init,zz-workflow-new,doc-manager}.md` | (공유 본문 — 로컬 심링크 없음) | Pi `pi/commands/*.md` wrapper가 `bodies/`를 참조 |
| `skills/shopl/*/` (8개), `skills/super/*/` (4개), `skills/tool/*/` (5개), `skills/dev/*/` (7개) | `~/.pi/agent/skills/{skill}/` | Pi에서 관리하는 Agent Skills (24개, 카테고리별 구성) |
| `pi/extensions/filechanges/` | `~/.pi/agent/extensions/filechanges/` | 심링크 필요 |
| `pi/extensions/cliproxyapi-sync.ts` | `~/.pi/agent/extensions/cliproxyapi-sync.ts` | `bash pi/install.sh --restore`로 설치 |

---

## 3. Claude Code

### Current Position in This Repo

현재 이 저장소는 **Claude Code를 사용 대상에 포함**하지만,
Pi / OpenCode처럼 별도 wrapper 디렉토리를 아직 적극적으로 운영하고 있지는 않음.

Claude Code 관점에서는 아래 자원이 중요함.

- `skills/` — Claude Code skill 형식으로 포팅 가능한 공통 본문
- `refs/`, `prompt/`, `AGENTS.md` — instruction / 참고 문서 원문

### Expected Local Structure

- `~/.claude/skills/<skill-name>/SKILL.md`
- `~/.claude/commands/*.md`
- 프로젝트 단위 `.claude/skills/`, `.claude/commands/`
- 필요 시 `CLAUDE.md`

### Current Status

| 항목 | 상태 |
|------|------|
| 공통 본문 재사용 후보 (`skills/`) | 있음 |
| Claude 전용 wrapper 디렉토리 | 아직 없음 |
| Claude 전용 설치 스크립트 | 아직 없음 |
| 문서상 비교 축 | 포함 |

> 즉, **Claude Code는 현재 이 저장소에서 “관리 대상”이지만,
> Pi / OpenCode처럼 배포 구조가 완성된 상태는 아님**.

---

## 4. OpenAI Codex

### Current Position in This Repo

Codex는 OpenCode / Pi처럼 command wrapper 디렉토리를 중심으로 쓰기보다,
프로젝트 instruction 문서 중심으로 활용하는 비중이 큼.

이 저장소에서 Codex와 직접 맞닿는 자원은 아래와 같음.

- `AGENTS.md` — 프로젝트 규칙 및 구조 설명
- `refs/` — 공통 가이드라인
- `prompt/` — 추가 instruction / architecture 문서
- 일부 `skills/` — 실행 본문 참고 원문으로 재사용 가능

### Expected Local / Runtime Use

- 프로젝트 루트 `AGENTS.md`
- Codex 글로벌 instruction 파일
- 필요 시 추가 markdown instruction 파일

### Current Status

| 항목 | 상태 |
|------|------|
| Codex 전용 wrapper 디렉토리 | 아직 없음 |
| Codex 전용 설치 스크립트 | 아직 없음 |
| 프로젝트 instruction source | `AGENTS.md` 중심으로 사용 |
| 공통 본문 참고 source | `skills/`, `refs/`, `prompt/` |

> 즉, **Codex는 현재 wrapper 기반보다는 instruction 기반 통합 대상**으로 관리함.

---

## Shared Architecture by Resource Type

### Agent Skills (`skills/`)
에이전트가 **자율적으로 판단하여 로드**하는 능력. 시스템 프롬프트에 skills 목록으로 노출됨.

- `skills/<category>/<name>/SKILL.md` = **단일 진실 공급원** (Agent Skills spec 준수). `shopl/`, `super/`, `tool/`, `dev/` 4개 카테고리로 분류
- `opencode/commands/<name>.md` = OpenCode wrapper (필요 시만)
- `pi/commands/<name>.md` = Pi wrapper (필요 시만)
- Claude Code / Codex는 `skills/<category>/<name>/SKILL.md` 를 직접 참조

### Shared Command Bodies (`bodies/`)
사용자가 **`/` 슬래시 명령어로 직접 호출**하는 공유 실행 본문. 시스템 프롬프트에 노출되지 않음.

- `bodies/<name>.md` = **단일 진실 공급원** (평문 markdown, Agent Skills frontmatter 없음)
- `opencode/commands/<name>.md` = OpenCode wrapper, `!\`cat bodies/<name>.md\`` 로 본문 주입
- `pi/commands/<name>.md` = Pi wrapper, `Read \`bodies/<name>.md\`` 로 본문 참조

### Wrapper Rules

- wrapper에는 **도구별 frontmatter와 진입점만 둠**
- 실행 로직 본문은 가능하면 `bodies/` 또는 `skills/`로 이동
- 새 Agent Skills 추가 시:
  1. `skills/<category>/`에 공통 본문 작성 (적합한 카테고리: `shopl/`, `super/`, `tool/`, `dev/`)
  2. 필요 시 OpenCode / Pi wrapper 생성
- 새 Command Body 추가 시:
  1. `bodies/`에 공통 본문 작성
  2. OpenCode / Pi wrapper 생성

---

## Batch Setup Examples

아래는 **현재 실제로 구현된 Pi / OpenCode 배포 예시**임.
Claude Code / Codex는 현재 별도 자동 배포 스크립트 없음.

```bash
REPO=/path/to/my-agent-prompt
OC=~/.config/opencode
PIP=~/.pi/agent

# -------------------------------------------------------------------
# 1. OpenCode agents
# -------------------------------------------------------------------
ln -s $REPO/agents/doc-manager.md   $OC/agents/doc-manager.md
ln -s $REPO/agents/skill-creator.md $OC/agents/skill-creator.md

# -------------------------------------------------------------------
# 2. OpenCode commands
# -------------------------------------------------------------------
for f in "$REPO/opencode/commands/"*.md; do
  ln -s "$f" $OC/commands/$(basename "$f")
done

# -------------------------------------------------------------------
# 3. Pi commands (Pi는 prompts 경로로 로드)
# -------------------------------------------------------------------
for f in "$REPO/pi/commands/"*.md; do
  ln -s "$f" $PIP/prompts/$(basename "$f")
done

# -------------------------------------------------------------------
# 4. Shared skills → OpenCode / Pi (카테고리별 구조에서 개별 스킬 추출)
# -------------------------------------------------------------------
for d in $(find "$REPO/skills" -name SKILL.md -exec dirname {} \;); do
  ln -sfn "$d" $OC/skills/$(basename "$d")
  ln -sfn "$d" $PIP/skills/$(basename "$d")
done

# -------------------------------------------------------------------
# 5. Shared command bodies (bodies/) — wrapper가 직접 참조, 로컬 심링크 불필요
#    OpenCode wrapper: !\`cat $REPO/bodies/<name>.md\`
#    Pi wrapper:       Read \`$REPO/bodies/<name>.md\`
# -------------------------------------------------------------------

# -------------------------------------------------------------------
# 6. OpenCode plugins
# -------------------------------------------------------------------
bash $REPO/opencode-plugins/opencode-autoresearch/install-local.sh
ln -s $REPO/opencode-plugins/forge-plugin/dist/index.js $OC/plugins/forge-plugin.js
ln -s $REPO/opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts $OC/plugins/cliproxyapi-sync.ts

# -------------------------------------------------------------------
# 7. Pi extensions
# -------------------------------------------------------------------
bash $REPO/pi/install.sh --restore
```

---

## Agent Role

이 저장소에서 에이전트의 역할:

1. **프롬프트 자원 관리**
   - `agents/`, `bodies/`, `skills/`, `opencode/commands/`, `pi/commands/`, `refs/`, `prompt/`, `opencode-plugins/`, `pi/extensions/` 관리

2. **공통 본문과 wrapper 분리 유지**
   - 실행 본문은 `bodies/` (명령어 본문) 또는 `skills/` (Agent Skills)
   - 도구별 포맷 차이는 wrapper에서 해결

3. **문서 품질 유지**
   - YAML frontmatter 유효성
   - Markdown 구조, 가독성, 목차, 파일명 일관성 유지

4. **도구별 로컬 설정과 저장소 간 동기화**
   - Pi / OpenCode 현재 운영 대상
   - Claude Code / Codex는 문서 구조상 같은 수준에서 관리하되, 자동 배포 구조는 점진적으로 확장

5. **아키텍처 가이드 유지보수**
   - `prompt/architecture/` 문서 관리
   - `AGENTS.md` 구조를 실제 운영 구조와 맞춤

### Out of Scope

- 이 저장소의 파일을 실제 에이전트 런타임에 자동 배포/적용하는 것 자체는 범위 밖
- 각 에이전트 정의 파일의 의미적 품질과 실제 프롬프트 성능은 사용자가 최종 판단

---

## Git Commit Rules

### Forbidden Commit Footers

Do NOT include the following in commit messages:

- `Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)`
- `Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>`

Commit messages must contain only the subject line and, when necessary, a descriptive body. No AI attribution footers.
