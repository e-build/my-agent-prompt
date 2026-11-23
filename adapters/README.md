# Adapters

도구별 adapter — 각 도구의 frontmatter, 호출 문법, 경로 차이만 담당한다.
실행 본문은 `resources/`의 정본을 참조하며, adapter에 본문을 복사하지 않는다.

## 지원 현황

| 도구 | Commands | Agents | 비고 |
|------|----------|--------|------|
| **Pi** | ✅ `adapters/pi/commands/` | — | `Read resources/commands/<name>.md` 참조 |
| **OpenCode** | ✅ `adapters/opencode/commands/` | ✅ `adapters/opencode/agents/` | `!`cat resources/commands/<name>.md`` 주입 |
| **Claude Code** | ✅ `adapters/claude/commands/` | — | `/my-agent-prompt:<name>`으로 호출. `~/.agents/commands/<name>.md` 참조 |
| **Codex** | ✅ `adapters/codex/skills/` | — | custom prompt 폐기로 명시 호출 전용 스킬. `$<name>`으로 호출 |

## Adapter 작성 규칙

1. **frontmatter + 정본 참조 한 줄만** — 도구가 요구하는 최소 메타데이터와 정본 경로만 둔다.
2. **본문을 복사하지 않는다** — 정본은 항상 `resources/commands/<name>.md` (또는 `resources/skills/`).
3. **필요한 도구만 만든다** — 모든 자원에 4개 wrapper를 강제하지 않는다.
4. **도구 특화 보정만 허용** — 도구 간 동작 차이를 흡수하는 짧은 지침은 adapter에 둘 수 있다.

## Pi adapter 패턴

```markdown
---
description: <명령 설명>
---

Read `resources/commands/<name>.md` in this repo and follow its instructions exactly.
```

## OpenCode adapter 패턴

```markdown
---
description: <명령 설명>
tools:
  read: true
---

!\`cat resources/commands/<name>.md\`
```

## Claude Code adapter 패턴

```markdown
---
description: <명령 설명>
---

Read `~/.agents/commands/<name>.md` and follow its instructions exactly.

Input: $ARGUMENTS
```

`install-claude`가 `resources/commands/`·`resources/templates/`를 `~/.agents/` 아래로, 이 디렉터리 전체를 `~/.claude/commands/my-agent-prompt/`로 링크한다.

## Codex adapter 패턴

`adapters/codex/skills/<name>/`에 두 파일을 둔다. `install-codex`가 디렉터리를 `~/.agents/skills/<name>`으로 링크한다.

```markdown
---
name: <name>
description: <명령 설명>
disable-model-invocation: true
---

Read `~/.agents/commands/<name>.md` and follow its instructions exactly. Treat the rest of the user's message as the command input.
```

```yaml
# agents/openai.yaml — Codex가 스스로 호출하지 않도록 막음
policy:
  allow_implicit_invocation: false
```
