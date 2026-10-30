import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { scheduleProgress } from "../review/review-page.ts";
import { currentSha256, readTextOptional, sha256 } from "./atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "./change-plan.ts";
import { previewWorkspaceRegistration } from "./workspace-registration.ts";
import { WORKSPACE_MARKER } from "./workspace-types.ts";
import { projectManifestIssues } from "./workspace-actions.ts";

const run = promisify(execFile);

export type ChapterAction =
  | "nothing_to_migrate"
  | "keep_skipped"
  | "manual_start_only"
  | "keep_legacy_completed"
  | "keep_legacy_in_progress";

export type ChapterPlan = { chapterSlug: string; action: ChapterAction; notes: string[] };
export type ProjectPlan = { slug: string; chapters: ChapterPlan[]; notes: string[] };

export type MigrationPreview = {
  root: string;
  digest: string;
  gitClean: boolean;
  head: string | null;
  blockers: string[];
  projects: ProjectPlan[];
  registrationFiles: string[];
  /** Always 0: migration never creates review schedules by itself. */
  scheduleChanges: 0;
  summary: string;
};

type MigrationRecord = {
  schemaVersion: 1;
  migrationId: string;
  appliedAt: string;
  digest: string;
  changes: Array<{ path: string; before: string | null; beforeSha256: string | null; afterSha256: string | null }>;
};

