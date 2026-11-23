import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlannotatorChannel, renderInbox } from "../../src/channel/plannotator-channel.ts";
import type { LearningCard, QuestionCard } from "../../src/channel/channel.ts";

const card: QuestionCard = {
  kind: "question",
  id: "c-1",
  projectSlug: "study-ansi-sql",
  chapterSlug: "ch-01-null",
  purpose: "test",
  askConfidence: true,
  items: [
    { id: "q1", prompt: "NULL = NULL의 결과는?", choices: ["TRUE", "FALSE", "UNKNOWN"] },
    { id: "q2", prompt: "어떤 행이 남나요?", choices: ["1", "2"], multi: true },
    { id: "q3", prompt: "이유를 설명하세요.", context: "WHERE 절 기준으로." },
  ],
};

function fakeExec(result: { code: number; stdout: string; stderr?: string }) {
  const calls: Array<{ command: string; args: string[]; input?: string }> = [];
  return {
    calls,
    exec: async (command: string, args: string[], input?: string) => {
      calls.push({ command, args, input });
      return { code: result.code, stdout: result.stdout, stderr: result.stderr ?? "" };
    },
  };
}

const ok = () => fakeExec({ code: 0, stdout: JSON.stringify({ message_id: "msg_1" }) });

test("renderInbox maps items to question blocks with markers and one confidence block", () => {
  const body = renderInbox(card);
  assert.match(body, /:::question\nNULL = NULL의 결과는\? \[c-1\/q1\]\n\n- \[ \] TRUE/);
  assert.match(body, /:::question-multi\n어떤 행이 남나요\? \[c-1\/q2\]/);
  assert.match(body, /:::question-text\n이유를 설명하세요\. \[c-1\/q3\]\n\nWHERE 절 기준으로\.\n:::/);
  assert.equal(body.match(/:::question-text\n확신도/g)?.length, 1);
  assert.match(body, /\[c-1\/confidence\]/);
});

test("deliver sends to the chapter thread with the card id as idempotency key", async () => {
  const fake = ok();
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "sess-1", cwd: "/p" });
  const delivery = await channel.deliver(card);
  assert.equal(delivery.ref, "plannotator:msg_1");
  assert.equal(delivery.publicText, renderInbox(card));
  const [call] = fake.calls;
  assert.equal(call.command, "plannotator");
  assert.deepEqual(call.args, ["inbox", "call", "--session", "sess-1", "send_message", "-"]);
  const payload = JSON.parse(call.input!);
  assert.equal(payload.thread, "study · study-ansi-sql · ch-01-null");
  assert.equal(payload.idempotency_key, "study-c-1");
  assert.equal(payload.project_path, "/p");
  assert.equal(payload.attachments, undefined);
});

test("lesson cards attach their files", async () => {
  const fake = ok();
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "s", cwd: "/p" });
  const lesson: LearningCard = {
    kind: "lesson",
    id: "c-2",
    projectSlug: "p",
    chapterSlug: "ch-01",
    title: "3값 논리",
    summary: "s",
    attachments: ["/p/ch-01/concepts/01-a.md"],
  };
  await channel.deliver(lesson);
  const payload = JSON.parse(fake.calls[0].input!);
  assert.deepEqual(payload.attachments, ["/p/ch-01/concepts/01-a.md"]);
  assert.equal(payload.subject, "3값 논리");
});

test("a failed send throws with the CLI error so the caller can fall back", async () => {
  const fake = fakeExec({ code: 1, stdout: "", stderr: "inbox_off: the Inbox is off\n" });
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "s", cwd: "/p" });
  await assert.rejects(channel.deliver(card), /inbox_off: the Inbox is off$/);
});

test("a reply without message_id is a failure", async () => {
  const fake = fakeExec({ code: 0, stdout: "{}" });
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "s", cwd: "/p" });
  await assert.rejects(channel.deliver(card), /message_id/);
});

test("placement questions and their explanations share one project thread", async () => {
  const fake = ok();
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "s", cwd: "/p" });
  await channel.deliver({ ...card, chapterSlug: undefined, purpose: "placement" });
  await channel.deliver({ kind: "notice", id: "c-n", projectSlug: "study-ansi-sql", title: "1번 해설", body: "b" });
  const threads = fake.calls.map((call) => JSON.parse(call.input!).thread);
  assert.deepEqual(threads, ["study · study-ansi-sql · init", "study · study-ansi-sql · init"]);
});

test("available reflects the inbox status command", async () => {
  const up = createPlannotatorChannel({ exec: ok().exec, sessionId: () => "s", cwd: "/p" });
  assert.equal(await up.available(), true);
  const down = fakeExec({ code: 1, stdout: "" });
  const off = createPlannotatorChannel({ exec: down.exec, sessionId: () => "s", cwd: "/p" });
  assert.equal(await off.available(), false);
  assert.deepEqual(down.calls[0].args, ["inbox", "status", "--json"]);
});
