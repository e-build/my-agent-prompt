import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testSession, testGrade, diagnosisSession } from "../support/fixtures.ts";
import {
  TEST_GRADE_START,
  TEST_GRADE_END,
  DIAGNOSIS_GRADE_START,
  DIAGNOSIS_GRADE_END,
} from "../../src/assessment/assessment-core.ts";
import * as api from "../../src/assessment/grade-handler.ts";

for (const kind of ["test", "diagnosis"]) {
  test(`${kind} grade handler persists only validated submitted sessions`, async (t) => {
    assert.equal(typeof api.createGradeHandler, "function", "extract grade message handling");
    const root = await mkdtemp(join(tmpdir(), "study-grade-handler-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const exam = testSession(root);
    const diagnosis = diagnosisSession(root);
    const session = kind === "test" ? exam : diagnosis;
    session.status = "submitted";
    const messages: string[] = [];
    const phases: unknown[][] = [];
    const handle = api.createGradeHandler({
      pi: { sendUserMessage: (text: string) => messages.push(text) },
      sessions: new Map(kind === "diagnosis" ? [[diagnosis.id, diagnosis]] : []),
      testSessions: new Map(kind === "test" ? [[exam.id, exam]] : []),
      updateProjectPhase: async (...args: unknown[]) => {
        phases.push(args);
      },
    });
    const start = kind === "test" ? TEST_GRADE_START : DIAGNOSIS_GRADE_START;
    const end = kind === "test" ? TEST_GRADE_END : DIAGNOSIS_GRADE_END;
    const grade =
      kind === "test"
        ? testGrade()
        : { ...testGrade(), kind: "study-diagnosis-grade", diagnosisId: "d1", level: "fast" };
    const content = (value: unknown) => `${start}\n${JSON.stringify(value)}\n${end}`;
    await handle({ role: "user", content: content(grade) });
    assert.equal(session.status, "submitted");
    await handle({ role: "assistant", content: content({ ...grade, results: [] }) });
    assert.equal(session.status, "submitted");
    assert.match(messages[0], /STUDY_GRADE_REPAIR_REQUIRED/);
    await handle({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "ignored" },
        { type: "text", text: content(grade) },
      ],
    });
    assert.equal(session.status, "graded");
    assert.equal(session.grade?.totalScore, 10);
    assert.equal(phases[0][3], "awaiting_review");
    const markdown = await readFile(
      join(root, "ch-01", kind === "test" ? "test.md" : "diagnosis.md"),
      "utf8",
    );
    assert.match(markdown, /10/);
    await handle({ role: "assistant", content: content(grade) });
    assert.equal(phases.length, 1);
  });
}
