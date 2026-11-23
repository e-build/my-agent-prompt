import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  PROMPT_NAMES,
  layerFile,
  loadPrompt,
  readDefaultPrompt,
  type PromptLayers,
  type PromptName,
} from "./prompt-loader.ts";

export type OverrideLayer = "root" | "project";

export function overridePath(name: PromptName, dir: string): string {
  if (!(PROMPT_NAMES as readonly string[]).includes(name))
    throw new Error(`알 수 없는 지침입니다: ${name} (가능: ${PROMPT_NAMES.join(", ")})`);
  return layerFile(dir, name);
}

function layerDir(layers: PromptLayers, layer: OverrideLayer): string {
  const dir = layer === "root" ? layers.root : layers.project;
  if (!dir)
    throw new Error(
      layer === "root" ? "등록된 study 루트를 찾지 못했습니다." : "학습 프로젝트를 찾지 못했습니다.",
    );
  return dir;
}

/** Copies the shipped default into the chosen layer. Never overwrites an existing override. */
export async function ejectPrompt(
  name: PromptName,
  layers: PromptLayers,
  layer: OverrideLayer,
): Promise<string> {
  const target = overridePath(name, layerDir(layers, layer));
  const text = await readDefaultPrompt(layers.defaults, name);
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(target, text, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`이미 덮어쓴 파일이 있습니다: ${target}`);
    throw error;
  }
  return target;
}

/** Line-by-line comparison of the effective prompt against the current default. */
export async function diffPrompt(name: PromptName, layers: PromptLayers): Promise<string> {
  const base = (await readDefaultPrompt(layers.defaults, name)).split("\n");
  const current = (await loadPrompt(name, layers)).text.split("\n");
  const lines: string[] = [];
  for (let i = 0; i < Math.max(base.length, current.length); i++) {
    if (base[i] === current[i]) continue;
    if (base[i] !== undefined && base[i] !== "") lines.push(`- ${base[i]}`);
    if (current[i] !== undefined && current[i] !== "") lines.push(`+ ${current[i]}`);
  }
  return lines.length ? lines.join("\n") : "(기본값과 같음)";
}

export async function resetPrompt(
  name: PromptName,
  layers: PromptLayers,
  layer: OverrideLayer,
): Promise<string> {
  const target = overridePath(name, layerDir(layers, layer));
  try {
    await rm(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`덮어쓴 파일이 없습니다: ${target}`);
    throw error;
  }
  return target;
}
