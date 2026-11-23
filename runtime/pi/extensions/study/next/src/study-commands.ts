import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  chapterMessage,
  initMessage,
  resolveChapterTarget,
  reviewMessage,
  type ChapterTarget,
} from "./flow/command-messages.ts";
import { todayIn } from "./flow/flow-actions.ts";
import { diffPrompt, ejectPrompt, resetPrompt, type OverrideLayer } from "./prompts/prompt-commands.ts";
import { PROMPT_NAMES, listPromptSources, type PromptLayers, type PromptName } from "./prompts/prompt-loader.ts";
import { due } from "./review/schedule.ts";
import { findWorkspaceRoot } from "./review/workspace.ts";
import { findStudyProjectRoot } from "./state/project-root.ts";
import {
  buildChapterMenu,
  chapterArgumentCompletions,
  chapterDescription,
  phaseLabel,
  readChapterCatalog,
} from "./ui/chapter-catalog.ts";
import { PHASES } from "./state/study-state.ts";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function promptLayers(cwd: string, defaults: string): Promise<PromptLayers> {
  const project = await findStudyProjectRoot(cwd).catch(() => undefined);
  const workspace = await findWorkspaceRoot(project ?? cwd).catch(() => null);
  return { defaults, root: workspace?.root, project };
}

export function registerStudyCommands(
  pi: ExtensionAPI,
  options: { promptsDir: string; onTarget: (target: ChapterTarget) => void },
) {
  let completionCwd = process.cwd();
  pi.on("session_start", (_event, ctx) => {
    if (ctx?.cwd) completionCwd = ctx.cwd;
  });

  const openTarget = async (target: ChapterTarget) => {
    options.onTarget(target);
    pi.sendUserMessage(await chapterMessage(target, options.promptsDir));
  };

  pi.registerCommand("study-init", {
    description: "새 학습 프로젝트: 브리프 → 배치 진단 → 커리큘럼 승인 (학습 채널 사용)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        pi.sendUserMessage(await initMessage(ctx.cwd, args, options.promptsDir));
      } catch (error) {
        ctx.ui.notify(errorText(error), "warning");
      }
    },
  });

  pi.registerCommand("study-chapter", {
    description: "학습 이어가기. 인자 없이 실행하면 메뉴, 예: /study-chapter 01 시험",
    getArgumentCompletions: async (prefix: string) => {
      try {
        return chapterArgumentCompletions(await readChapterCatalog(await findStudyProjectRoot(completionCwd)), prefix);
      } catch {
        return null;
      }
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      completionCwd = ctx.cwd;
      try {
        if (args.trim() || !ctx.hasUI) return await openTarget(await resolveChapterTarget(ctx.cwd, args));
        const projectRoot = await findStudyProjectRoot(ctx.cwd);
        const catalog = await readChapterCatalog(projectRoot);
        if (!catalog.chapters.length) throw new Error("학습 챕터가 없습니다.");
        const workspace = await findWorkspaceRoot(projectRoot).catch(() => null);
        const dueReviews = workspace ? (await due(workspace.root, todayIn(workspace.timezone))).length : 0;
        const menu = buildChapterMenu(catalog, { dueReviews });
        const choice = await ctx.ui.select("무엇을 할까요?", menu.map((m) => m.label));
        const picked = menu.find((m) => m.label === choice)?.action;
        if (!picked) return;
        if (picked.type === "review") return pi.sendUserMessage(await reviewMessage(projectRoot, options.promptsDir));
        if (picked.type === "open")
          return await openTarget({ projectRoot, chapterSlug: picked.chapterSlug, phase: picked.phase });
        let chapterSlug = picked.type === "pick-phase" ? picked.chapterSlug : undefined;
        if (!chapterSlug) {
          const labels = catalog.chapters.map((c) => `${c.number}  ${c.title} — ${chapterDescription(c)}`);
          chapterSlug = catalog.chapters[labels.indexOf((await ctx.ui.select("챕터를 고르세요", labels)) ?? "")]?.slug;
          if (!chapterSlug) return;
        }
        const chapter = catalog.chapters.find((c) => c.slug === chapterSlug)!;
        const order = [chapter.next, ...PHASES.filter((p) => p !== chapter.next)];
        const labels = order.map((p) => `${phaseLabel(p)}${p === chapter.next ? " (다음 단계)" : ""}`);
        const phase = order[labels.indexOf((await ctx.ui.select(`${chapter.number} ${chapter.title}`, labels)) ?? "")];
        if (phase) await openTarget({ projectRoot, chapterSlug, phase });
      } catch (error) {
        ctx.ui.notify(errorText(error), "warning");
      }
    },
  });

  pi.registerCommand("study-review", {
    description: "오늘 할 챕터 복습 (인자로 챕터를 주면 그 챕터만)",
    getArgumentCompletions: async (prefix: string) => {
      try {
        const catalog = await readChapterCatalog(await findStudyProjectRoot(completionCwd));
        return chapterArgumentCompletions(catalog, prefix)?.filter((item) => /^\d+$/.test(item.value)) ?? null;
      } catch {
        return null;
      }
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        const chapter = args.trim() ? (await resolveChapterTarget(ctx.cwd, args.trim())).chapterSlug : undefined;
        pi.sendUserMessage(await reviewMessage(ctx.cwd, options.promptsDir, chapter));
      } catch (error) {
        ctx.ui.notify(errorText(error), "warning");
      }
    },
  });

  pi.registerCommand("study-prompts", {
    description: "단계 지침 덮어쓰기 관리: list | eject <name> [--project] | diff <name> | reset <name> [--project]",
    getArgumentCompletions: async (prefix: string) => {
      const tokens = prefix.split(/\s+/);
      if (tokens.length === 1)
        return ["list", "eject", "diff", "reset"]
          .filter((v) => v.startsWith(tokens[0]))
          .map((value) => ({ value, label: value }));
      if (tokens.length === 2 && tokens[0] !== "list")
        return PROMPT_NAMES.filter((n) => n.startsWith(tokens[1])).map((n) => ({
          value: `${tokens[0]} ${n}`,
          label: n,
        }));
      return null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        const tokens = args.trim().split(/\s+/).filter(Boolean);
        const [action = "list", name] = tokens;
        const layer: OverrideLayer = tokens.includes("--project") ? "project" : "root";
        const layers = await promptLayers(ctx.cwd, options.promptsDir);
        if (action === "list") {
          const rows = await listPromptSources(layers);
          ctx.ui.notify(
            rows.map((r) => `${r.name.padEnd(26)} ${r.source}${r.differs ? " (변경됨)" : ""}`).join("\n"),
            "info",
          );
          return;
        }
        if (!name || !(PROMPT_NAMES as readonly string[]).includes(name))
          throw new Error(`지침 이름이 필요합니다: ${PROMPT_NAMES.join(", ")}`);
        const prompt = name as PromptName;
        if (action === "eject") ctx.ui.notify(`복사함: ${await ejectPrompt(prompt, layers, layer)}`, "info");
        else if (action === "diff") ctx.ui.notify(await diffPrompt(prompt, layers), "info");
        else if (action === "reset") {
          if (!(await ctx.ui.confirm("지침 되돌리기", `${layer} 층의 ${name}.md를 삭제할까요?`))) return;
          ctx.ui.notify(`삭제함: ${await resetPrompt(prompt, layers, layer)}`, "info");
        } else throw new Error(`알 수 없는 동작입니다: ${action} (list | eject | diff | reset)`);
      } catch (error) {
        ctx.ui.notify(errorText(error), "warning");
      }
    },
  });
}
