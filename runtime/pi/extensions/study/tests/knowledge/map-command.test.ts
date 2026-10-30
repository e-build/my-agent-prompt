import { test } from "node:test";
import assert from "node:assert/strict";
import { createKnowledgeMapStore } from "../../src/bridge/knowledge-routes.ts";
import { mapCompletions, openKnowledgeMap } from "../../src/knowledge/map-command.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";
import { tempDir, treeDigest } from "../support/workspace-fixture.ts";

test("opens a read-only snapshot without writing study files", async (t) => {
  const { root } = await knowledgeWorkspace(t);
  const store = createKnowledgeMapStore();
  const opened: string[] = [];
  const before = await treeDigest(root);
  const url = await openKnowledgeMap(root, "", { store, startServer: async () => 4321, openBrowser: (u) => opened.push(u) });
  assert.match(url, /^http:\/\/127\.0\.0\.1:4321\/knowledge\/[a-f0-9]{16}$/);
  assert.deepEqual(opened, [url]);
  assert.match(store.get(url.split("/").pop()!)!, /지식 그래프/);
  assert.equal(await treeDigest(root), before);
});

test("an unregistered directory reports registration instead of opening", async (t) => {
  const dir = await tempDir(t);
  await assert.rejects(
    openKnowledgeMap(dir, "", { store: createKnowledgeMapStore(), startServer: async () => 1, openBrowser: () => assert.fail() }),
    /study-workspace init/,
  );
});

test("completes knowledge by name and returns its ID as the value", async (t) => {
  const { root, a } = await knowledgeWorkspace(t);
  const items = (await mapCompletions(root, "TT"))!;
  assert.deepEqual(items.map((i) => [i.value, i.label]), [[a.id, "TTL"]]);
  assert.equal(await mapCompletions(root, "TTL extra"), null);
  assert.equal(await mapCompletions(await tempDir(t), ""), null);
});
