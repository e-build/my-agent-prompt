import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readWorkspace } from "../workspace/workspace-root.ts";
import { decodeKnowledgeItem } from "./knowledge-codec.ts";
import { CHAINS_FILE, HISTORY_DIR, ITEMS_DIR } from "./knowledge-store.ts";
import type { KnowledgeItem } from "./knowledge-types.ts";
import { validateChains, validateRedirects } from "./knowledge-validation.ts";

const CONFLICT = /^(<{7}|={7}|>{7})( |$)/m;

async function files(dir: string, ext: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((n) => n.endsWith(ext)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function read(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Read-only consistency check after syncing between PCs: Git conflict
 * markers, corrupt files, version/history divergence, merge cycles and links
 * (chains, schedules, chapter bindings) to missing knowledge. Never repairs.
 */
export async function checkKnowledgeIntegrity(root: string): Promise<string[]> {
  const issues: string[] = [];
  const items = new Map<string, KnowledgeItem>();
  const itemsDir = join(root, ...ITEMS_DIR.split("/"));
  for (const name of await files(itemsDir, ".md")) {
    const relative = `${ITEMS_DIR}/${name}`;
    const content = (await read(join(itemsDir, name)))!;
    if (CONFLICT.test(content)) {
      issues.push(`Git 충돌 표시가 남아 있습니다: ${relative}`);
      continue;
    }
    try {
      const item = decodeKnowledgeItem(content);
      if (`${item.id}.md` !== name) issues.push(`파일 이름과 지식 ID가 다릅니다: ${relative}`);
      items.set(item.id, item);
    } catch (error) {
      issues.push(`지식 파일 손상: ${relative} (${error instanceof Error ? error.message : error})`);
    }
  }
  for (const [id, item] of items) {
    const relative = `${HISTORY_DIR}/${id}.jsonl`;
    const content = await read(join(root, ...relative.split("/")));
    if (content === null) {
      issues.push(`버전 이력이 없습니다: ${relative}`);
      continue;
    }
    if (CONFLICT.test(content)) {
      issues.push(`Git 충돌 표시가 남아 있습니다: ${relative}`);
      continue;
    }
    try {
      const last = content.trim().split("\n").map((l) => JSON.parse(l)).at(-1);
      if (last?.revisionId !== item.revisionId || last?.snapshot?.version !== item.version)
        issues.push(`${id}: 최신 파일(v${item.version})과 버전 이력의 마지막 기록이 다릅니다. 두 PC에서 따로 수정됐을 수 있습니다.`);
    } catch {
      issues.push(`버전 이력 손상: ${relative}`);
    }
    if (item.mergedInto && !items.has(item.mergedInto))
      issues.push(`${id}: 병합 대상 지식이 없습니다 (${item.mergedInto})`);
  }
  try {
    validateRedirects(new Map([...items.values()].filter((i) => i.mergedInto).map((i) => [i.id, i.mergedInto!])));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  const chains = await read(join(root, ...CHAINS_FILE.split("/")));
  if (chains !== null) {
    if (CONFLICT.test(chains)) issues.push(`Git 충돌 표시가 남아 있습니다: ${CHAINS_FILE}`);
    else {
      try {
        const parsed = validateChains(chains.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)));
        for (const chain of parsed)
          for (const ref of [...chain.premiseRefs, chain.conclusionRef])
            if (!items.has(ref.id)) issues.push(`추론 사슬 ${chain.id}가 없는 지식을 가리킵니다: ${ref.id}`);
      } catch (error) {
        issues.push(`추론 사슬 파일 오류: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  const scheduleDir = join(root, "review", "items");
  for (const name of await files(scheduleDir, ".json")) {
    const content = (await read(join(scheduleDir, name)))!;
    if (CONFLICT.test(content)) {
      issues.push(`Git 충돌 표시가 남아 있습니다: review/items/${name}`);
      continue;
    }
    try {
      const id = JSON.parse(content).knowledgeId;
      if (!items.has(id)) issues.push(`복습 일정이 없는 지식을 가리킵니다: review/items/${name} → ${id}`);
    } catch {
      issues.push(`복습 일정 파일 손상: review/items/${name}`);
    }
  }

  const workspace = await readWorkspace(root);
  for (const project of workspace.manifest.projects) {
    const dir = join(root, ...project.path.split("/"), ".study", "bindings");
    for (const name of await files(dir, ".json")) {
      const relative = `${project.path}/.study/bindings/${name}`;
      const content = (await read(join(dir, name)))!;
      if (CONFLICT.test(content)) {
        issues.push(`Git 충돌 표시가 남아 있습니다: ${relative}`);
        continue;
      }
      try {
        const binding = JSON.parse(content);
        for (const region of binding.regions ?? [])
          for (const ref of region.refs ?? [])
            if (!items.has(ref.id)) issues.push(`챕터 지식 연결이 없는 지식을 가리킵니다: ${relative} → ${ref.id}`);
      } catch {
        issues.push(`챕터 지식 연결 파일 손상: ${relative}`);
      }
    }
  }
  return issues;
}
