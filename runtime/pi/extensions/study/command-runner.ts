import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type CommandResult = { code: number; stdout: string; stderr: string };
export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<CommandResult>;

/** Shared Pi adapter for preflight and lab verification. */
export function createCommandRunner(pi: Pick<ExtensionAPI, "exec">): CommandRunner {
  return async (command, args, cwd) => {
    const result = await pi.exec(command, args, { cwd });
    return { code: result.code ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}
