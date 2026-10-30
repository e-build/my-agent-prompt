import { join } from "node:path";
import { projectBySlug } from "../knowledge/chapter-bindings.ts";
import type { KnowledgeRef } from "../knowledge/knowledge-types.ts";
import { validateRef } from "../knowledge/knowledge-validation.ts";
import { readTextOptional, sha256 } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan } from "../workspace/change-plan.ts";
import { isRelativeSafePath } from "../workspace/workspace-types.ts";
import { ASSISTANCE, type Assistance } from "./evidence-types.ts";

/**
 * A pointer from shared knowledge to an existing lab/test/diagnosis record.
 * The original stays where it is; only path, anchor and digest are stored.
 */
export type RecordLink = {
  linkId: string;
  kind: "lab" | "test" | "legacy-diagnosis";
  recordPath: string;
  anchor: string;
  digest: string;
  assistance: Assistance;
  refs: KnowledgeRef[];
  linkedAt: string;
};

export type RecordLinkInput = Omit<RecordLink, "digest" | "linkedAt" | "refs"> & {
  projectSlug: string;
  chapterSlug: string;
  refs: KnowledgeRef[];
  /** The agent wrote the code or answer; cannot count as independent. */
  agentAuthored?: boolean;
};

const KINDS: RecordLink["kind"][] = ["lab", "test", "legacy-diagnosis"];

function anchorPresent(kind: RecordLink["kind"], content: string, anchor: string): boolean {
  if (kind === "lab") return content.includes(`- Step ID: \`${anchor}\``);
  return content.includes(anchor);
}

function linksPath(projectPath: string, chapterSlug: string): string {
  if (!/^ch-\d+-[a-z0-9-]+$/.test(chapterSlug)) throw new Error(`챕터 slug가 올바르지 않습니다: ${chapterSlug}`);
  return `${projectPath}/.study/links/${chapterSlug}.json`;
}

export async function listRecordLinks(root: string, projectSlug: string, chapterSlug: string): Promise<RecordLink[]> {
  const project = await projectBySlug(root, projectSlug);
  const content = await readTextOptional(join(root, ...linksPath(project.path, chapterSlug).split("/")));
  if (content === null) return [];
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`기록 연결 파일이 손상됐습니다: ${linksPath(project.path, chapterSlug)}`);
  }
}

export async function linkExistingRecord(root: string, input: RecordLinkInput): Promise<RecordLink> {
  if (!KINDS.includes(input.kind)) throw new Error(`kind가 올바르지 않습니다: ${input.kind}`);
  if (!ASSISTANCE.includes(input.assistance)) throw new Error(`assistance가 올바르지 않습니다: ${input.assistance}`);
  if (input.agentAuthored && input.assistance === "independent")
    throw new Error("에이전트가 작성한 코드·답의 통과는 독립 수행으로 기록할 수 없습니다.");
  if (!isRelativeSafePath(input.recordPath)) throw new Error(`허용되지 않는 경로입니다: ${input.recordPath}`);
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(input.linkId)) throw new Error("linkId 형식이 올바르지 않습니다.");
  const project = await projectBySlug(root, input.projectSlug);
  const content = await readTextOptional(join(root, ...project.path.split("/"), ...input.recordPath.split("/")));
  if (content === null) throw new Error(`기록 파일을 찾지 못했습니다: ${input.recordPath}`);
  if (!anchorPresent(input.kind, content, input.anchor))
    throw new Error(`기록에서 위치를 찾지 못했습니다: ${input.recordPath}#${input.anchor}`);
  const link: RecordLink = {
    linkId: input.linkId,
    kind: input.kind,
    recordPath: input.recordPath,
    anchor: input.anchor,
    digest: sha256(content),
    assistance: input.assistance,
    refs: input.refs.map((r) => validateRef(r)),
    linkedAt: new Date().toISOString(),
  };
  const existing = await listRecordLinks(root, input.projectSlug, input.chapterSlug);
  const same = existing.find((l) => l.linkId === link.linkId);
  if (same) {
    const comparable = (l: RecordLink) => JSON.stringify({ ...l, linkedAt: "", digest: "" });
    if (comparable(same) !== comparable(link)) throw new Error(`같은 linkId로 다른 연결을 만들 수 없습니다: ${link.linkId}`);
    return same;
  }
  const relative = linksPath(project.path, input.chapterSlug);
  const plan = await preparePlan(root, `record-link-${project.id}-${input.chapterSlug}-${link.linkId}`, [
    { path: relative, after: `${JSON.stringify([...existing, link], null, 2)}\n` },
  ], { projectPaths: [project.path] });
  await executePlan(root, plan);
  return link;
}
