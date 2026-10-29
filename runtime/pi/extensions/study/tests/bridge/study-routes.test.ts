import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnosisSession, testSession, testGrade } from "../support/fixtures.ts";
import { validateTestGrade } from "../../src/assessment/assessment-grade.ts";
import { loadStudyState } from "../../src/session/study-state.ts";

import * as api from "../../src/bridge/study-routes.ts";

for (const mode of ["passed", "failed", "missing-evidence", "navigation-warning"] as const) {
  test(`test acknowledgment preserves ${mode} completion behavior`, async (t) => {
    const h = await harness(t);
    const root = h.exam.projectRoot;
    const chapter = join(root, "ch-01");
    await mkdir(join(chapter, "lab"), { recursive: true });
    await mkdir(join(chapter, "review"));
    await mkdir(join(root, ".study", "assessments"), { recursive: true });
    await writeFile(join(chapter, "README.md"), "# Chapter\n## 개념 학습 노트\n내용\n");
    await writeFile(join(chapter, "test.md"), "## Attempt 1\nPASSED\n");
    await writeFile(
      join(chapter, "lab", "manifest.json"),
      JSON.stringify({ steps: [{ id: "s1", status: "completed" }] }),
    );
    await writeFile(
      join(chapter, "lab", "results.md"),
      mode === "missing-evidence" ? "missing\n" : "- Step ID: `s1`\n",
    );
    if (mode === "navigation-warning")
      await writeFile(join(chapter, "review", "README.md"), "# Personal notes\n");
    await writeFile(
      join(root, ".study", "assessments", "t1.json"),
      JSON.stringify({ kind: "test" }),
    );
    const raw = testGrade();
    if (mode === "failed") {
      raw.totalScore = 0;
      raw.results[0].score = 0;
      raw.results[0].status = "wrong";
    }
    h.exam.grade = validateTestGrade(raw, h.exam.id, h.exam.questionSet);
    h.exam.status = "graded";
    assert.equal((await h.request("/api/study-test/t1/ack", "{")).status, 400);
    assert.equal(h.exam.status, "graded");
    assert.equal((await h.request("/api/study-test/t1/ack", "")).status, 200);
    assert.equal(h.exam.status, "acknowledged");
    const record = JSON.parse(
      await readFile(join(root, ".study", "assessments", "t1.json"), "utf8"),
    );
    assert.equal(typeof record.acknowledgedAt, "string");
    const status = (await loadStudyState(root)).chapters["ch-01"].test.status;
    assert.equal(
      status,
      mode === "failed"
        ? "relearn_required"
        : mode === "missing-evidence"
          ? "blocked"
          : "completed",
    );
    assert.match(h.messages.at(-1)!, /TEST_RESULTS_REVIEWED/);
    if (mode === "passed") assert.match(h.messages[0], /STUDY_REVIEW_READY/);
    if (mode === "missing-evidence") assert.match(h.messages[0], /STUDY_EVIDENCE_REQUIRED/);
    if (mode === "navigation-warning") assert.match(h.messages[0], /STUDY_REVIEW_PAGE_WARNING/);
    assert.equal((await h.request("/api/study-test/t1/ack", "{}")).status, 409);
  });
}

