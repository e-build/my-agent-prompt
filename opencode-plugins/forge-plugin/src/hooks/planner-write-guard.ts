import { join, normalize, relative } from "node:path"

function isEditablePlanPath(projectDirectory: string, filePath: string): boolean {
  const absolutePath = filePath.startsWith("/") ? filePath : join(projectDirectory, filePath)
  const relativePath = relative(projectDirectory, normalize(absolutePath))

  return relativePath === ".forge/plans" || relativePath.startsWith(".forge/plans/")
}

export function createPlannerWriteGuard(
  projectDirectory: string,
  sessionAgents: Map<string, string>,
) {
  return async (
    input: {
      tool: string
      sessionID: string
      callID: string
    },
    output: {
      args: {
        filePath?: string
      }
    },
  ) => {
    if (!["write", "edit"].includes(input.tool)) {
      return
    }

    if (sessionAgents.get(input.sessionID) !== "planner") {
      return
    }

    const filePath = output.args?.filePath
    if (!filePath) {
      return
    }

    if (!isEditablePlanPath(projectDirectory, filePath)) {
      throw new Error("Planner may only edit .forge/plans/")
    }
  }
}
