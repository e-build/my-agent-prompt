import { stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { isRelativeSafePath } from "../workspace/workspace-types.ts";
import type { SourceRef } from "./knowledge-types.ts";

export const SOURCES_FILE = ".study/local/sources.json";

export type SourceLocation = {
  materialId: string;
  kind: SourceRef["kind"];
  status: "available" | "missing" | "remote" | "teacher";
  path?: string;
  message: string;
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a source lives on this PC. Workspace files are root-relative;
 * external files come from the PC-local `.study/local/sources.json`
 * (materialId → absolute path). Nothing is copied or fetched.
 */
export async function locateSources(root: string, sources: SourceRef[]): Promise<SourceLocation[]> {
  let mapping: Record<string, string> = {};
  const content = await readTextOptional(join(root, ...SOURCES_FILE.split("/")));
  if (content !== null) {
    try {
      mapping = JSON.parse(content);
    } catch {
      mapping = {};
    }
  }
  const result: SourceLocation[] = [];
  for (const source of sources) {
    const base = { materialId: source.materialId, kind: source.kind };
    if (source.kind === "url") {
      result.push({ ...base, status: "remote", message: `원격 자료: ${source.locator}` });
      continue;
    }
    if (source.kind === "teacher") {
      result.push({ ...base, status: "teacher", message: "교사 설명(파일 없음)" });
      continue;
    }
    let path: string | undefined;
    if (source.kind === "workspace-file") {
      const file = source.locator.split("#")[0];
      if (isRelativeSafePath(file)) path = join(root, ...file.split("/"));
    } else {
      const mapped = mapping[source.materialId];
      if (typeof mapped === "string" && isAbsolute(mapped)) path = mapped;
    }
    if (path && (await exists(path))) result.push({ ...base, status: "available", path, message: path });
    else
      result.push({
        ...base,
        status: "missing",
        message:
          source.kind === "external-file"
            ? `자료 없음 — 이 PC의 ${SOURCES_FILE}에 ${source.materialId} 위치를 등록하세요`
            : `자료 없음: ${source.locator}`,
      });
  }
  return result;
}
