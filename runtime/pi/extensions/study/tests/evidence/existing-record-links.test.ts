import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { linkExistingRecord, listRecordLinks } from "../../src/evidence/existing-record-links.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";

async function lab(root: string) {
  const dir = join(root, "study-alpha", "ch-01-intro", "lab");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "results.md"), "# 결과\n\n- Step ID: `s1`\n- 관찰: 만료 확인\n");
  return dir;
}

test("links a lab step by anchor and digest without copying the record", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  const dir = await lab(root);
  const link = await linkExistingRecord(root, {
    linkId: "lab-s1",
    projectSlug: "study-alpha",
    chapterSlug: "ch-01-intro",
    kind: "lab",
    recordPath: "ch-01-intro/lab/results.md",
    anchor: "s1",
    assistance: "explained",
    refs: [refA],
  });
  assert.equal(link.assistance, "explained");
  assert.match(link.digest, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(link).includes("만료 확인"), false);
  assert.equal(await readFile(join(dir, "results.md"), "utf8"), "# 결과\n\n- Step ID: `s1`\n- 관찰: 만료 확인\n");
  assert.equal((await listRecordLinks(root, "study-alpha", "ch-01-intro")).length, 1);
});

test("agent-assisted labs are never recorded as independent", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  await lab(root);
  await assert.rejects(
    linkExistingRecord(root, { linkId: "x", projectSlug: "study-alpha", chapterSlug: "ch-01-intro", kind: "lab", recordPath: "ch-01-intro/lab/results.md", anchor: "s1", assistance: "independent", refs: [refA], agentAuthored: true }),
    /독립/,
  );
});

test("rejects missing anchors, paths outside the project and unknown kinds", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  await lab(root);
  const base = { linkId: "y", projectSlug: "study-alpha", chapterSlug: "ch-01-intro", kind: "lab" as const, assistance: "unknown" as const, refs: [refA] };
  await assert.rejects(linkExistingRecord(root, { ...base, recordPath: "ch-01-intro/lab/results.md", anchor: "s9" }), /찾지 못했습니다/);
  await assert.rejects(linkExistingRecord(root, { ...base, recordPath: "../README.md", anchor: "s1" }), /경로/);
  await assert.rejects(linkExistingRecord(root, { ...base, kind: "chat" as any, recordPath: "ch-01-intro/lab/results.md", anchor: "s1" }), /kind/);
});

test("retrying the same link is idempotent", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  await lab(root);
  const input = { linkId: "lab-s1", projectSlug: "study-alpha", chapterSlug: "ch-01-intro", kind: "lab" as const, recordPath: "ch-01-intro/lab/results.md", anchor: "s1", assistance: "hinted" as const, refs: [refA] };
  await linkExistingRecord(root, input);
  await linkExistingRecord(root, input);
  assert.equal((await listRecordLinks(root, "study-alpha", "ch-01-intro")).length, 1);
});