async function gitState(root: string): Promise<{ clean: boolean; head: string | null; blocker?: string }> {
  try {
    const status = (await run("git", ["status", "--porcelain"], { cwd: root })).stdout;
    const head = (await run("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    return status.trim()
      ? { clean: false, head, blocker: `커밋되지 않은 변경이 있습니다. 먼저 사용자가 정리해야 합니다:\n${status.trim()}` }
      : { clean: true, head };
  } catch {
    return { clean: false, head: null, blocker: "Git 저장소가 아니거나 Git 상태를 확인할 수 없습니다." };
  }
}

function parseState(content: string | null): Record<string, any> | null {
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    return { corrupt: true };
  }
}

async function analyseProject(root: string, slug: string): Promise<ProjectPlan> {
  const dir = join(root, slug);
  const notes: string[] = [];
  const state = parseState(await readTextOptional(join(dir, ".study", "state.json")));
  if (!state) notes.push("state.json 없음 — 읽기만 하며 새로 만들지 않음");
  if (state?.corrupt) notes.push("state.json 손상 — 자동 복구하지 않음");
  if (state?.status === "closed") notes.push("프로젝트 상태 closed 유지");
  if (typeof state?.projectRoot === "string" && state.projectRoot !== dir)
    notes.push("state.json의 절대 projectRoot는 호환용으로만 읽고 고치지 않음");
  const chapters = Object.keys(state?.chapters ?? {});
  const entries = await readdir(dir, { withFileTypes: true });
  const slugs = [...new Set([...chapters, ...entries.filter((e) => e.isDirectory() && /^ch-\d+-/.test(e.name)).map((e) => e.name)])].sort();
  const timestamps = new Map<string, number>();
  for (const ch of chapters) {
    const t = state!.chapters[ch]?.test?.updatedAt;
    if (typeof t === "string") timestamps.set(t.slice(0, 19), (timestamps.get(t.slice(0, 19)) ?? 0) + 1);
  }
  const plans: ChapterPlan[] = [];
  for (const chapterSlug of slugs) {
    const chapter = state?.chapters?.[chapterSlug];
    const chNotes: string[] = [];
    const schedule = await readTextOptional(join(dir, chapterSlug, "review", "schedule.md"));
    if (schedule) {
      const progress = scheduleProgress(schedule, "2000-01-01");
      const planned = progress.rounds.filter((r) => r.status !== "completed");
      if (planned.length) chNotes.push(`기존 planned 회차 ${planned.length}개는 수행 기록이 없어 완료로 바꾸지 않음`);
      chNotes.push("기존 review 파일은 원본 그대로 보존");
    }
    let action: ChapterAction = "nothing_to_migrate";
    const reviewStatus = chapter?.review?.status;
    const testStatus = chapter?.test?.status;
    if (reviewStatus === "skipped_understood") action = "keep_skipped";
    else if (reviewStatus === "completed") action = "keep_legacy_completed";
    else if (testStatus === "completed" || testStatus === "skipped_understood") {
      action = reviewStatus === "in_progress" ? "keep_legacy_in_progress" : "manual_start_only";
      const t = chapter?.test?.updatedAt;
      if (typeof t === "string" && (timestamps.get(t.slice(0, 19)) ?? 0) > 1)
        chNotes.push("완료 시각이 다른 챕터와 같아 실제 완료일로 신뢰하지 않음 — 시작 요청일을 기준일로 사용");
      chNotes.push("자동으로 복습을 시작하지 않음. 사용자가 원할 때 지식 연결 후 시작");
    }
    plans.push({ chapterSlug, action, notes: chNotes });
  }
  return { slug, chapters: plans, notes };
}

/** Read-only. Never creates, repairs or schedules anything. */
export async function previewMigration(rootInput: string): Promise<MigrationPreview> {
  const registration = await previewWorkspaceRegistration(rootInput);
  const root = registration.root;
  const git = await gitState(root);
  const projects = [];
  for (const project of registration.projects) projects.push(await analyseProject(root, project.path));
  const files = registration.plan?.changes ?? [];
  const digest = sha256(
    JSON.stringify({
      root,
      head: git.head,
      files: files.map((c) => [c.path, c.beforeSha256]),
      projects,
    }),
  ).slice(0, 16);
  const blockers = git.blocker ? [git.blocker] : [];
  for (const project of registration.projects) blockers.push(...(await projectManifestIssues(root, project)));
  const summary = [
    `기존 기록 이전 미리 보기: ${root}`,
    `- Git: ${git.clean ? "깨끗함" : "정리 필요"}`,
    `- 등록 파일: ${files.map((c) => c.path).join(", ") || "없음(이미 등록됨)"}`,
    ...projects.flatMap((p) => [
      `- ${p.slug}${p.notes.length ? ` (${p.notes.join("; ")})` : ""}`,
      ...p.chapters.map((c) => `  - ${c.chapterSlug}: ${c.action}${c.notes.length ? ` — ${c.notes.join("; ")}` : ""}`),
    ]),
    "- 복습 일정 생성: 0개 (이전만으로 일정을 만들지 않음)",
    `- 승인 digest: ${digest}`,
  ].join("\n");
  return {
    root,
    digest,
    gitClean: git.clean,
    head: git.head,
    blockers,
    projects,
    registrationFiles: files.map((c) => c.path),
    scheduleChanges: 0,
    summary,
  };
}

const migrationPath = (id: string) => `.study/migrations/${id}.json`;

/** Apply the previewed registration only; legacy files are never rewritten. */
export async function applyMigration(
  rootInput: string,
  approval: { digest: string; approved: boolean },
): Promise<{ status: "committed" | "unchanged"; migrationId: string }> {
  if (!approval.approved) throw new Error("사용자 승인이 필요합니다.");
  const preview = await previewMigration(rootInput);
  if (preview.blockers.length) throw new Error(preview.blockers.join("\n"));
  if (preview.digest !== approval.digest)
    throw new Error("미리 보기 이후 저장소가 바뀌었습니다. 다시 미리 보기 후 승인하세요.");
  const registration = await previewWorkspaceRegistration(preview.root);
  const migrationId = `mig-${randomUUID().slice(0, 8)}`;
  if (!registration.plan) return { status: "unchanged", migrationId };
  const record: MigrationRecord = {
    schemaVersion: 1,
    migrationId,
    appliedAt: new Date().toISOString(),
    digest: preview.digest,
    changes: registration.plan.changes.map((c) => ({ path: c.path, before: c.before, beforeSha256: c.beforeSha256, afterSha256: c.afterSha256 })),
  };
  const changes: PlannedChange[] = [
    ...registration.plan.changes.map((c) => ({ path: c.path, after: c.after })),
    { path: migrationPath(migrationId), after: `${JSON.stringify(record, null, 2)}\n` },
  ];
  const plan = await preparePlan(preview.root, `migration-${migrationId}`, changes, {
    projectPaths: registration.projects.map((p) => p.path),
    rootFiles: [".gitignore"],
  });
  await executePlan(preview.root, plan);
  return { status: "committed", migrationId };
}

/** Remove exactly what one migration added, only if nothing changed since. */
export async function undoMigration(rootInput: string, migrationId: string): Promise<{ status: "rolled_back" }> {
  if (!/^mig-[a-f0-9]{8}$/.test(migrationId)) throw new Error(`migrationId가 올바르지 않습니다: ${migrationId}`);
  const root = (await previewWorkspaceRegistration(rootInput).catch(() => null))?.root ?? rootInput;
  const content = await readTextOptional(join(root, ...migrationPath(migrationId).split("/")));
  if (content === null) throw new Error(`이전 기록을 찾지 못했습니다: ${migrationId}`);
  const record: MigrationRecord = JSON.parse(content);
  for (const change of record.changes) {
    if ((await currentSha256(join(root, ...change.path.split("/")))) !== change.afterSha256)
      throw new Error(`이전 이후 변경된 파일이 있어 되돌리지 않습니다: ${change.path}`);
  }
  const marker = JSON.parse((await readTextOptional(join(root, WORKSPACE_MARKER))) ?? "{\"projects\":[]}");
  const changes: PlannedChange[] = [
    ...record.changes.map((c) => ({ path: c.path, after: c.before })),
    { path: migrationPath(migrationId), after: null },
  ];
  const plan = await preparePlan(root, `migration-undo-${migrationId}`, changes, {
    projectPaths: (marker.projects ?? []).map((p: { path: string }) => p.path),
    rootFiles: [".gitignore"],
  });
  await executePlan(root, plan);
  for (const change of [...record.changes.filter((c) => c.before === null), { path: migrationPath(migrationId) }]) {
    let dir = dirname(join(root, ...change.path.split("/")));
    while (dir.startsWith(root) && dir !== root) {
      try {
        await rmdir(dir);
      } catch {
        break;
      }
      dir = dirname(dir);
    }
  }
  return { status: "rolled_back" };
}
