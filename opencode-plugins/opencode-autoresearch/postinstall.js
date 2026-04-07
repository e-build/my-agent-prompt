import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const configRoot = path.join(os.homedir(), ".config", "opencode")

const installs = [
  {
    source: path.join(packageRoot, "commands", "lab-init.md"),
    target: path.join(configRoot, "commands", "lab-init.md"),
  },
  {
    source: path.join(packageRoot, "commands", "lab-run.md"),
    target: path.join(configRoot, "commands", "lab-run.md"),
  },
  {
    source: path.join(packageRoot, "commands", "lab-status.md"),
    target: path.join(configRoot, "commands", "lab-status.md"),
  },
  {
    source: path.join(packageRoot, "commands", "lab-analyze.md"),
    target: path.join(configRoot, "commands", "lab-analyze.md"),
  },
  {
    source: path.join(packageRoot, "agents", "lab-orchestrator.md"),
    target: path.join(configRoot, "agents", "lab-orchestrator.md"),
  },
  {
    source: path.join(packageRoot, "skills", "autoresearch"),
    target: path.join(configRoot, "skills", "autoresearch"),
  },
]

let installedCount = 0
let skippedCount = 0

for (const item of installs) {
  if (!fs.existsSync(item.source)) {
    skippedCount += 1
    console.warn(`[opencode-autoresearch] skip missing source: ${item.source}`)
    continue
  }

  fs.mkdirSync(path.dirname(item.target), { recursive: true })

  try {
    fs.cpSync(item.source, item.target, { recursive: true, force: true })
    installedCount += 1
    console.log(`[opencode-autoresearch] installed: ${item.target}`)
  } catch (error) {
    skippedCount += 1
    console.warn(`[opencode-autoresearch] failed: ${item.target} (${error.message})`)
  }
}

console.log("[opencode-autoresearch] install complete")
console.log(`[opencode-autoresearch] installed=${installedCount} skipped=${skippedCount}`)
console.log("[opencode-autoresearch] available commands: /lab-init, /lab-run, /lab-status, /lab-analyze")
