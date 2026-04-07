---
name: sync-global
description: >-
  이 저장소(my-agent-prompt)의 자원을 OpenCode 글로벌 설정에 심링크로 등록합니다.
  새 커맨드, 에이전트, 스킬을 추가한 후 "글로벌 등록", "opencode에 등록", "sync global",
  "등록해줘" 등을 요청할 때 사용합니다. 누락된 심링크만 선택적으로 생성합니다.
---

# sync-global

이 저장소의 자원(commands, agents, skills)을 `~/.config/opencode/` 에 심링크로 등록합니다.
이미 등록된 자원은 건너뛰고, 누락된 것만 추가합니다.

---

## 규칙

- 심링크 소스 경로는 반드시 **절대 경로**를 사용한다.
- 이미 심링크가 존재하면 덮어쓰지 않는다 (멱등성 보장).
- 깨진 심링크(dangling symlink)가 발견되면 사용자에게 보고하고 재생성 여부를 묻는다.
- `opencode-plugins/`는 이 스킬 범위 밖이다. `install-local.sh`로 별도 처리한다.

---

## Phase 1 — 경로 상수 확인

아래 두 경로를 확인한다. 존재하지 않으면 생성한다.

```
REPO=/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt
OC=~/.config/opencode
```

검증:
```bash
ls "$REPO/command/" "$REPO/agents/" "$REPO/skills/"
ls "$OC/commands/" "$OC/agents/" "$OC/skills/"
```

---

## Phase 2 — commands 동기화

`$REPO/command/*.md` 파일 목록을 읽고, `$OC/commands/` 에 심링크가 없는 것을 등록한다.

```bash
REPO=/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt
OC=~/.config/opencode

for f in "$REPO/command/"*.md; do
  name=$(basename "$f")
  target="$OC/commands/$name"
  if [ -L "$target" ]; then
    echo "SKIP (already linked): $name"
  elif [ -e "$target" ]; then
    echo "WARN (non-symlink exists): $name — 수동 확인 필요"
  else
    ln -s "$f" "$target" && echo "LINKED: $name"
  fi
done
```

---

## Phase 3 — agents 동기화

`$REPO/agents/*.md` 파일 목록을 읽고, `$OC/agents/` 에 심링크가 없는 것을 등록한다.

```bash
REPO=/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt
OC=~/.config/opencode

for f in "$REPO/agents/"*.md; do
  name=$(basename "$f")
  target="$OC/agents/$name"
  if [ -L "$target" ]; then
    echo "SKIP (already linked): $name"
  elif [ -e "$target" ]; then
    echo "WARN (non-symlink exists): $name — 수동 확인 필요"
  else
    ln -s "$f" "$target" && echo "LINKED: $name"
  fi
done
```

---

## Phase 4 — skills 동기화

`$REPO/skills/` 하위의 **디렉토리**를 읽고, `$OC/skills/` 에 심링크가 없는 것을 등록한다.
스킬은 파일이 아닌 **디렉토리 단위**로 심링크한다.

```bash
REPO=/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt
OC=~/.config/opencode

for d in "$REPO/skills"/*/; do
  name=$(basename "$d")
  target="$OC/skills/$name"
  if [ -L "$target" ]; then
    echo "SKIP (already linked): $name"
  elif [ -e "$target" ]; then
    echo "WARN (non-symlink exists): $name — 수동 확인 필요"
  else
    ln -s "$d" "$target" && echo "LINKED: $name"
  fi
done
```

---

## Phase 5 — 결과 보고

등록 결과를 아래 형식으로 보고한다:

```
## 동기화 결과

### commands
- LINKED: flip-think.md
- SKIP: ladder-explain.md (already linked)
...

### agents
- SKIP: doc-manager.md (already linked)
...

### skills
- LINKED: sync-global
...

### 주의 필요
- WARN: ... (있는 경우만 표시)
```

깨진 심링크가 있으면:
- 항목 목록을 보여준다
- "재생성할까요?" 를 묻는다
- 승인 시 `rm` 후 재생성한다
