import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyMigration, previewMigration, undoMigration } from "../../src/workspace/migration-plan.ts";
import { readWorkspace } from "../../src/workspace/workspace-root.ts";
import { tempDir, treeDigest } from "../support/workspace-fixture.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function chapterState(review: string, testStatus = "completed", updatedAt = "2026-08-18T07:06:17.220Z") {
  const phase = (status: string) => ({ status, updatedAt });
  return { diagnosis: phase("completed"), concept: phase("completed"), lab: phase("completed"), test: phase(testStatus), review: phase(review) };
}

/** Anonymised copy of the current study repository layout. */
async function legacyRepo(t: any) {
  const root = await tempDir(t, "study-migrate-");
  const redis = join(root, "study-redis-x");
  for (const ch of ["ch-01-a", "ch-02-b", "ch-03-c", "ch-04-d"]) {
    await mkdir(join(redis, ch, "review"), { recursive: true });
    await writeFile(join(redis, ch, "README.md"), `# ${ch}\n`);
  }
  await writeFile(
    join(redis, "ch-03-c", "review", "schedule.md"),
    "# 복습 일정\n\n## 고정 회차\n\n| 회차 | 예정일 | 상태 | 실제 수행일 | 기록 |\n|---|---|---|---|---|\n| R1 | 2026-10-02 | planned | - | - |\n",
  );
  await mkdir(join(redis, ".study"), { recursive: true });
  await writeFile(
    join(redis, ".study", "state.json"),
    JSON.stringify({
      version: 1,
      projectRoot: "/Users/other/study/study-redis-x",
      status: "closed",
      createdAt: "x",
      updatedAt: "x",
      chapters: {
        "ch-01-a": chapterState("not_started"),
        "ch-02-b": chapterState("not_started"),
        "ch-03-c": chapterState("skipped_understood"),
        "ch-04-d": chapterState("skipped_understood"),
      },
    }, null, 2),
  );
  const backend = join(root, "study-backend-y");
  await mkdir(join(backend, "ch-01-a", "review"), { recursive: true });
  await writeFile(join(backend, "ch-01-a", "review", "schedule.md"), "학습 후 생성\n");
  await mkdir(join(root, "backlog"), { recursive: true });
  await writeFile(join(root, "backlog", "SB-0001.md"), "x\n");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "add", ".");
  git(root, "commit", "-qm", "init");
  return { root, redis, backend };
}

test("preview is read-only and reports every legacy case without inventing schedules", async (t) => {
  const { root } = await legacyRepo(t);
  const before = await treeDigest(root);
  const preview = await previewMigration(root);
  assert.equal(await treeDigest(root), before);
  assert.equal(preview.gitClean, true);
  const redis = preview.projects.find((p) => p.slug === "study-redis-x")!;
  assert.deepEqual(redis.chapters.map((c) => [c.chapterSlug, c.action]), [
    ["ch-01-a", "manual_start_only"],
    ["ch-02-b", "manual_start_only"],
    ["ch-03-c", "keep_skipped"],
    ["ch-04-d", "keep_skipped"],
  ]);
  assert.ok(redis.chapters[0].notes.some((n) => /완료 시각.*신뢰/.test(n)));
  assert.ok(redis.chapters[2].notes.some((n) => /planned.*완료로 바꾸지/.test(n)));
  const backend = preview.projects.find((p) => p.slug === "study-backend-y")!;
  assert.deepEqual(backend.chapters.map((c) => c.action), ["nothing_to_migrate"]);
  assert.equal(preview.scheduleChanges, 0);
  assert.match(preview.digest, /^[0-9a-f]{16}$/);
});

test("apply needs the matching digest, a clean tree, and leaves originals byte-identical", async (t) => {
  const { root, redis } = await legacyRepo(t);
  const stateBefore = await readFile(join(redis, ".study", "state.json"), "utf8");
  const scheduleBefore = await readFile(join(redis, "ch-03-c", "review", "schedule.md"), "utf8");
  const preview = await previewMigration(root);
  await assert.rejects(applyMigration(root, { digest: "0000000000000000", approved: true }), /미리 보기/);
  await assert.rejects(applyMigration(root, { digest: preview.digest, approved: false }), /승인/);
  const result = await applyMigration(root, { digest: preview.digest, approved: true });
  assert.equal(result.status, "committed");
  assert.equal(await readFile(join(redis, ".study", "state.json"), "utf8"), stateBefore);
  assert.equal(await readFile(join(redis, "ch-03-c", "review", "schedule.md"), "utf8"), scheduleBefore);
  const workspace = await readWorkspace(root);
  assert.deepEqual(workspace.manifest.projects.map((p) => p.slug), ["study-backend-y", "study-redis-x"]);
  assert.match(await readFile(join(root, ".gitignore"), "utf8"), /\.study\/local\//);
  const { listSchedules } = await import("../../src/review/review-store.ts");
  assert.deepEqual(await listSchedules(root), []);
});

test("a dirty working tree blocks apply but not preview", async (t) => {
  const { root, redis } = await legacyRepo(t);
  await writeFile(join(redis, ".study", "state.json"), "{\"changed\":true}");
  const preview = await previewMigration(root);
  assert.equal(preview.gitClean, false);
  assert.match(preview.blockers.join("\n"), /커밋되지 않은 변경/);
  await assert.rejects(applyMigration(root, { digest: preview.digest, approved: true }), /커밋되지 않은 변경/);
});

test("undo removes only what the migration added when nothing changed since", async (t) => {
  const { root } = await legacyRepo(t);
  const before = await treeDigest(root);
  const preview = await previewMigration(root);
  const applied = await applyMigration(root, { digest: preview.digest, approved: true });
  await undoMigration(root, applied.migrationId);
  const { rm, rmdir } = await import("node:fs/promises");
  await rm(join(root, ".study", "local"), { recursive: true, force: true });
  await rmdir(join(root, ".study"));
  assert.equal(await treeDigest(root), before);
});

test("undo refuses when files were changed after the migration", async (t) => {
  const { root } = await legacyRepo(t);
  const preview = await previewMigration(root);
  const applied = await applyMigration(root, { digest: preview.digest, approved: true });
  await writeFile(join(root, ".gitignore"), "edited\n");
  await assert.rejects(undoMigration(root, applied.migrationId), /이후 변경/);
});
