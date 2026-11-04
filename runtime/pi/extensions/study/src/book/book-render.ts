import type { WorkspaceProject } from "../workspace/workspace-types.ts";
import { ancestorsOf, BOOK_DIR, childrenOf, pagePath, relativeLink } from "./book-tree.ts";
import type { ConceptNode } from "./book-types.ts";

/** Generated breadcrumb, title and child list. Pure. */
export function renderHead(byId: Map<string, ConceptNode>, node: ConceptNode): string {
  const self = pagePath(byId, node);
  const crumbs = [
    `[교과서](${relativeLink(self, `${BOOK_DIR}/README.md`)})`,
    ...ancestorsOf(byId, node).map((a) => `[${a.name}](${relativeLink(self, pagePath(byId, a))})`),
    `**${node.name}**`,
  ];
  const children = childrenOf(byId, node.id);
  const list = children.length
    ? `\n\n## 하위 개념\n\n${children.map((c) => `- [${c.name}](${relativeLink(self, pagePath(byId, c))})`).join("\n")}`
    : "";
  return `${crumbs.join(" › ")}\n\n# ${node.name}${list}`;
}

/** Generated "배운 곳" list. Pure. */
export function renderFoot(
  byId: Map<string, ConceptNode>,
  node: ConceptNode,
  projects: WorkspaceProject[],
): string {
  const self = pagePath(byId, node);
  const related = node.related.map((id) => byId.get(id)).filter((n): n is ConceptNode => !!n);
  const relatedBlock = related.length
    ? `## 관련 개념\n\n${related.map((r) => `- [${r.name}](${relativeLink(self, pagePath(byId, r))})`).join("\n")}\n\n`
    : "";
  if (!node.learnedIn.length) return `${relatedBlock}## 배운 곳\n\n- (아직 없음)`;
  const lines = [...node.learnedIn]
    .sort((a, b) => a.completedOn.localeCompare(b.completedOn))
    .map((l) => {
      const project = projects.find((p) => p.id === l.projectId);
      if (!project) return `- ${l.projectId} · ${l.chapterSlug} · ${l.completedOn} (프로젝트 없음)`;
      const link = relativeLink(self, `${project.path}/${l.chapterSlug}/README.md`);
      return `- [${project.slug} · ${l.chapterSlug}](${link}) · ${l.completedOn}`;
    });
  return `${relatedBlock}## 배운 곳\n\n${lines.join("\n")}`;
}
