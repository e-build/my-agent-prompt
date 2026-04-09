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
    expect(parsed.agents.worker.fallback_models).toEqual(["openai/gpt-5.4"])
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