async function harness(t: TestContext) {
  assert.equal(typeof api.createStudyRoutes, "function", "extract HTTP study routes");
  const { createBrowserServer } = await import("../../src/bridge/browser-server.ts");
  const root = await mkdtemp(join(tmpdir(), "study-routes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const diagnosis = diagnosisSession(root);
  const exam = testSession(root);
  exam.htmlPath = join(root, "test.html");
  await writeFile(diagnosis.htmlPath, "<html><head></head><body>Diagnosis</body></html>");
  await writeFile(exam.htmlPath, "Test without head");
  const sessions = new Map([[diagnosis.id, diagnosis]]);
  const testSessions = new Map([[exam.id, exam]]);
  const curriculum = {
    id: "c1",
    htmlPath: diagnosis.htmlPath,
    projectRoot: root,
    projectSlug: "study",
    topic: "Topic",
    createdAt: 0,
    status: "open" as const,
  };
  const curriculumSessions = new Map([[curriculum.id, curriculum]]);
  const messages: string[] = [];
  const phases: unknown[][] = [];
  const routes = api.createStudyRoutes({
    pi: { sendUserMessage: (message: string) => messages.push(message) },
    sessions,
    testSessions,
    curriculumSessions,
    updateProjectPhase: async (...args: unknown[]) => {
      phases.push(args);
    },
    getPort: () => server.port,
  });
  const server = createBrowserServer(routes);
  const port = await server.start();
  t.after(() => server.close());
  const request = (path: string, body?: string) =>
    fetch(`http://127.0.0.1:${port}${path}`, body === undefined ? {} : { method: "POST", body });
  return { request, diagnosis, exam, messages, phases, curriculum };
}

test("routes preserve HTML bridge globals for diagnosis, test and curriculum", async (t) => {
  const h = await harness(t);
  for (const [kind, id, marker] of [
    ["diagnosis", "d1", "DIAGNOSIS"],
    ["test", "t1", "TEST"],
    ["curriculum", "c1", "CURRICULUM"],
  ]) {
    const result = await h.request(`/${kind}/${id}`);
    assert.equal(result.status, 200);
    const html = await result.text();
    assert.ok(html.includes(`window.${marker}_ID=`));
    assert.ok(html.includes(`/api/study-${kind}/${id}/`));
  }
});

test("routes preserve unknown paths, sessions and preflight responses", async (t) => {
  const h = await harness(t);
  assert.equal((await h.request("/test/missing")).status, 404);
  const unknown = await h.request("/missing");
  assert.deepEqual(await unknown.json(), { error: "Not found", path: "/missing" });
  const options = await h.request("/test/t1");
  const preflight = await fetch(options.url, { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
});

for (const kind of ["diagnosis", "test"]) {
  test(`${kind} routes reject invalid JSON and duplicate submissions`, async (t) => {
    const h = await harness(t);
    const session = kind === "test" ? h.exam : h.diagnosis;
    const path = `/api/study-${kind}/${session.id}`;
    assert.equal((await h.request(`${path}/submit`, "{")).status, 400);
    assert.equal(session.status, "open");
    assert.equal((await h.request(`${path}/ack`, "{}")).status, 409);
    assert.equal((await h.request(`${path}/submit`, '{"answers":[]}')).status, 200);
    assert.equal(session.status, "submitted");
    assert.equal(h.messages.length, 1);
    assert.equal(h.phases[0][3], "awaiting_grade");
    assert.equal((await h.request(`${path}/submit`, "{}")).status, 409);
    assert.deepEqual(await (await h.request(`${path}/result`)).json(), {
      status: "submitted",
      grade: null,
    });
  });
}

test("diagnosis acknowledgment completes the phase and delivers concept instructions", async (t) => {
  const h = await harness(t);
  h.diagnosis.status = "graded";
  assert.equal((await h.request("/api/study-diagnosis/d1/ack", "")).status, 200);
  assert.equal(h.diagnosis.status, "acknowledged");
  assert.equal(h.phases[0][3], "completed");
  assert.match(h.messages[0], /DIAGNOSIS_RESULTS_REVIEWED/);
  assert.equal((await h.request("/api/study-diagnosis/d1/ack", "{}")).status, 409);
});

test("curriculum approval and revision retain their message contracts", async (t) => {
  const h = await harness(t);
  assert.equal((await h.request("/api/study-curriculum/c1/ack", "{")).status, 400);
  assert.equal((await h.request("/api/study-curriculum/c1/ack", "")).status, 200);
  assert.equal(h.curriculum.status, "reviewed");
  assert.match(h.messages[0], /CURRICULUM_REVIEWED/);
  assert.equal(
    (await h.request("/api/study-curriculum/c1/revision", '{"comment":"adjust"}')).status,
    200,
  );
  assert.equal(h.curriculum.status, "revision_requested");
  assert.match(h.messages[1], /CURRICULUM_REVISION_REQUESTED/);
});
