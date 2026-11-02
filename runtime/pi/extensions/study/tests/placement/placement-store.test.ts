import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  finishPlacementRun,
  loadPlacement,
  preparePlacementQuestion,
  recordPlacementAnswerRun,
  startPlacement,
} from "../../src/placement/placement-store.ts";
import { tempDir, treeDigest } from "../support/workspace-fixture.ts";

const strands = [{ id: "shared", name: "공유 상태", why: "작업 큐의 전제" }];
const question = (requestId: string) => ({
  requestId,
  strandId: "shared",
  prompt: `${requestId} 질문`,
  scored: true as const,
  criteria: { answer: "A", acceptable: [], rubric: "A", conditions: [] },
});

async function project(t: Parameters<typeof tempDir>[0]) {
  const root = await tempDir(t, "study-placement-");
  const projectRoot = join(root, "study-java-threads");
  await mkdir(projectRoot, { recursive: true });
  return projectRoot;
}

test("an unregistered project directory can hold one placement run", async (t) => {
  const projectRoot = await project(t);
  assert.equal(await loadPlacement(projectRoot), null);
  const run = await startPlacement(projectRoot, { projectSlug: "study-java-threads", strands });
  assert.equal(run.status, "open");
  assert.equal(run.limit, 8);
  const stored = JSON.parse(await readFile(join(projectRoot, ".study", "placement.json"), "utf8"));
  assert.equal(stored.id, run.id);
  await assert.rejects(startPlacement(projectRoot, { projectSlug: "study-java-threads", strands }), /진행 중/);
});

test("prepare stores the hidden criteria first and returns only the public question", async (t) => {
  const projectRoot = await project(t);
  await startPlacement(projectRoot, { projectSlug: "study-java-threads", strands });
  const q = await preparePlacementQuestion(projectRoot, question("r1"));
  assert.match(q.id, /^q-[0-9a-f]{20}$/);
  assert.doesNotMatch(JSON.stringify(q), /criteria|rubric/);
  const stored = (await loadPlacement(projectRoot))!;
  assert.equal(stored.questions[0].criteria?.answer, "A");
  const again = await preparePlacementQuestion(projectRoot, question("r1"));
  assert.equal(again.id, q.id);
  assert.equal((await loadPlacement(projectRoot))!.questions.length, 1);
});

test("a rejected question leaves the file untouched", async (t) => {
  const projectRoot = await project(t);
  await startPlacement(projectRoot, { projectSlug: "study-java-threads", strands, limit: 1 });
  await preparePlacementQuestion(projectRoot, question("r1"));
  const before = await treeDigest(projectRoot);
  await assert.rejects(preparePlacementQuestion(projectRoot, question("r2")), /상한/);
  await assert.rejects(preparePlacementQuestion(projectRoot, { ...question("r3"), strandId: "nope" }), /갈래/);
  assert.equal(await treeDigest(projectRoot), before);
});

test("answers and the finish are appended to the same record", async (t) => {
  const projectRoot = await project(t);
  await startPlacement(projectRoot, { projectSlug: "study-java-threads", strands });
  const q = await preparePlacementQuestion(projectRoot, question("r1"));
  await recordPlacementAnswerRun(projectRoot, {
    questionId: q.id,
    response: "A",
    responseAnchor: "대화 2번째 메시지",
    assistance: "independent",
    result: "demonstrated",
    reason: "정답",
  });
  const done = await finishPlacementRun(projectRoot, {
    reason: "route_decided",
    route: { summary: "ch-01부터", startAt: "ch-01", focus: [], skip: ["shared"] },
    unverified: ["interrupt"],
  });
  assert.equal(done.status, "finished");
  const stored = (await loadPlacement(projectRoot))!;
  assert.equal(stored.answers.length, 1);
  assert.equal(stored.endReason, "route_decided");
  await assert.rejects(preparePlacementQuestion(projectRoot, question("r2")), /종료/);
});

test("corrupt records and missing runs fail loudly instead of being recreated", async (t) => {
  const projectRoot = await project(t);
  await assert.rejects(preparePlacementQuestion(projectRoot, question("r1")), /시작/);
  await mkdir(join(projectRoot, ".study"), { recursive: true });
  await writeFile(join(projectRoot, ".study", "placement.json"), "{broken");
  await assert.rejects(loadPlacement(projectRoot), /손상/);
  await assert.rejects(startPlacement(projectRoot, { projectSlug: "study-java-threads", strands }), /손상/);
});

test("writes through a symlinked .study directory are refused", async (t) => {
  const projectRoot = await project(t);
  const elsewhere = join(projectRoot, "..", "elsewhere");
  await mkdir(elsewhere, { recursive: true });
  await symlink(elsewhere, join(projectRoot, ".study"));
  await assert.rejects(startPlacement(projectRoot, { projectSlug: "study-java-threads", strands }), /심볼릭/);
});

test("a relative project root is rejected", async () => {
  await assert.rejects(startPlacement("study-java-threads", { projectSlug: "study-java-threads", strands }), /절대 경로/);
});
