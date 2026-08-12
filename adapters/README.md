# Adapters

도구별 adapter — 각 도구의 frontmatter, 호출 문법, 경로 차이만 담당한다.
실행 본문은 `resources/`의 정본을 참조하며, adapter에 본문을 복사하지 않는다.

## 지원 현황

| 도구 | Commands | Agents | 비고 |
|------|----------|--------|------|
| **Pi** | ✅ `adapters/pi/commands/` | — | `Read resources/commands/<name>.md` 참조 |
| **OpenCode** | ✅ `adapters/opencode/commands/` | ✅ `adapters/opencode/agents/` | `!`cat resources/commands/<name>.md`` 주입 |
| **Claude Code** | 🔲 `adapters/claude/commands/` | — | 구조만 준비됨 (adapter 미구현) |
| **Codex** | 🔲 `adapters/codex/commands/` | — | 구조만 준비됨 (adapter 미구현) |

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
