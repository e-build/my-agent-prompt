# AGENTS.md

## Project Overview

이 저장소는 여러 AI 코딩 에이전트 도구에서 공통으로 활용할 수 있는 프롬프트 설정(commands, agents, skills, refs, opencode-plugins)을 버전 관리하는 저장소임. 특정 도구에 종속되지 않고, 각 도구의 설정 경로에 심링크하거나 복사하여 범용적으로 사용한다.

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `agents/` | standalone 에이전트 정의 (역할, 모델, 도구 권한, 행동 지침) |
| `command/` | standalone 슬래시 커맨드 정의 (`/docs-*` 등) |
| `skills/` | standalone 스킬 디렉토리 |
| `opencode-plugins/` | 설치 가능한 OpenCode plugin 패키지 모음 |
| `refs/` | 에이전트가 참조하는 규칙/가이드라인 문서 |
| `prompt/` | 프로젝트에서 사용하는 프롬프트 템플릿 및 아키텍처 가이드 |

### What Lives Here vs. Local Config

- **이 저장소**: 팀/프로젝트 공유가 필요한 설정, 버전 이력이 필요한 설정, 여러 도구에서 공통으로 참조하는 설정, 재사용 가능한 OpenCode plugin 패키지
- **각 도구의 로컬 설정 디렉토리**: 개인 전용 설정, 특정 도구에만 적용되는 설정 (예: `~/.config/opencode/`, `~/.claude/` 등)

### Compatible Agent Tools

이 저장소의 설정 파일은 아래 CLI 에이전트 도구에서 활용할 수 있음. 각 도구의 설정 경로와 포맷에 맞게 복사/심링크하여 사용함.

| Tool | Docs |
|------|------|
| Claude Code | https://docs.anthropic.com/en/docs/claude-code |
| OpenCode | https://docs.opencode.ai |
| Amp | https://docs.amp.dev |
| Codex CLI | https://github.com/openai/codex |
| Antigravity | https://docs.antigravity.dev |

### OpenCode 글로벌 리소스 심링크 설정

이 저장소의 자원을 OpenCode 글로벌 설정에 매핑하는 전체 목록이다.
심링크 소스 경로는 반드시 **절대 경로**로 지정한다.

#### 리소스 매핑표

| 저장소 경로 | OpenCode 글로벌 경로 | 비고 |
|-------------|---------------------|------|
| `agents/doc-manager.md` | `~/.config/opencode/agents/doc-manager.md` | |
| `agents/skill-creator.md` | `~/.config/opencode/agents/skill-creator.md` | |
| `command/docs-*.md` (6개) | `~/.config/opencode/commands/docs-*.md` | |
| `command/ladder-*.md` (10개) | `~/.config/opencode/commands/ladder-*.md` | |
| `skills/create-command/` | `~/.config/opencode/skills/create-command/` | 디렉토리 단위 심링크 |
| `opencode-plugins/opencode-autoresearch/` | `~/.config/opencode/{commands,agents,skills,plugins}/` | `install-local.sh` 실행 |
| `opencode-plugins/forge-plugin/dist/index.js` | `~/.config/opencode/plugins/forge-plugin.js` | 빌드 후 심링크 |
| `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts` | `~/.config/opencode/plugins/cliproxyapi-sync.ts` | 소스 직접 심링크, 설정은 `~/.config/opencode/cliproxyapi-sync-config.jsonc` |

> 스킬은 단일 파일이 아닌 **디렉토리 단위**로 심링크한다. 디렉토리 안에 `SKILL.md`가 있어야 OpenCode가 인식한다.
> 저장소 루트 `command/`(단수)는 standalone 커맨드 전용이다. `opencode-plugins/` 내부는 OpenCode 패키지 관례에 따라 `commands/`(복수)를 사용한다.

#### 일괄 설정 예시

```bash
REPO=/path/to/my-agent-prompt
OC=~/.config/opencode

# agents
ln -s $REPO/agents/doc-manager.md   $OC/agents/doc-manager.md
ln -s $REPO/agents/skill-creator.md $OC/agents/skill-creator.md

# commands (docs-*)
for f in $REPO/command/docs-*.md; do ln -s "$f" $OC/commands/$(basename "$f"); done

# commands (ladder-*)
for f in $REPO/command/ladder-*.md; do ln -s "$f" $OC/commands/$(basename "$f"); done

# skills
ln -s $REPO/skills/create-command $OC/skills/create-command

# opencode-autoresearch plugin (commands + agents + skills + plugin 자산 일괄)
bash $REPO/opencode-plugins/opencode-autoresearch/install-local.sh

# forge-plugin (빌드 후 plugins 디렉토리에 심링크)
ln -s $REPO/opencode-plugins/forge-plugin/dist/index.js $OC/plugins/forge-plugin.js

# cliproxyapi-sync (소스 직접 심링크, 빌드 불필요)
ln -s $REPO/opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts $OC/plugins/cliproxyapi-sync.ts

# cliproxyapi-sync config
# 첫 실행 시 $OC/cliproxyapi-sync-config.jsonc 가 자동 생성된다.
# baseURL / apiKey 는 provider.cliproxyapi 대신 이 파일에 입력한다.
```

---

## Agent Role

이 저장소에서 에이전트의 역할:

1. **프롬프트 파일 관리** — `agents/`, `command/`, `skills/`, `refs/`, `prompt/`, `opencode-plugins/` 내 파일의 생성, 수정, 검토
2. **마크다운 품질 유지** — YAML frontmatter 유효성, 중첩 코드블록 등 마크다운 렌더링 이슈 검출 및 수정
3. **글로벌 설정 동기화** — 각 도구의 로컬 설정 디렉토리(예: `~/.config/opencode/`, `~/.claude/`)와 이 저장소 간 에이전트/커맨드/스킬/플러그인을 가져오거나 내보내기
4. **아키텍처 가이드 관리** — `prompt/architecture/` 내 아키텍처 문서 작성 및 유지보수

### Out of Scope

- 이 저장소의 파일을 실제 에이전트 런타임에 배포/적용하는 것은 에이전트 범위 밖이다
- 에이전트 정의 파일의 의미적 정확성(프롬프트가 의도대로 동작하는지)은 사용자가 판단한다


---

## Git Commit Rules

### Forbidden Commit Footers

Do NOT include the following in commit messages:

- `Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)`
- `Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>`

Commit messages must contain only the subject line and, when necessary, a descriptive body. No AI attribution footers.
