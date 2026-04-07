import { tool } from "@opencode-ai/plugin"
import fs from "node:fs"
import path from "node:path"

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8")
  } catch {
    return ""
  }
}

function parseEditablePatterns(configText) {
  if (!configText) {
    return []
  }

  const inlineMatch = configText.match(/^[ \t]*editable:[ \t]*\[([^\]]*)\]/m)
  if (inlineMatch) {
    return inlineMatch[1]
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
  }

  const lines = configText.split("\n")
  const startIndex = lines.findIndex((line) => /^[ \t]*editable:[ \t]*$/m.test(line))
  if (startIndex < 0) {
    return []
  }

  const items = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(/^[ \t]*-[ \t]+['"]?(.+?)['"]?[ \t]*$/)
    if (match) {
      items.push(match[1])
      continue
    }

    if (line.trim() && !line.startsWith(" ") && !line.startsWith("\t")) {
      break
    }

    if (line.trim() && !line.trim().startsWith("-")) {
      break
    }
  }

  return items
}

function escapeRegex(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&")
}

function globToRegExp(pattern) {
  return new RegExp(
    `^${escapeRegex(pattern)
      .replace(/\*\*/g, "__DOUBLE_STAR__")
      .replace(/\*/g, "[^/]*")
      .replace(/__DOUBLE_STAR__/g, ".*")}$`,
  )
}

function isPathInScope(directory, filePath, patterns) {
  if (!patterns.length) {
    return true
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(directory, filePath)
  const relativePath = path.relative(directory, absolutePath)
  return patterns.some((pattern) => globToRegExp(pattern).test(relativePath))
}

function readOuterTrigger(configText) {
  const match = configText.match(/^[ \t]*outer_trigger:[ \t]*(\d+)/m)
  return match ? Number.parseInt(match[1], 10) : 10
}

function normalizeCount(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const OpencodeAutoresearch = async ({ client, $, directory }) => {
  const configPath = path.join(directory, "autoresearch.yaml")
  const statePath = path.join(directory, "workspace", "state.json")
  const managedPrefixes = ["workspace/", "scripts/"]
  const managedFiles = new Set(["autoresearch.yaml", "executor.md"])

  function loadConfigText() {
    return readText(configPath)
  }

  function loadState() {
    try {
      return JSON.parse(readText(statePath) || "{}")
    } catch {
      return {}
    }
  }

  async function runAnalyze(directoryPath, args) {
    const analyzeScript = path.join(directoryPath, "scripts", "analyze.py")
    if (!fs.existsSync(analyzeScript)) {
      return "scripts/analyze.py 없음. /lab-init 먼저 실행하세요."
    }

    const result = await $`python scripts/analyze.py ${args}`.cwd(directoryPath)
    return result.stdout || result.stderr || ""
  }

  return {
    tool: {
      lab_status: tool({
        description: "현재 autoresearch 실험 상태를 요약합니다.",
        args: {
          tail: tool.schema.string().optional().describe("최근 N개 실험 수 (기본: 10)"),
        },
        async execute(args, context) {
          const tail = normalizeCount(args.tail, 10)
          return runAnalyze(context.directory, ["--tail", String(tail), "--summary"])
        },
      }),
      lab_analyze: tool({
        description: "autoresearch 실험 전체 분석 또는 outer-loop 분석 JSON을 반환합니다.",
        args: {
          mode: tool.schema
            .string()
            .optional()
            .describe("summary | full | outer (기본: full)"),
        },
        async execute(args, context) {
          const mode = (args.mode || "full").trim()
          if (mode === "summary") {
            return runAnalyze(context.directory, ["--summary"])
          }
          if (mode === "outer") {
            return runAnalyze(context.directory, ["--outer-analysis"])
          }
          return runAnalyze(context.directory, ["--full-report"])
        },
      }),
      lab_state: tool({
        description: "workspace/state.json의 현재 상태를 반환합니다.",
        args: {},
        async execute(_args, context) {
          const filePath = path.join(context.directory, "workspace", "state.json")
          if (!fs.existsSync(filePath)) {
            return "state.json 없음. /lab-init 먼저 실행하세요."
          }
          return readText(filePath)
        },
      }),
      lab_experiments_tail: tool({
        description: "experiments.jsonl에서 최근 N개 항목을 반환합니다.",
        args: {
          n: tool.schema.string().optional().describe("최근 N개 항목 수 (기본: 5)"),
        },
        async execute(args, context) {
          const filePath = path.join(context.directory, "workspace", "experiments.jsonl")
          if (!fs.existsSync(filePath)) {
            return "experiments.jsonl 없음."
          }

          const lines = readText(filePath).split("\n").filter(Boolean)
          const count = normalizeCount(args.n, 5)
          return lines.slice(-count).join("\n")
        },
      }),
    },

    "tool.execute.before": async (input, output) => {
      if (!fs.existsSync(configPath)) {
        return
      }

      if (!["write", "edit"].includes(input.tool)) {
        return
      }

      const filePath = output.args?.filePath
      if (!filePath || typeof filePath !== "string") {
        return
      }

      const relativePath = path.relative(
        directory,
        path.isAbsolute(filePath) ? filePath : path.join(directory, filePath),
      )

      if (
        managedFiles.has(relativePath) ||
        managedPrefixes.some((prefix) => relativePath.startsWith(prefix))
      ) {
        return
      }

      const editablePatterns = parseEditablePatterns(loadConfigText())
      if (isPathInScope(directory, filePath, editablePatterns)) {
        return
      }

      throw new Error(
        `[lab] 범위 밖 파일 수정 차단: ${relativePath}\n허용 패턴: ${editablePatterns.join(", ")}`,
      )
    },

    "experimental.session.compacting": async (_input, output) => {
      if (!fs.existsSync(configPath)) {
        return
      }

      const state = loadState()
      if (!Object.keys(state).length) {
        return
      }

      output.context.push(`## Autoresearch 현재 상태\n- inner_cycle: ${state.inner_cycle ?? 0}\n- outer_cycle: ${state.outer_cycle ?? 0}\n- strategy: ${state.strategy ?? "initial"}\n- trajectory: ${state.trajectory ?? "unknown"}\n- best metrics: ${JSON.stringify(state.best?.metrics ?? {})}\n- tabu_count: ${Array.isArray(state.tabu_list) ? state.tabu_list.length : 0}`)
    },

    "session.idle": async () => {
      if (!fs.existsSync(configPath) || !fs.existsSync(statePath)) {
        return
      }

      const state = loadState()
      const innerCycle = Number(state.inner_cycle ?? 0)
      if (innerCycle <= 0) {
        return
      }

      const outerTrigger = readOuterTrigger(loadConfigText())
      if (innerCycle % outerTrigger !== 0) {
        return
      }

      await client.app.log({
        body: {
          service: "opencode-autoresearch",
          level: "info",
          message: `[lab] inner_cycle=${innerCycle} - outer loop trigger reached. /lab-analyze --update 실행 권장.`,
        },
      })
    },
  }
}

export default OpencodeAutoresearch
