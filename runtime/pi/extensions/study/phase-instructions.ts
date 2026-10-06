import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StudyPhase } from "./study-state.ts";

export async function loadPhaseInstructions(phase: StudyPhase): Promise<string> {
  try {
    return (await readFile(join(dirname(fileURLToPath(import.meta.url)), "instructions", `${phase}.md`), "utf8")).trim();
  } catch {
    return "현재 phase의 표준 학습 흐름을 진행하세요.";
  }
}
