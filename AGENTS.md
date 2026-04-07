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

### OpenCode 글로벌 커맨드 연결 방법

`command/` 디렉토리의 standalone 커맨드 파일을 OpenCode 글로벌 커맨드로 등록하려면,
`~/.config/opencode/commands/`에 심링크를 생성한다.

> **참고**: 저장소 루트는 `command/`를 사용하지만, `opencode-plugins/` 내부 패키지는 OpenCode 패키지 관례에 맞춰 `commands/`를 사용한다.

```bash
# 예시: ladder-explain 커맨드 등록
ln -s /path/to/my-agent-prompt/command/ladder-explain.md ~/.config/opencode/commands/ladder-explain.md
```

현재 등록된 커맨드 패밀리:

| Prefix | 설명 |
|--------|------|
| `docs-*` | 문서 관리 워크플로우 |
| `ladder-*` | 제1원리 기반 학습 도구 세트 |

심링크 수동 등록 예시 (신규 standalone 커맨드 추가 시):
```bash
cd ~/.config/opencode/commands
ln -s /path/to/my-agent-prompt/command/<new-command>.md <new-command>.md
```

> **주의**: 심링크 소스 경로는 절대 경로로 지정해야 한다.

### OpenCode Plugin Package 연결 방법

`opencode-plugins/` 아래 각 디렉토리는 배포 가능한 OpenCode plugin 패키지다. 패키지는 `index.js`와 함께 필요한 `commands/`, `agents/`, `skills/` 자산을 함께 포함할 수 있다.

현재 포함된 패키지:

| Package | 설명 | 로컬 설치 |
|---------|------|-----------|
| `opencode-autoresearch` | `lab-*` Bilevel Autoresearch 최적화 루프 | `bash /path/to/my-agent-prompt/opencode-plugins/opencode-autoresearch/install-local.sh` |

로컬 설치 스크립트는 `~/.config/opencode/{commands,agents,skills,plugins}`에 필요한 심링크를 한 번에 만든다.
제거: `bash /path/to/my-agent-prompt/opencode-plugins/opencode-autoresearch/install-local.sh --uninstall`

npm 또는 패키지 매니저로 배포하는 경우에는 각 패키지의 `postinstall.js`가 markdown 자산 설치를 담당한다.

`lab-*` 워크플로우를 바로 검증하려면:

```bash
bash /path/to/my-agent-prompt/opencode-plugins/opencode-autoresearch/install-local.sh
```

이후 현재 프로젝트에서 `/lab-init` 후 `/lab-run` 순서로 사용한다.

### OpenCode 글로벌 에이전트 연결 방법

`agents/` 디렉토리의 에이전트 파일을 OpenCode 글로벌 에이전트로 등록하려면,
`~/.config/opencode/agents/`에 심링크를 생성한다.

```bash
# 예시: doc-manager 에이전트 등록
ln -s /path/to/my-agent-prompt/agents/doc-manager.md ~/.config/opencode/agents/doc-manager.md
```

현재 포함된 standalone 에이전트:

| 에이전트 | 설명 |
|----------|------|
| `doc-manager` | 문서 관리 전용 에이전트 (`docs-*` 커맨드와 연동) |
| `skill-creator` | Skill 파일 작성 전문 에이전트 |

plugin 설치로 추가되는 에이전트 예시:

| 에이전트 | 설명 |
|----------|------|
| `lab-orchestrator` | `opencode-autoresearch` 패키지가 설치하는 Bilevel Autoresearch 오케스트레이터 (`lab-*` 커맨드와 연동) |

### OpenCode 글로벌 스킬 연결 방법

`skills/` 디렉토리(있을 경우)의 standalone 스킬 파일을 OpenCode 글로벌 스킬로 등록하려면,
`~/.config/opencode/skills/`에 심링크를 생성한다.

```bash
# 예시: 스킬 디렉토리 등록
ln -s /path/to/my-agent-prompt/skills/<skill-name> ~/.config/opencode/skills/<skill-name>
```

> **참고**: 스킬은 단일 `.md` 파일이 아닌 디렉토리 단위로 관리된다. 디렉토리 안에 `SKILL.md`가 있어야 OpenCode가 인식한다. plugin 패키지에 포함된 스킬도 동일한 방식으로 설치된다.

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
