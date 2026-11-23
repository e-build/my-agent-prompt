import { findWorkspaceRoot, type Workspace } from "../review/workspace.ts";
import { loadProjectManifest } from "../state/project-manifest.ts";
import { findStudyProjectRoot } from "../state/project-root.ts";
import type { Channel } from "./channel.ts";
import { createChatChannel } from "./chat-channel.ts";
import { createPlannotatorChannel, type ExecWithInput } from "./plannotator-channel.ts";
import { resolveChannelId, type ChannelId } from "./select-channel.ts";

export type StudyContext = {
  projectRoot: string;
  projectSlug: string;
  workspace: Workspace | null;
  channelId: ChannelId;
};

export type ChannelFactory = (id: ChannelId, context: StudyContext) => Channel;

export function defaultChannelFactory(deps: {
  exec: ExecWithInput;
  sessionId: () => string;
}): ChannelFactory {
  return (id, context) =>
    id === "plannotator"
      ? createPlannotatorChannel({ exec: deps.exec, sessionId: deps.sessionId, cwd: context.projectRoot })
      : createChatChannel();
}

/** Resolves the project, its study root and the configured channel from a working directory. */
export async function resolveStudyContext(
  cwd: string,
  projectRoot?: string,
): Promise<StudyContext> {
  const root = await findStudyProjectRoot(cwd, projectRoot ? { projectRoot, allowCreate: true } : {});
  const manifest = await loadProjectManifest(root);
  const workspace = await findWorkspaceRoot(root);
  return {
    projectRoot: root,
    projectSlug: manifest?.projectSlug ?? root.split(/[\\/]/).pop()!,
    workspace,
    channelId: resolveChannelId({ workspace: workspace?.channel, project: manifest?.channel }),
  };
}
