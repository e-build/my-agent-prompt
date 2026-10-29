import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "./assessment-page.ts";

for (const kind of ["diagnosis", "test"] as const) {
  test(`${kind} rendering escapes labels and replaces question data only once`, async () => {
    assert.equal(typeof api.renderAssessmentPage, "function", "extract assessment rendering");
    const html = api.renderAssessmentPage(
      "{{CHAPTER_SLUG}}|{{CHAPTER_TITLE}}|{{PHASE}}|{{ASSESSMENT_KIND}}|{{ASSESSMENT_TITLE}}|{{ASSESSMENT_CONFIG_JSON}}|{{QUESTIONS_JSON}}|{{QUESTIONS_JSON}}",
      {
        kind,
        chapterSlug: "ch-01",
        chapterTitle: '<Title & "name">',
        phase: "<phase>",
        questionsJson: '{"questions":[]}',
      },
    );
    assert.match(html, /&lt;Title &amp; &quot;name&quot;&gt;/);
    assert.match(html, /&lt;phase&gt;/);
    assert.ok(html.includes(`"submissionKind":"study-${kind}-submission"`));
    assert.ok(html.endsWith('{"questions":[]}|{{QUESTIONS_JSON}}'));
  });
}
