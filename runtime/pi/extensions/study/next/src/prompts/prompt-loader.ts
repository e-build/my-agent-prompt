import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const PROMPT_NAMES = [
  "init",
  "concept",
  "lab",
  "test",
  "review",
  "checkpoint",
  "templates/concept-page",
  "templates/chapter-readme",
] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

/** `root` and `project` are directories that may hold `.study/prompts/<name>.md`. */
export type PromptLayers = { defaults: string; root?: string; project?: string };
export type PromptSource = "project" | "root" | "default";
export type LoadedPrompt = { text: string; source: PromptSource; warnings: string[] };

export function layerFile(dir: string, name: PromptName): string {
  return join(dir, ".study", "prompts", `${name}.md`);
}

async function readOptional(path: string): Promise<{ text?: string; warning?: string }> {
  try {
    return { text: await readFile(path, "utf8") };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    return { warning: `덮어쓴 지침을 읽지 못해 다음 층을 씁니다: ${path} (${code})` };
  }
}

function substitute(text: string, vars: { topic?: string }): string {
  return vars.topic === undefined ? text : text.replaceAll("{{topic}}", vars.topic);
}

export async function readDefaultPrompt(defaults: string, name: PromptName): Promise<string> {
  const read = await readOptional(join(defaults, `${name}.md`));
  if (read.text === undefined) throw new Error(`기본 지침이 없습니다: ${name}.md`);
  return read.text;
}

/** The first readable file wins: project, then study root, then the shipped default. */
export async function loadPrompt(
  name: PromptName,
  layers: PromptLayers,
  vars: { topic?: string } = {},
): Promise<LoadedPrompt> {
  const warnings: string[] = [];
  const candidates: Array<[PromptSource, string | undefined]> = [
    ["project", layers.project],
    ["root", layers.root],
  ];
  for (const [source, dir] of candidates) {
    if (!dir) continue;
    const read = await readOptional(layerFile(dir, name));
    if (read.warning) warnings.push(read.warning);
    if (read.text !== undefined) return { text: substitute(read.text, vars), source, warnings };
  }
  return {
    text: substitute(await readDefaultPrompt(layers.defaults, name), vars),
    source: "default",
    warnings,
  };
}

export async function listPromptSources(
  layers: PromptLayers,
): Promise<Array<{ name: PromptName; source: PromptSource; differs: boolean }>> {
  const rows = [];
  for (const name of PROMPT_NAMES) {
    const loaded = await loadPrompt(name, layers);
    const base = await readDefaultPrompt(layers.defaults, name);
    rows.push({ name, source: loaded.source, differs: loaded.text !== base });
  }
  return rows;
}
