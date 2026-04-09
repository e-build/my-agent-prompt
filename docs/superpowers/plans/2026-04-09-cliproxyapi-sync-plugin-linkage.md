# cliproxyapi-sync Plugin Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cliproxyapi-sync`를 `~/.config/opencode/opencode.json` 직접 등록 대신 `~/.config/opencode/plugins/` 심링크로 로드되도록 전환하고, 저장소 문서를 그 방식에 맞게 정리한다.

**Architecture:** 저장소 문서는 `cliproxyapi-sync`를 빌드 후 `plugins` 디렉토리에 심링크하는 패턴으로 통일한다. 로컬 OpenCode 설정에서는 `plugin` 배열의 절대 경로를 제거하고, `~/.config/opencode/plugins/cliproxyapi-sync.js`가 저장소의 `dist/index.js`를 가리키도록 연결한다.

**Tech Stack:** Markdown, JSON, zsh, Bun build output (`dist/index.js`), OpenCode local config under `~/.config/opencode`

---

## File Map

- Modify: `AGENTS.md`
- Modify: `opencode-plugins/README.md`
- Create: `opencode-plugins/cliproxyapi-sync/README.md`
- Modify: `/Users/donggeollee/.config/opencode/opencode.json`
- Create/update symlink: `/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.js`

## Constraints

- `install-local.sh`는 추가하지 않는다.
- `cliproxyapi-sync` 플러그인 코드와 빌드 설정은 변경하지 않는다.
- 사용자가 커밋을 요청하지 않았으므로 git commit 단계는 수행하지 않는다.

---

### Task 1: Add package-level README for manual build and symlink setup

**Files:**
- Create: `opencode-plugins/cliproxyapi-sync/README.md`

- [ ] **Step 1: Create the package README with the exact local setup flow**

```markdown
# cliproxyapi-sync

OpenCode plugin that syncs `cp-*` providers from a cliproxyapi endpoint into the local OpenCode config.

## Local setup

Build the plugin bundle first.

```bash
bun run build
```

Then link the built plugin into the global OpenCode plugins directory.

```bash
ln -sfn "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/dist/index.js" "/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.js"
```

If `~/.config/opencode/opencode.json` still contains the plugin bundle path in its `plugin` array, remove that entry so the plugin is managed from `~/.config/opencode/plugins/` instead.
```

- [ ] **Step 2: Read the new README and verify the expected commands are present**

Run: `rg -n "bun run build|cliproxyapi-sync.js|plugin array" "opencode-plugins/cliproxyapi-sync/README.md"`
Expected: three matches that confirm the build command, symlink path, and cleanup note are documented.

---

### Task 2: Update shared plugin registry documentation to prefer plugins-directory linkage

**Files:**
- Modify: `opencode-plugins/README.md`

- [ ] **Step 1: Update the package table to link the package README**

Replace the `cliproxyapi-sync` row with this exact row:

```markdown
| `cliproxyapi-sync` | CLI Proxy API 모델 프로바이더 자동 동기화 (실험적) | [README](./cliproxyapi-sync/README.md) |
```

- [ ] **Step 2: Reword the direct-registration guidance so local development prefers the plugins directory**

Replace the `패턴 3 — opencode.json 직접 등록` section with this exact text:

```markdown
**패턴 3 — `opencode.json` 직접 등록 (예외적 사용)**

원격 플러그인이나 `plugins/` 디렉토리 심링크를 사용할 수 없는 경우에만 `plugin` 배열에 직접 등록한다. 로컬에서 개발 중인 플러그인은 가능하면 빌드 산출물을 `~/.config/opencode/plugins/`에 심링크하는 방식을 우선 사용한다.

```json
{
  "plugin": ["/absolute/path/to/dist/index.js"]
}
```
```

- [ ] **Step 3: Verify the registry document now points `cliproxyapi-sync` readers to the package README**

Run: `rg -n "cliproxyapi-sync|예외적 사용|plugins/" "opencode-plugins/README.md"`
Expected: matches for the linked table row and the reworded guidance section.

---

### Task 3: Update root repository setup docs to include the cliproxyapi-sync symlink

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the cliproxyapi-sync resource mapping row**

Insert this exact row into the OpenCode resource mapping table:

```markdown
| `opencode-plugins/cliproxyapi-sync/dist/index.js` | `~/.config/opencode/plugins/cliproxyapi-sync.js` | 빌드 후 심링크 |
```

- [ ] **Step 2: Add the matching example command in the batch setup example**

Append this exact command after the existing `forge-plugin` example:

```bash
# cliproxyapi-sync (빌드 후 plugins 디렉토리에 심링크)
ln -sfn $REPO/opencode-plugins/cliproxyapi-sync/dist/index.js $OC/plugins/cliproxyapi-sync.js
```

- [ ] **Step 3: Verify the root guide now documents the same linkage pattern as the package README**

Run: `rg -n "cliproxyapi-sync|plugins/cliproxyapi-sync.js" "AGENTS.md"`
Expected: one table-row match and one command-example match.

---

### Task 4: Remove the direct plugin entry from local OpenCode config

**Files:**
- Modify: `/Users/donggeollee/.config/opencode/opencode.json`

- [ ] **Step 1: Remove the cliproxyapi-sync bundle path from the plugin array**

Update the `plugin` array to this exact content:

```json
"plugin": [
  "@franlol/opencode-md-table-formatter@0.0.3",
  "@tarquinen/opencode-dcp@latest",
  "superpowers@git+https://github.com/obra/superpowers.git"
]
```

- [ ] **Step 2: Verify the local config no longer references the bundle path directly**

Run: `rg -n "cliproxyapi-sync|dist/index.js" "/Users/donggeollee/.config/opencode/opencode.json"`
Expected: no output.

---

### Task 5: Create the plugins-directory symlink and verify the final state

**Files:**
- Create/update symlink: `/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.js`

- [ ] **Step 1: Confirm the parent plugins directory exists before linking**

Run: `ls "/Users/donggeollee/.config/opencode/plugins"`
Expected: directory listing succeeds.

- [ ] **Step 2: Create or refresh the symlink to the built bundle**

Run:

```bash
ln -sfn "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/dist/index.js" "/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.js"
```

Expected: command exits successfully with no output.

- [ ] **Step 3: Verify the symlink target is correct**

Run: `readlink "/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.js"`
Expected: `/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/dist/index.js`

- [ ] **Step 4: Verify the repository docs and local config all reflect the same operating model**

Run:

```bash
rg -n "cliproxyapi-sync" \
  "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/AGENTS.md" \
  "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/README.md" \
  "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/README.md"
```

Expected: all three files mention the package and the package README path is discoverable from the shared docs.

---

## Self-Review Checklist

- Spec coverage: the plan covers package docs, shared docs, local config cleanup, symlink creation, and verification.
- Placeholder scan: no `TBD`, `TODO`, or vague “appropriate handling” language remains.
- Consistency: every path uses the same bundle target, symlink name, and local config file.
