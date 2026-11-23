import { spawn } from "node:child_process";
import type { ExecWithInput } from "./plannotator-channel.ts";

/** `pi.exec` has no stdin, so CLI channels run through this shell-free spawn with a 10s timeout. */
export const spawnExec: ExecWithInput = (command, args, input) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    // A missing or early-exiting command closes stdin; EPIPE must not crash the Pi process.
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
