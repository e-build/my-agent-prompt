import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import * as core from "./checkpoint-core.ts";
import { createEmptyChapterState, saveStudyState } from "./study-state.ts";

const record = {
  summary: "상황형 퀴즈로 개념 확인 중. 실행 검증 없음.",
  learningMode: "대화형 퀴즈, Mermaid 설명",
  topics: [{ topic: "TTL", status: "answer_verified", evidence: "학습자: 저장 시점부터 60초", takeaway: "만료와 갱신은 별개" }],
  remaining: ["부분 hit 코드 리뷰"],
  nextAction: "사용자의 진행 요청 후 부분 hit 리뷰",
  executionEvidence: "없음. 코드와 Redis 명령을 실행하지 않았음.",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function fixture(t: any) {
  const base = await mkdtemp(join(tmpdir(), "checkpoint-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const remote = join(base, "remote.git");
  const root = join(base, "study-cache");
  await mkdir(root);
  git(base, "init", "--bare", remote);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.invalid");
  await mkdir(join(root, "ch-01-cache"));
  await mkdir(join(root, "ch-02-pattern"));
  await writeFile(join(root, "ch-01-cache/README.md"), "# Cache\n");
  await writeFile(join(root, "ch-02-pattern/README.md"), "# Pattern\n");
  await saveStudyState(root, {
    version: 1, projectRoot: root, createdAt: "x", updatedAt: "x",
    activeChapter: "ch-02-pattern", activePhase: "concept",
    chapters: { "ch-01-cache": createEmptyChapterState(), "ch-02-pattern": createEmptyChapterState() },
  });
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-u", "origin", "main");
  return { root, remote };
}

test("checkpoint core exports required operations", () => {
  assert.equal(typeof core.prepareCheckpoint, "function");
  assert.equal(typeof core.publishCheckpoint, "function");
  assert.equal(typeof core.validateCheckpointRecord, "function");
});

test("active chapter is preferred without advancing or modifying study state", async t => {
  const { root } = await fixture(t);
  const before = await readFile(join(root, ".study/state.json"), "utf8");
  const request = await core.prepareCheckpoint(root, "");
  assert.equal(request.chapterSlug, "ch-02-pattern");
  assert.equal(request.phase, "concept");
  assert.equal(await readFile(join(root, ".study/state.json"), "utf8"), before);
  assert.equal((await core.prepareCheckpoint(root, "01")).chapterSlug, "ch-01-cache");
  await assert.rejects(core.prepareCheckpoint(root, "01 extra"), /인자/);
});

test("invalid records and unsupported evidence statuses are rejected", () => {
  assert.deepEqual(core.validateCheckpointRecord(record), record);
  assert.throws(() => core.validateCheckpointRecord({ ...record, nextAction: " " }), /nextAction/);
  assert.throws(() => core.validateCheckpointRecord({ ...record, topics: [{ ...record.topics[0], status: "completed" }] }), /status/);
  assert.throws(() => core.validateCheckpointRecord({ ...record, topics: [] }), /topics/);
});

test("publishes only checkpoint while preserving unrelated staged and unstaged changes", async t => {
  const { root, remote } = await fixture(t);
  await writeFile(join(root, "staged.txt"), "unrelated staged\n");
  git(root, "add", "staged.txt");
  await writeFile(join(root, "ch-01-cache/README.md"), "unrelated modification\n");
  const beforeState = await readFile(join(root, ".study/state.json"), "utf8");
  const request = await core.prepareCheckpoint(root, "");
  const result = await core.publishCheckpoint(request, record);
  assert.equal(result.saved, true);
  assert.equal(result.pushed, true);
  assert.equal(result.commit, git(remote, "rev-parse", "refs/heads/main"));
  assert.equal(git(root, "show", "--format=", "--name-only", "HEAD"), "ch-02-pattern/checkpoint.md");
  assert.equal(git(root, "diff", "--cached", "--name-only"), "staged.txt");
  assert.match(git(root, "diff", "--", "ch-01-cache/README.md"), /unrelated modification/);
  assert.equal(await readFile(join(root, ".study/state.json"), "utf8"), beforeState);
  const text = await readFile(join(root, "ch-02-pattern/checkpoint.md"), "utf8");
  assert.match(text, /answer_verified/);
  assert.match(text, /실행 검증 없음/);
});

test("appends snapshots without overwriting previous recall or duplicating a retry", async t => {
  const { root } = await fixture(t);
  const path = join(root, "ch-02-pattern/checkpoint.md");
  await writeFile(path, "# 기존 기록\n\n개인 회상 원문 보존\n");
  git(root, "add", "."); git(root, "commit", "-m", "old checkpoint"); git(root, "push");
  const request = await core.prepareCheckpoint(root, "");
  const first = await core.publishCheckpoint(request, record);
  const second = await core.publishCheckpoint(request, record);
  assert.equal(first.commit, second.commit);
  const text = await readFile(path, "utf8");
  assert.match(text, /개인 회상 원문 보존/);
  assert.equal(text.split(`<!-- checkpoint:${request.id} -->`).length - 1, 1);
});

test("dirty checkpoint is rejected before replacing any user content", async t => {
  const { root } = await fixture(t);
  const path = join(root, "ch-02-pattern/checkpoint.md");
  await writeFile(path, "unsaved user note\n");
  await assert.rejects(core.prepareCheckpoint(root, ""), /미커밋/);
  assert.equal(await readFile(path, "utf8"), "unsaved user note\n");
});

test("checkpoint changes after prepare are rejected", async t => {
  const { root } = await fixture(t);
  const request = await core.prepareCheckpoint(root, "");
  await writeFile(join(root, "ch-02-pattern/checkpoint.md"), "concurrent note\n");
  await assert.rejects(core.publishCheckpoint(request, record), /미커밋|변경/);
});

test("unpushed unrelated commits are rejected without pushing them", async t => {
  const { root, remote } = await fixture(t);
  const old = git(remote, "rev-parse", "refs/heads/main");
  await writeFile(join(root, "unrelated.txt"), "x");
  git(root, "add", "."); git(root, "commit", "-m", "unrelated");
  await assert.rejects(core.prepareCheckpoint(root, ""), /원격|미푸시/);
  assert.equal(git(remote, "rev-parse", "refs/heads/main"), old);
});

test("push failure preserves saved record and commit and supports push-only retry", async t => {
  const { root, remote } = await fixture(t);
  const request = await core.prepareCheckpoint(root, "");
  const hook = join(remote, "hooks/pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const failed = await core.publishCheckpoint(request, record);
  assert.equal(failed.saved, true);
  assert.equal(failed.pushed, false);
  assert.ok(failed.commit);
  assert.match(failed.error!, /push|拒|declined|rejected/i);
  await rm(hook);
  const retried = await core.publishCheckpoint(request, record);
  assert.equal(retried.pushed, true);
  assert.equal(retried.commit, failed.commit);
});
