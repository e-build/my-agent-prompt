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

### Compatible Agent Tools

이 저장소의 설정 파일은 아래 CLI 에이전트 도구에서 활용할 수 있음. 각 도구의 설정 경로와 포맷에 맞게 복사/심링크하여 사용함.

| Tool | Docs |
|------|------|
| Claude Code | https://docs.anthropic.com/en/docs/claude-code |
| OpenCode | https://docs.opencode.ai |
| Amp | https://docs.amp.dev |
| Codex CLI | https://github.com/openai/codex |
| Antigravity | https://docs.antigravity.dev |

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
