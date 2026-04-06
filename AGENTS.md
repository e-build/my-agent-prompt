# AGENTS.md

## Project Overview

이 저장소는 Claude 에이전트 프롬프트 설정을 버전 관리하는 저장소임.

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `agents/` | 에이전트 정의 (역할, 모델, 도구 권한, 행동 지침) |
| `command/` | 슬래시 커맨드 정의 (`/docs-*` 등) |
| `refs/` | 에이전트가 참조하는 규칙/가이드라인 문서 |
| `prompt/` | 프로젝트에서 사용하는 프롬프트 템플릿 및 아키텍처 가이드 |

### What Lives Here vs. Global Config

- **이 저장소**: 팀/프로젝트 공유가 필요한 설정, 버전 이력이 필요한 설정
- **`~/.config/Claude/`**: 개인 로컬 전용 설정 (GSD 워크플로우 등)
- **`~/.config/opencode/`**: OpenCode 글로벌 설정. `commands/`에 심링크로 이 저장소의 커맨드를 연결함

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

`command/` 디렉토리의 커맨드 파일을 OpenCode 글로벌 커맨드로 등록하려면,
`~/.config/opencode/commands/`에 심링크를 생성한다.

```bash
# 예시: ladder-explain 커맨드 등록
ln -s /path/to/my-agent-prompt/command/ladder-explain.md ~/.config/opencode/commands/ladder-explain.md
```

현재 등록된 커맨드 패밀리:

| Prefix | 설명 |
|--------|------|
| `docs-*` | 문서 관리 워크플로우 |
| `ladder-*` | 제1원리 기반 학습 도구 세트 |

심링크 일괄 등록 예시 (신규 커맨드 추가 시):
```bash
cd ~/.config/opencode/commands
ln -s /path/to/my-agent-prompt/command/<new-command>.md <new-command>.md
```

> **주의**: 심링크 소스 경로는 절대 경로로 지정해야 한다.

### OpenCode 글로벌 에이전트 연결 방법

`agents/` 디렉토리의 에이전트 파일을 OpenCode 글로벌 에이전트로 등록하려면,
`~/.config/opencode/agents/`에 심링크를 생성한다.

```bash
# 예시: doc-manager 에이전트 등록
ln -s /path/to/my-agent-prompt/agents/doc-manager.md ~/.config/opencode/agents/doc-manager.md
```

현재 등록된 에이전트:

| 에이전트 | 설명 |
|----------|------|
| `doc-manager` | 문서 관리 전용 에이전트 (`docs-*` 커맨드와 연동) |
| `skill-creator` | Skill 파일 작성 전문 에이전트 |

### OpenCode 글로벌 스킬 연결 방법

`skills/` 디렉토리(있을 경우)의 스킬 파일을 OpenCode 글로벌 스킬로 등록하려면,
`~/.config/opencode/skills/`에 심링크를 생성한다.

```bash
# 예시: 스킬 디렉토리 등록
ln -s /path/to/my-agent-prompt/skills/<skill-name> ~/.config/opencode/skills/<skill-name>
```

> **참고**: 스킬은 단일 `.md` 파일이 아닌 디렉토리 단위로 관리된다. 디렉토리 안에 `SKILL.md`가 있어야 OpenCode가 인식한다.

---

## Agent Role

이 저장소에서 에이전트의 역할:

1. **프롬프트 파일 관리** — `agents/`, `command/`, `refs/`, `prompt/` 내 마크다운 파일의 생성, 수정, 검토
2. **마크다운 품질 유지** — YAML frontmatter 유효성, 중첩 코드블록 등 마크다운 렌더링 이슈 검출 및 수정
3. **글로벌 설정 동기화** — `~/.config/Claude/`의 에이전트/커맨드/레퍼런스를 이 저장소로 가져오거나 내보내기
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
