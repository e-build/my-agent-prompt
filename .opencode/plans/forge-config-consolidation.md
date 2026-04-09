# Forge Plugin Config Consolidation

## Goal
플러그인 설정 스키마를 재설계하여 사용자 설정 파일 하나(`forge-config.jsonc`)에 온전한 모델 조합이 처음부터 들어가도록 변경.

## Changes

### 1. `src/config/bootstrap.ts`
**Before:** static string template with comments (no actual model values)
**After:** dynamic generation from `DEFAULT_AGENT_MODELS`

```typescript
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { DEFAULT_AGENT_MODELS } from "../kernel/agent-model-resolver"

function generateDefaultUserConfig(): string {
  const agents = Object.fromEntries(
    Object.entries(DEFAULT_AGENT_MODELS).map(([name, model]) => [name, { model }]),
  )
  return `${JSON.stringify({ disable_builtin_agents: true, agents }, null, 2)}\n`
}

export async function ensureUserConfigBootstrap(userPath: string): Promise<void> {
  try {
    await writeFile(userPath, generateDefaultUserConfig(), {
      encoding: "utf8",
      flag: "wx",
    })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code

    if (code === "ENOENT") {
      await mkdir(dirname(userPath), { recursive: true })
      await ensureUserConfigBootstrap(userPath)
      return
    }

    if (code === "EEXIST") {
      return
    }

    throw error
  }
}
```

### 2. `src/config/bootstrap.test.ts`
- Remove assertion for comment text `"forge-config.jsonc"`
- Add assertions for actual agent model keys being present
- Keep `disable_builtin_agents` assertion

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { ensureUserConfigBootstrap } from "./bootstrap"

describe("ensureUserConfigBootstrap", () => {
  let tempDir = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "forge-bootstrap-"))
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  test("creates forge-config.jsonc with complete model assignments", async () => {
    const userPath = join(tempDir, ".config", "opencode", "forge-config.jsonc")

    await ensureUserConfigBootstrap(userPath)

    const content = await readFile(userPath, "utf8")
    const parsed = JSON.parse(content)

    expect(parsed.disable_builtin_agents).toBe(true)
    expect(parsed.agents).toBeDefined()
    expect(parsed.agents.pilot).toBeDefined()
    expect(parsed.agents.pilot.model).toBeTruthy()
    expect(parsed.agents.worker).toBeDefined()
    expect(parsed.agents.worker.model).toBeTruthy()
  })

  test("does not overwrite existing forge-config.jsonc", async () => {
    const userPath = join(tempDir, ".config", "opencode", "forge-config.jsonc")
    const original = '{\n  "disable_builtin_agents": true\n}\n'

    await mkdir(dirname(userPath), { recursive: true })
    await writeFile(userPath, original, "utf8")
    await ensureUserConfigBootstrap(userPath)

    expect(await readFile(userPath, "utf8")).toBe(original)
  })
})
```

### 3. `~/.config/opencode/forge-config.jsonc` — Overwrite with merged config
Replace current content (comments-only template) with complete config using user's actual model choices:

```json
{
  "disable_builtin_agents": true,
  "agents": {
    "pilot": { "model": "cp-openai/gpt-5.4" },
    "planner": { "model": "cp-openai/gpt-5.4" },
    "architect": { "model": "cp-openai/gpt-5.4" },
    "worker": { "model": "cp-github-copilot/claude-sonnet-4.6" },
    "scouter": { "model": "cp-github-copilot/claude-haiku-4.5" }
  }
}
```

### 4. `~/.config/opencode/forge.jsonc` — Delete
This file was never read by the plugin (loader only reads `forge-config.jsonc`).

### 5. No changes needed
- `schema.ts` — already supports all fields
- `loader.ts` — already reads `forge-config.jsonc`
- `agent-model-resolver.ts` — `DEFAULT_AGENT_MODELS` serves as bootstrap source
- `loader.test.ts`, `schema.test.ts` — unaffected
