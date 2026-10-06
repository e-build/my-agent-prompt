import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { findStudyProjectRoot, resolveChapterSlug } from "./study-command.ts";
import { resolveNextPhase, type StudyPhase, type StudyState } from "./study-state.ts";
import { projectPath } from "./project-path.ts";

const exec = promisify(execFile);
export const CHECKPOINT_STATUSES = ["answer_verified", "self_reported", "explained", "skipped", "unverified"] as const;
export type CheckpointRecord = {
  summary: string;
  learningMode: string;
  topics: { topic: string; status: typeof CHECKPOINT_STATUSES[number]; evidence: string; takeaway: string }[];
  remaining: string[];
  nextAction: string;
  executionEvidence: string;
};
export type CheckpointRequest = {
  id: string;
  projectRoot: string;
  chapterSlug: string;
  phase: StudyPhase;
  checkpointPath: string;
  repoRoot: string;
  repoPath: string;
  head: string;
  branch: string;
  remote: string;
  remoteBranch: string;
  original: string;
  savedDigest?: string;
  commit?: string;
};
export type CheckpointResult = { path: string; saved: boolean; commit?: string; pushed: boolean; error?: string };

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec("git", args, { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}
function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
async function optionalText(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}
async function safePath(root: string, chapter: string): Promise<string> {
  if (!/^ch-\d+-[a-z0-9-]+$/.test(chapter)) throw new Error("유효하지 않은 챕터 경로입니다.");
  const chapterDir = projectPath(root, chapter);
  const actualRoot = await realpath(root);
  const actualDir = await realpath(chapterDir);
  if (!actualDir.startsWith(`${actualRoot}${sep}`) || (await lstat(chapterDir)).isSymbolicLink()) {
    throw new Error("챕터 symlink 경로는 사용할 수 없습니다.");
  }
  const path = join(chapterDir, "checkpoint.md");
  try {
    if (!(await lstat(path)).isFile() || (await lstat(path)).isSymbolicLink()) throw new Error("checkpoint는 일반 파일이어야 합니다.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return path;
}
async function remoteHead(request: Pick<CheckpointRequest, "repoRoot" | "remote" | "remoteBranch">): Promise<string> {
  const out = await git(request.repoRoot, "ls-remote", "--exit-code", request.remote, `refs/heads/${request.remoteBranch}`);
  return out.split(/\s+/)[0];
}
async function cleanCheckpoint(request: Pick<CheckpointRequest, "repoRoot" | "repoPath">): Promise<void> {
  if (await git(request.repoRoot, "status", "--porcelain", "--untracked-files=all", "--", request.repoPath)) {
    throw new Error("checkpoint에 기존 미커밋 변경이 있습니다. 먼저 해당 기록을 보존·커밋하세요.");
  }
  const ignored = await exec("git", ["check-ignore", "--", request.repoPath], { cwd: request.repoRoot }).then(() => true, e => {
    if (e.code === 1) return false;
    throw e;
  });
  if (ignored) throw new Error("checkpoint 경로가 Git ignore 대상입니다.");
}

export async function prepareCheckpoint(cwd: string, args: string): Promise<CheckpointRequest> {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 1 || tokens[0]?.startsWith("-")) throw new Error("인자는 챕터 하나만 가능합니다: /study-checkpoint [chapter]");
  // The existing resolver may choose the first child project; reject ambiguous parent directories first.
  const projectRoot = await realpath(await findStudyProjectRoot(cwd));
  const actualCwd = await realpath(cwd);
  const inside = actualCwd === projectRoot || actualCwd.startsWith(`${projectRoot}${sep}`);
  if (!inside) {
    const entries = await readdir(cwd, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries.filter(e => e.isDirectory() && e.name.startsWith("study-"))) {
      if ((await readdir(join(cwd, entry.name), { withFileTypes: true })).some(e => e.isDirectory() && /^ch-\d+-/.test(e.name))) candidates.push(entry.name);
    }
    if (candidates.length !== 1) throw new Error("학습 프로젝트가 여러 개입니다. 원하는 프로젝트 디렉토리에서 실행하세요.");
  }
  // Read-only: checkpoint must not migrate or advance the official phase state.
  const state = JSON.parse(await readFile(join(projectRoot, ".study/state.json"), "utf8")) as StudyState;
  if (state.version !== 1 || !state.chapters || !Object.keys(state.chapters).length) throw new Error("학습 상태 파일이 유효하지 않습니다.");
  const chapterArg = tokens[0] ?? state.activeChapter;
  if (!chapterArg && Object.keys(state.chapters).length > 1) throw new Error("활성 챕터가 없습니다. 챕터 인자를 지정하세요.");
  const chapterSlug = resolveChapterSlug(state, chapterArg ?? Object.keys(state.chapters)[0]);
  const phase = chapterSlug === state.activeChapter && state.activePhase ? state.activePhase : resolveNextPhase(state.chapters[chapterSlug]);
  const checkpointPath = await safePath(projectRoot, chapterSlug);
  const repoRoot = await git(projectRoot, "rev-parse", "--show-toplevel");
  const repoPath = relative(repoRoot, checkpointPath);
  const branch = await git(repoRoot, "symbolic-ref", "--quiet", "--short", "HEAD").catch(() => { throw new Error("detached HEAD에서는 checkpoint를 푸시할 수 없습니다."); });
  const remote = await git(repoRoot, "for-each-ref", "--format=%(upstream:remotename)", `refs/heads/${branch}`);
  const mergeRef = await git(repoRoot, "for-each-ref", "--format=%(upstream:remoteref)", `refs/heads/${branch}`);
  if (!remote || remote === "." || !mergeRef.startsWith("refs/heads/")) throw new Error("현재 브랜치의 원격 upstream을 먼저 설정하세요.");
  const request: CheckpointRequest = {
    id: randomUUID(), projectRoot, chapterSlug, phase, checkpointPath, repoRoot, repoPath,
    branch, remote, remoteBranch: mergeRef.slice("refs/heads/".length),
    head: await git(repoRoot, "rev-parse", "HEAD"), original: await optionalText(checkpointPath),
  };
  await cleanCheckpoint(request);
  if (await remoteHead(request) !== request.head) throw new Error("원격과 현재 HEAD가 다릅니다. 기존 미푸시 커밋 또는 원격 변경을 먼저 정리하세요.");
  return request;
}

export function validateCheckpointRecord(value: unknown): CheckpointRecord {
  const item = value as CheckpointRecord;
  function text(value: unknown, field: string): void {
    if (typeof value !== "string" || !value.trim() || value.length > 30_000) throw new Error(`유효하지 않은 ${field}`);
    if (/<!--\s*checkpoint:/.test(value)) throw new Error("checkpoint marker는 본문에 넣을 수 없습니다.");
  }
  if (!item || typeof item !== "object") throw new Error("checkpoint record가 필요합니다.");
  for (const key of ["summary", "learningMode", "nextAction", "executionEvidence"] as const) text(item[key], key);
  if (!Array.isArray(item.topics) || !item.topics.length || item.topics.length > 100) throw new Error("topics는 1~100개여야 합니다.");
  for (const topic of item.topics) {
    if (!topic || !CHECKPOINT_STATUSES.includes(topic.status)) throw new Error("유효하지 않은 topic status");
    text(topic.topic, "topic"); text(topic.evidence, "evidence"); text(topic.takeaway, "takeaway");
  }
  if (!Array.isArray(item.remaining) || item.remaining.length > 100) throw new Error("remaining 목록이 필요합니다.");
  for (const entry of item.remaining) text(entry, "remaining");
  if (JSON.stringify(item).length > 200_000) throw new Error("checkpoint 기록이 너무 큽니다.");
  return item;
}
function render(request: CheckpointRequest, record: CheckpointRecord): string {
  const section = [
    `<!-- checkpoint:${request.id} -->`, `## Checkpoint — ${new Date().toISOString()}`, "",
    `- 챕터: ${request.chapterSlug}`, `- 공식 phase: ${request.phase} (이 기록으로 완료 상태 변경 없음)`,
    `- 진행 방식: ${record.learningMode}`, "", "### 현재까지의 요약", "", record.summary, "",
    "### 주제별 근거와 보완", "",
    ...record.topics.flatMap(t => [`#### ${t.topic}`, "", `- 확인 수준: ${t.status}`, `- 근거: ${t.evidence}`, `- 보완·남은 한계: ${t.takeaway}`, ""]),
    "### 남은 항목", "", ...(record.remaining.length ? record.remaining.map(r => `- ${r}`) : ["- 남은 항목 없음 (공식 완료 검증과는 별개)"]),
    "", "### 다음 재개 지점", "", record.nextAction, "", "### 실제 실행 검증", "", record.executionEvidence, "",
  ].join("\n");
  const header = "# 학습 Checkpoint\n\n## 목차\n\n- 아래 Checkpoint는 시간순 누적 기록. 마지막 기록에서 재개 지점 확인\n- 답변 확인 / 이해 자기보고 / 설명 제공 / 건너뜀 / 미확인 구분\n- 공식 phase·실습·시험 완료는 이 기록만으로 변경하지 않음\n";
  return `${request.original || header}\n\n${section}`;
}

export async function publishCheckpoint(request: CheckpointRequest, input: unknown): Promise<CheckpointResult> {
  const record = validateCheckpointRecord(input);
  await safePath(request.projectRoot, request.chapterSlug);
  const current = await optionalText(request.checkpointPath);
  if (await git(request.repoRoot, "symbolic-ref", "--quiet", "--short", "HEAD") !== request.branch) throw new Error("준비 이후 브랜치가 변경됐습니다.");
  if (!request.savedDigest) {
    await cleanCheckpoint(request);
    if (current !== request.original || await git(request.repoRoot, "rev-parse", "HEAD") !== request.head) throw new Error("준비 이후 기록 또는 HEAD가 변경됐습니다.");
    if (await remoteHead(request) !== request.head) throw new Error("준비 이후 원격이 변경됐습니다. 다시 실행하세요.");
  } else if (digest(current) !== request.savedDigest) {
    throw new Error("저장 이후 checkpoint가 변경됐습니다. 자동 재시도를 중단합니다.");
  }
  const result: CheckpointResult = { path: request.checkpointPath, saved: !!request.savedDigest, commit: request.commit, pushed: false };
  try {
    if (!request.savedDigest) {
      const content = render(request, record);
      await writeFile(request.checkpointPath, content, "utf8");
      request.savedDigest = digest(content);
      result.saved = true;
    }
    if (!request.commit) {
      if (await git(request.repoRoot, "rev-parse", "HEAD") !== request.head) throw new Error("HEAD 변경으로 커밋 중단");
      await git(request.repoRoot, "add", "--", request.repoPath);
      await git(request.repoRoot, "commit", "--only", "-m", `docs(study): checkpoint ${request.chapterSlug}`, "--", request.repoPath);
      request.commit = await git(request.repoRoot, "rev-parse", "HEAD");
      result.commit = request.commit;
    }
    // Do not push earlier unpushed commits, hook-created changes, or a later unrelated commit.
    if (await git(request.repoRoot, "rev-parse", "HEAD") !== request.commit ||
        await git(request.repoRoot, "rev-parse", `${request.commit}^`) !== request.head ||
        await git(request.repoRoot, "diff-tree", "--no-commit-id", "--name-only", "-r", request.commit) !== request.repoPath ||
        digest(await optionalText(request.checkpointPath)) !== request.savedDigest) throw new Error("커밋 격리 검증 실패. 푸시하지 않습니다.");
    const remoteBefore = await remoteHead(request);
    if (remoteBefore !== request.head && remoteBefore !== request.commit) throw new Error("원격이 변경됐습니다. 강제 푸시하지 않습니다.");
    if (remoteBefore !== request.commit) await git(request.repoRoot, "push", request.remote, `${request.commit}:refs/heads/${request.remoteBranch}`);
    if (await remoteHead(request) !== request.commit) throw new Error("원격 커밋 검증 실패");
    result.pushed = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}
