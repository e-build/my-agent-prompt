import { basename, dirname, resolve } from "node:path";
import { findWorkspaceRoot } from "./workspace-root.ts";
import { applyWorkspaceRegistration, previewWorkspaceRegistration } from "./workspace-registration.ts";

export type AutoRegistration = {
  status: "joined" | "created" | "unchanged";
  root: string;
  projectSlug: string;
};

/**
 * Called when the learner approves a curriculum ("이 방향으로 시작"): that
 * approval is the consent to register. The project joins the enclosing study
 * root, or its parent directory becomes the root when none exists. Only this
 * project is added; other unregistered folders are left alone.
 */
export async function registerApprovedProject(projectRootInput: string): Promise<AutoRegistration> {
  const projectRoot = resolve(projectRootInput);
  const slug = basename(projectRoot);
  const enclosing = await findWorkspaceRoot(projectRoot);
  const root = enclosing && enclosing.root !== projectRoot ? enclosing.root : dirname(projectRoot);
  const relative = projectRoot.slice(root.length + 1).split("\\").join("/");
  if (!relative || relative.includes("/"))
    throw new Error(`학습 프로젝트는 study 루트 바로 아래에 있어야 자동 등록됩니다: ${projectRoot}`);
  const preview = await previewWorkspaceRegistration(root, { onlyProjects: [relative] });
  if (!preview.plan) return { status: "unchanged", root, projectSlug: slug };
  await applyWorkspaceRegistration(root, preview);
  return { status: enclosing ? "joined" : "created", root, projectSlug: slug };
}
