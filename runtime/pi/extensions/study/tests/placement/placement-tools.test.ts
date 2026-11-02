import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PLACEMENT_GUIDELINES, runPlacementAction, type PlacementAction } from "../../src/placement/placement-actions.ts";
import { tempDir } from "../support/workspace-fixture.ts";

async function project(t: Parameters<typeof tempDir>[0]) {
  const root = await tempDir(t, "study-placement-tool-");
  const projectRoot = join(root, "study-java-threads");
  await mkdir(projectRoot, { recursive: true });
  const call = (action: PlacementAction, payload?: unknown) =>
    runPlacementAction(action, projectRoot, payload === undefined ? undefined : JSON.stringify(payload));
  return { call, projectRoot };
}

test("the tool runs start → prepare → get → record → finish without exposing criteria", async (t) => {
  const { call } = await project(t);
  assert.ok(PLACEMENT_GUIDELINES.join("\n").includes("채점 기준"));
  const none = await call("get");
  assert.match(none.text, /없습니다/);
  const started = await call("start", { projectSlug: "study-java-threads", strands: [{ id: "shared", name: "공유 상태", why: "전제" }] });
  assert.match(started.text, /상한 8/);
  const q = await call("prepare", {
    requestId: "r1",
    strandId: "shared",
    prompt: "count++ 두 스레드 결과는?",
    scored: true,
    criteria: { answer: "ANSWER-KEY", acceptable: [], rubric: "r", conditions: [] },
  });
  assert.equal(JSON.stringify(q).includes("ANSWER-KEY"), false);
  assert.match(q.text, /확신도\(0~10\)/);
  assert.ok(PLACEMENT_GUIDELINES.some((g) => /학습자가 직접 말한/.test(g)));
  const view = await call("get");
  assert.equal(JSON.stringify(view).includes("ANSWER-KEY"), false);
  assert.equal((view.details as any).questions.length, 1);
  const recorded = await call("record", {
    questionId: (q.details as any).id,
    response: "모름",
    responseAnchor: "대화 4번째 메시지",
    assistance: "independent",
    result: "unverified",
  });
  assert.match(recorded.text, /unverified/);
  const done = await call("finish", {
    reason: "route_decided",
    route: { summary: "ch-01부터", startAt: "ch-01", focus: ["shared"], skip: [] },
    unverified: ["count++ 유실"],
  });
  assert.match(done.text, /route_decided/);
  assert.match(done.text, /미확인 1건/);
});

test("the tool rejects bad input before touching the file", async (t) => {
  const { call, projectRoot } = await project(t);
  await assert.rejects(call("start"), /payloadJson/);
  await assert.rejects(runPlacementAction("start", projectRoot, "{"), /올바른 JSON/);
  await assert.rejects(runPlacementAction("get", "relative/path"), /절대 경로/);
  await assert.rejects(call("prepare", { requestId: "r1", strandId: "x", prompt: "?", scored: false }), /시작/);
});
