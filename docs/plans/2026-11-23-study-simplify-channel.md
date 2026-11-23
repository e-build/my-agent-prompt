# study extension 단순화 구현 계획

> **Implement task-by-task with the test-driven-development skill.**

**Goal:** study extension을 채널 포트(chat·plannotator) 위에서 동작하는 `init → concept → lab → test → review` 흐름으로 다시 만들고, book·knowledge·브라우저·챕터 진단을 없앤다.

**Architecture:** 설계 문서 `docs/plans/2026-11-23-study-simplify-channel-design.md`를 따른다. 새 코어(`channel/ prompts/ cards/ flow/ review/ state/ ui/`)를 기존 extension 옆의 임시 디렉터리 `runtime/pi/extensions/study/next/`에 만들고, Phase 4에서 한 커밋으로 교체한다. 그동안 기존 extension은 그대로 동작한다.

**Tech Stack:** TypeScript (Node 24 type stripping), `node:test`, Pi Extension API(`registerTool`, `registerCommand`, `exec`, `sendUserMessage`), `typebox`, Plannotator CLI(`plannotator inbox call`).

**공통 규칙**
- 테스트 실행: `cd runtime/pi/extensions/study && NODE_PATH="$(npm root -g)" node --test 'next/tests/**/*.test.ts'`
- 포맷: `.prettierrc.json`(2칸, 폭 100). 주석은 `<comment_rules>`를 따른다.
- 각 Task 끝에 커밋. 메시지는 `feat(study-next): …`.
- 임시 경로 `next/`는 Phase 4에서 `src/`·`tests/`·`prompts/`로 이동한다. 그래서 `next/` 안의 import는 모두 상대 경로로 쓴다.

---

## Phase 0. 위험 확인 (구현 전)

### Task 0: Plannotator 답장이 extension이 보낸 세션으로 돌아오는지 확인

**TDD scenario:** 수동 검증 (코드 없음)

**Step 1:** 현재 Pi 세션에서 bash로 실행한다.

```bash
echo '{"thread":"study · probe","body":":::question-text\n확인용 질문입니다. 아무 글자나 답해 주세요. [probe/q1]\n:::","idempotency_key":"study-probe-1"}' \
  | plannotator inbox call --session "$PI_SESSION_ID" send_message -
```

Expected: exit 0, stdout JSON에 `message_id`.

**Step 2:** 사용자에게 Inbox에서 답하게 하고, 세션에 `Plannotator Inbox: study · probe (…)` 메시지가 들어오는지 본다.

**Step 3:** 결과에 따라 결정을 기록한다.
- 돌아옴 → 어댑터는 `pi.exec` + `--session <ctx.sessionManager.getSessionId()>` 방식(계획 그대로).
- 안 돌아옴 → 어댑터가 `publicText`(Inbox 마크다운)와 `deliverVia: "agent-tool"`을 돌려주고 에이전트가 `plannotator_inbox` 도구로 보낸 뒤 `study_card_ref`로 ref만 기록하는 방식으로 Task 3을 바꾼다. 포트 인터페이스는 같다.

**Step 4:** 결과를 이 문서 맨 아래 `## 검증 기록`에 한 줄로 남기고 커밋.

```bash
git add docs/plans/2026-11-23-study-simplify-channel.md
git commit -m "docs(study): record the plannotator reply-routing probe"
```

---

## Phase 1. 코어 (채널·카드·지침)

### Task 1: 카드 타입과 Channel 포트, chat 어댑터

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/channel/channel.ts`
- Create: `next/src/channel/chat-channel.ts`
- Create: `next/src/channel/render-card.ts`
- Test: `next/tests/channel/chat-channel.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatChannel } from "../../src/channel/chat-channel.ts";
import type { LearningCard } from "../../src/channel/channel.ts";

const question: LearningCard = {
  kind: "question",
  id: "c-1",
  projectSlug: "p",
  chapterSlug: "ch-01-a",
  purpose: "test",
  askConfidence: true,
  items: [
    { id: "q1", prompt: "NULL = NULL의 결과는?", choices: ["TRUE", "FALSE", "UNKNOWN"] },
    { id: "q2", prompt: "COUNT(col)과 COUNT(*)의 차이를 설명하세요." },
  ],
};

test("chat channel renders every item with its marker and asks confidence once", async () => {
  const channel = createChatChannel();
  const { ref, publicText } = await channel.deliver(question);
  assert.equal(ref, "chat:c-1");
  assert.match(publicText, /NULL = NULL의 결과는\? \[c-1\/q1\]/);
  assert.match(publicText, /- TRUE/);
  assert.match(publicText, /\[c-1\/q2\]/);
  assert.equal(publicText.match(/확신도\(0~10\)/g)?.length, 1);
});

test("chat channel is always available", async () => {
  assert.equal(await createChatChannel().available(), true);
});

test("lesson cards list their attachments", async () => {
  const { publicText } = await createChatChannel().deliver({
    kind: "lesson", id: "c-2", projectSlug: "p", chapterSlug: "ch-01-a",
    title: "3값 논리", summary: "UNKNOWN이 생기는 이유", attachments: ["ch-01-a/concepts/01-three-valued.md"],
  });
  assert.match(publicText, /3값 논리/);
  assert.match(publicText, /ch-01-a\/concepts\/01-three-valued\.md/);
});
```

**Step 2:** `NODE_PATH="$(npm root -g)" node --test next/tests/channel/chat-channel.test.ts` → FAIL (모듈 없음)

**Step 3: 구현**

`next/src/channel/channel.ts`
```ts
export type QuestionItem = {
  id: string;
  prompt: string;
  context?: string;
  choices?: string[];
  multi?: boolean;
  maxScore?: number;
};

type CardBase = { id: string; projectSlug: string; chapterSlug?: string };

export type QuestionPurpose = "placement" | "concept-check" | "test" | "review";

export type LearningCard =
  | (CardBase & { kind: "question"; purpose: QuestionPurpose; items: QuestionItem[]; askConfidence: boolean })
  | (CardBase & { kind: "lesson"; title: string; summary: string; attachments: string[] })
  | (CardBase & { kind: "notice"; title: string; body: string });

export type Delivery = { ref: string; publicText: string; fallback?: string };

/** Sends cards to the learner. Adapters never read replies; the agent records them. */
export interface Channel {
  id: string;
  available(): Promise<boolean>;
  deliver(card: LearningCard): Promise<Delivery>;
}

export const itemMarker = (cardId: string, itemId: string) => `[${cardId}/${itemId}]`;
```

`next/src/channel/render-card.ts`
```ts
import { itemMarker, type LearningCard } from "./channel.ts";

export const CONFIDENCE_LINE = "답과 함께 확신도(0~10)도 적어 주세요.";

/** Plain markdown used by the chat adapter and as the public text of every delivery. */
export function renderPlain(card: LearningCard): string {
  if (card.kind === "notice") return `### ${card.title}\n\n${card.body}`;
  if (card.kind === "lesson")
    return [`### ${card.title}`, "", card.summary, "", ...card.attachments.map((p) => `- ${p}`)].join("\n");
  const lines: string[] = [];
  for (const item of card.items) {
    lines.push(`**${item.prompt}** ${itemMarker(card.id, item.id)}`);
    if (item.context) lines.push("", item.context);
    if (item.choices?.length) lines.push("", ...item.choices.map((c) => `- ${c}`));
    lines.push("");
  }
  if (card.askConfidence) lines.push(CONFIDENCE_LINE);
  return lines.join("\n").trim();
}
```

`next/src/channel/chat-channel.ts`
```ts
import type { Channel } from "./channel.ts";
import { renderPlain } from "./render-card.ts";

export function createChatChannel(): Channel {
  return {
    id: "chat",
    available: async () => true,
    deliver: async (card) => ({ ref: `chat:${card.id}`, publicText: renderPlain(card) }),
  };
}
```

**Step 4:** 같은 명령 → PASS

**Step 5:**
```bash
git add next/src/channel next/tests/channel
git commit -m "feat(study-next): add the learning card, channel port and chat adapter"
```

### Task 2: plannotator 어댑터

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/channel/plannotator-channel.ts`
- Test: `next/tests/channel/plannotator-channel.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlannotatorChannel, renderInbox } from "../../src/channel/plannotator-channel.ts";
import type { LearningCard } from "../../src/channel/channel.ts";

const card: LearningCard = {
  kind: "question", id: "c-1", projectSlug: "study-ansi-sql", chapterSlug: "ch-01-null",
  purpose: "test", askConfidence: true,
  items: [
    { id: "q1", prompt: "NULL = NULL의 결과는?", choices: ["TRUE", "FALSE", "UNKNOWN"] },
    { id: "q2", prompt: "어떤 행이 남나요?", choices: ["1", "2"], multi: true },
    { id: "q3", prompt: "이유를 설명하세요." },
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

test("renderInbox maps items to question blocks with markers and one confidence block", () => {
  const body = renderInbox(card);
  assert.match(body, /:::question\nNULL = NULL의 결과는\? \[c-1\/q1\]\n\n- \[ \] TRUE/);
  assert.match(body, /:::question-multi\n어떤 행이 남나요\? \[c-1\/q2\]/);
  assert.match(body, /:::question-text\n이유를 설명하세요\. \[c-1\/q3\]/);
  assert.equal(body.match(/:::question-text\n확신도/g)?.length, 1);
});

test("deliver sends one chapter thread with the card id as idempotency key", async () => {
  const fake = fakeExec({ code: 0, stdout: JSON.stringify({ message_id: "msg_1", thread_id: "t_1" }) });
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "sess-1", cwd: "/p" });
  const delivery = await channel.deliver(card);
  assert.equal(delivery.ref, "plannotator:msg_1");
  const [call] = fake.calls;
  assert.equal(call.command, "plannotator");
  assert.deepEqual(call.args, ["inbox", "call", "--session", "sess-1", "send_message", "-"]);
  const payload = JSON.parse(call.input!);
  assert.equal(payload.thread, "study · study-ansi-sql · ch-01-null");
  assert.equal(payload.idempotency_key, "study-c-1");
  assert.equal(payload.project_path, "/p");
});

test("lesson cards attach their files", async () => {
  const fake = fakeExec({ code: 0, stdout: JSON.stringify({ message_id: "m" }) });
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "s", cwd: "/p" });
  await channel.deliver({ kind: "lesson", id: "c-2", projectSlug: "p", chapterSlug: "ch-01",
    title: "t", summary: "s", attachments: ["/p/ch-01/concepts/01-a.md"] });
  assert.deepEqual(JSON.parse(fake.calls[0].input!).attachments, ["/p/ch-01/concepts/01-a.md"]);
});

test("a failed send throws with the CLI error so the caller can fall back", async () => {
  const fake = fakeExec({ code: 1, stdout: "", stderr: "inbox_off: the Inbox is off" });
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "s", cwd: "/p" });
  await assert.rejects(channel.deliver(card), /inbox_off/);
});

test("placement cards use the placement thread", async () => {
  const fake = fakeExec({ code: 0, stdout: JSON.stringify({ message_id: "m" }) });
  const channel = createPlannotatorChannel({ exec: fake.exec, sessionId: () => "s", cwd: "/p" });
  await channel.deliver({ ...card, chapterSlug: undefined, purpose: "placement" });
  assert.equal(JSON.parse(fake.calls[0].input!).thread, "study · study-ansi-sql · placement");
});
```

**Step 2:** `node --test next/tests/channel/plannotator-channel.test.ts` → FAIL

**Step 3: 구현**

```ts
import { itemMarker, type Channel, type LearningCard } from "./channel.ts";
import { renderPlain } from "./render-card.ts";

export type ExecWithInput = (
  command: string,
  args: string[],
  input?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export function renderInbox(card: LearningCard): string {
  if (card.kind !== "question") return renderPlain(card);
  const blocks = card.items.map((item) => {
    const kind = !item.choices?.length ? "question-text" : item.multi ? "question-multi" : "question";
    const lines = [`:::${kind}`, `${item.prompt} ${itemMarker(card.id, item.id)}`];
    if (item.context) lines.push("", item.context);
    if (item.choices?.length) lines.push("", ...item.choices.map((c) => `- [ ] ${c}`));
    lines.push(":::");
    return lines.join("\n");
  });
  if (card.askConfidence)
    blocks.push(`:::question-text\n확신도(0~10)를 숫자로 적어 주세요. ${itemMarker(card.id, "confidence")}\n:::`);
  return blocks.join("\n\n");
}

function threadName(card: LearningCard): string {
  const scope = card.chapterSlug ?? (card.kind === "question" && card.purpose === "placement" ? "placement" : "project");
  return `study · ${card.projectSlug} · ${scope}`;
}

export function createPlannotatorChannel(deps: {
  exec: ExecWithInput;
  sessionId: () => string;
  cwd: string;
}): Channel {
  return {
    id: "plannotator",
    async available() {
      const result = await deps.exec("plannotator", ["inbox", "status", "--json"]);
      return result.code === 0;
    },
    async deliver(card) {
      const body = renderInbox(card);
      const payload = {
        thread: threadName(card),
        subject: card.kind === "question" ? `study ${card.purpose} · ${card.id}` : card.title,
        body,
        idempotency_key: `study-${card.id}`,
        project_path: deps.cwd,
        ...(card.kind === "lesson" ? { attachments: card.attachments } : {}),
      };
      const result = await deps.exec(
        "plannotator",
        ["inbox", "call", "--session", deps.sessionId(), "send_message", "-"],
        JSON.stringify(payload),
      );
      if (result.code !== 0) throw new Error(result.stderr.trim() || `plannotator exit ${result.code}`);
      const parsed = JSON.parse(result.stdout) as { message_id?: string };
      if (!parsed.message_id) throw new Error("plannotator 응답에 message_id가 없습니다.");
      return { ref: `plannotator:${parsed.message_id}`, publicText: body };
    },
  };
}
```

> `pi.exec`에는 stdin 옵션이 없다. 그래서 `ExecWithInput`의 실제 구현은 Task 4에서 `node:child_process.spawn`으로 만든다(`plannotator`만 실행, shell 없음, 10초 timeout).

**Step 4:** PASS

**Step 5:** `git commit -m "feat(study-next): add the plannotator inbox adapter"`

### Task 3: 채널 선택과 fallback

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/channel/select-channel.ts`
- Test: `next/tests/channel/select-channel.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverWithFallback, resolveChannelId } from "../../src/channel/select-channel.ts";
import { createChatChannel } from "../../src/channel/chat-channel.ts";
import type { Channel } from "../../src/channel/channel.ts";

const notice = { kind: "notice", id: "c-9", projectSlug: "p", title: "t", body: "b" } as const;

test("project setting wins over the workspace setting, default is chat", () => {
  assert.equal(resolveChannelId({ workspace: undefined, project: undefined }), "chat");
  assert.equal(resolveChannelId({ workspace: "plannotator", project: undefined }), "plannotator");
  assert.equal(resolveChannelId({ workspace: "plannotator", project: "chat" }), "chat");
});

test("unknown channel ids are rejected with the known list", () => {
  assert.throws(() => resolveChannelId({ workspace: "slack", project: undefined }), /chat, plannotator/);
});

test("a failing channel falls back to chat and says why", async () => {
  const broken: Channel = { id: "plannotator", available: async () => true,
    deliver: async () => { throw new Error("inbox_off"); } };
  const delivery = await deliverWithFallback(broken, createChatChannel(), notice);
  assert.equal(delivery.ref, "chat:c-9");
  assert.match(delivery.fallback!, /plannotator.*inbox_off/);
});

test("a working channel does not fall back", async () => {
  const delivery = await deliverWithFallback(createChatChannel(), createChatChannel(), notice);
  assert.equal(delivery.fallback, undefined);
});
```

**Step 3: 구현**

```ts
import type { Channel, Delivery, LearningCard } from "./channel.ts";

export const CHANNEL_IDS = ["chat", "plannotator"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export function resolveChannelId(settings: { workspace?: string; project?: string }): ChannelId {
  const id = settings.project ?? settings.workspace ?? "chat";
  if (!(CHANNEL_IDS as readonly string[]).includes(id))
    throw new Error(`알 수 없는 학습 채널입니다: ${id} (가능: ${CHANNEL_IDS.join(", ")})`);
  return id as ChannelId;
}

export async function deliverWithFallback(
  primary: Channel,
  fallback: Channel,
  card: LearningCard,
): Promise<Delivery> {
  if (primary.id === fallback.id) return primary.deliver(card);
  try {
    return await primary.deliver(card);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const delivery = await fallback.deliver(card);
    return { ...delivery, fallback: `${primary.id} 전송 실패(${reason}) → ${fallback.id}로 보냄` };
  }
}
```

**Step 5:** `git commit -m "feat(study-next): choose the learning channel and fall back to chat"`

### Task 4: stdin 지원 exec

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/channel/spawn-exec.ts`
- Test: `next/tests/channel/spawn-exec.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnExec } from "../../src/channel/spawn-exec.ts";

test("spawnExec pipes stdin and captures stdout without a shell", async () => {
  const result = await spawnExec("cat", [], "hello $HOME");
  assert.deepEqual(result, { code: 0, stdout: "hello $HOME", stderr: "" });
});

test("spawnExec reports a missing command as a failure, not a throw", async () => {
  const result = await spawnExec("definitely-not-a-command-xyz", []);
  assert.equal(result.code, 127);
  assert.match(result.stderr, /ENOENT/);
});
```

**Step 3: 구현**

```ts
import { spawn } from "node:child_process";
import type { ExecWithInput } from "./plannotator-channel.ts";

export const spawnExec: ExecWithInput = (command, args, input) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(input ?? "");
  });
```

**Step 5:** `git commit -m "feat(study-next): run CLI channels with stdin input"`

### Task 5: 카드 저장소 (기준 선저장 + 응답 append-only)

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/cards/card-store.ts`
- Test: `next/tests/cards/card-store.test.ts`

저장 형식: `<project>/.study/cards/<scope>.jsonl`(scope = chapterSlug 또는 `placement`). 한 줄 = 한 이벤트.

```jsonl
{"type":"card","card":{...LearningCard},"criteria":{"q1":{"answer":"UNKNOWN","rubric":"…"}},"status":"undelivered","at":"…"}
{"type":"delivered","cardId":"c-1","ref":"plannotator:msg_1","fallback":null,"at":"…"}
{"type":"answer","cardId":"c-1","itemId":"q1","response":"UNKNOWN","confidence":0.7,"assistance":"independent","result":"demonstrated","score":2,"reason":"…","correctionOf":null,"at":"…"}
```

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAnswer, createCard, markDelivered, readScope } from "../../src/cards/card-store.ts";

const card = { kind: "question", id: "c-1", projectSlug: "p", chapterSlug: "ch-01-a",
  purpose: "test", askConfidence: false,
  items: [{ id: "q1", prompt: "?", maxScore: 2 }, { id: "q2", prompt: "?", maxScore: 3 }] } as const;
const criteria = { q1: { answer: "A", rubric: "r" }, q2: { answer: "B", rubric: "r" } };

async function root() { return mkdtemp(join(tmpdir(), "cards-")); }

test("criteria are stored before delivery and every item needs one", async () => {
  const dir = await root();
  await assert.rejects(createCard(dir, card, { q1: criteria.q1 }), /q2/);
  await createCard(dir, card, criteria);
  const scope = await readScope(dir, "ch-01-a");
  assert.equal(scope.cards["c-1"].status, "undelivered");
  assert.deepEqual(scope.cards["c-1"].criteria, criteria);
});

test("the same card id cannot be created twice with different content", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await createCard(dir, card, criteria);
  await assert.rejects(createCard(dir, { ...card, items: [card.items[0]] }, { q1: criteria.q1 }), /c-1/);
});

test("answers append, never overwrite, and corrections link to the first answer", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await markDelivered(dir, "ch-01-a", "c-1", { ref: "chat:c-1" });
  await appendAnswer(dir, "ch-01-a", { cardId: "c-1", itemId: "q1", response: "B",
    assistance: "independent", result: "incorrect", score: 0, reason: "r" });
  await assert.rejects(appendAnswer(dir, "ch-01-a", { cardId: "c-1", itemId: "q1", response: "A",
    assistance: "explained", result: "demonstrated", score: 2, reason: "r" }), /correctionOf/);
  await appendAnswer(dir, "ch-01-a", { cardId: "c-1", itemId: "q1", response: "A",
    assistance: "explained", result: "demonstrated", score: 2, reason: "r", correctionOf: "first" });
  const scope = await readScope(dir, "ch-01-a");
  assert.equal(scope.answers.length, 2);
  assert.equal(scope.cards["c-1"].status, "delivered");
});

test("answers for unknown cards or items are rejected", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await assert.rejects(appendAnswer(dir, "ch-01-a", { cardId: "c-x", itemId: "q1", response: "",
    assistance: "unknown", result: "unverified", reason: "" }), /c-x/);
  await assert.rejects(appendAnswer(dir, "ch-01-a", { cardId: "c-1", itemId: "q9", response: "",
    assistance: "unknown", result: "unverified", reason: "" }), /q9/);
});

test("confidence must be between 0 and 1", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await assert.rejects(appendAnswer(dir, "ch-01-a", { cardId: "c-1", itemId: "q1", response: "A",
    confidence: 7, assistance: "independent", result: "demonstrated", reason: "" }), /confidence/);
});

test("the file is jsonl under .study/cards", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  const text = await readFile(join(dir, ".study", "cards", "ch-01-a.jsonl"), "utf8");
  assert.equal(text.trim().split("\n").length, 1);
});
```

**Step 3: 구현 요점**

- `createCard(projectRoot, card, criteria)`: scope = `card.chapterSlug ?? "placement"`. question 카드는 모든 item에 criteria 필수. 같은 ID가 있으면 내용(JSON 비교)이 같을 때만 통과(멱등).
- `markDelivered(projectRoot, scope, cardId, { ref, fallback? })`.
- `appendAnswer(projectRoot, scope, answer)`: 카드·item 존재 검사, `confidence`는 0~1, 같은 item에 이미 응답이 있으면 `correctionOf` 필수(`"first"` 또는 이전 응답의 `at`).
- `readScope(projectRoot, scope)` → `{ cards: Record<id, {card, criteria, status, ref?}>, answers: Answer[] }`.
- 쓰기는 `appendFile` 한 줄. 같은 파일 동시 쓰기는 Pi의 `withFileMutationQueue`로 감싼다(Task 9에서 도구가 감쌈).
- scope 이름 검증: `/^(placement|ch-[0-9]{2}-[a-z0-9-]+)$/`.

**Step 5:** `git commit -m "feat(study-next): store card criteria before delivery and append answers"`

### Task 6: 지침 로더 (세 층 덮어쓰기)

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/prompts/prompt-loader.ts`
- Test: `next/tests/prompts/prompt-loader.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROMPT_NAMES, loadPrompt, listPromptSources } from "../../src/prompts/prompt-loader.ts";

async function layout() {
  const base = await mkdtemp(join(tmpdir(), "prompts-"));
  const defaults = join(base, "defaults");
  const root = join(base, "root");
  const project = join(root, "proj");
  for (const dir of [defaults, join(root, ".study", "prompts"), join(project, ".study", "prompts")])
    await mkdir(dir, { recursive: true });
  for (const name of PROMPT_NAMES) await writeFile(join(defaults, `${name}.md`), `default ${name}`);
  return { defaults, root, project };
}

test("project beats root beats default", async () => {
  const l = await layout();
  assert.equal((await loadPrompt("lab", l)).text, "default lab");
  await writeFile(join(l.root, ".study", "prompts", "lab.md"), "root lab");
  assert.deepEqual(await loadPrompt("lab", l), { text: "root lab", source: "root", warnings: [] });
  await writeFile(join(l.project, ".study", "prompts", "lab.md"), "project lab");
  assert.equal((await loadPrompt("lab", l)).source, "project");
});

test("an unreadable override falls back to the default with a warning", async () => {
  const l = await layout();
  await mkdir(join(l.project, ".study", "prompts", "lab.md"));
  const loaded = await loadPrompt("lab", l);
  assert.equal(loaded.source, "default");
  assert.match(loaded.warnings[0], /lab\.md/);
});

test("a missing default is an error, never a one-line stand-in", async () => {
  const l = await layout();
  await assert.rejects(loadPrompt("lab", { ...l, defaults: join(l.defaults, "nope") }), /기본 지침/);
});

test("init replaces {{topic}} only", async () => {
  const l = await layout();
  await writeFile(join(l.defaults, "init.md"), "주제: {{topic}} / {{other}}");
  assert.equal((await loadPrompt("init", l, { topic: "SQL" })).text, "주제: SQL / {{other}}");
});

test("listPromptSources reports each name's layer and whether it differs from default", async () => {
  const l = await layout();
  await writeFile(join(l.root, ".study", "prompts", "test.md"), "mine");
  const rows = await listPromptSources(l);
  assert.deepEqual(rows.find((r) => r.name === "test"), { name: "test", source: "root", differs: true });
  assert.deepEqual(rows.find((r) => r.name === "lab"), { name: "lab", source: "default", differs: false });
});

test("templates live under templates/", async () => {
  assert.ok(PROMPT_NAMES.includes("templates/concept-page"));
  assert.ok(PROMPT_NAMES.includes("templates/chapter-readme"));
});
```

**Step 3: 구현**

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const PROMPT_NAMES = [
  "init", "concept", "lab", "test", "review", "checkpoint",
  "templates/concept-page", "templates/chapter-readme",
] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];
export type PromptLayers = { defaults: string; root?: string; project?: string };
export type PromptSource = "project" | "root" | "default";

async function readOptional(path: string): Promise<{ text?: string; warning?: string }> {
  try {
    return { text: await readFile(path, "utf8") };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    return { warning: `덮어쓴 지침을 읽지 못해 다음 층을 씁니다: ${path} (${code})` };
  }
}

export async function loadPrompt(
  name: PromptName,
  layers: PromptLayers,
  vars: { topic?: string } = {},
): Promise<{ text: string; source: PromptSource; warnings: string[] }> {
  const warnings: string[] = [];
  const candidates: Array<[PromptSource, string | undefined]> = [
    ["project", layers.project && join(layers.project, ".study", "prompts", `${name}.md`)],
    ["root", layers.root && join(layers.root, ".study", "prompts", `${name}.md`)],
  ];
  for (const [source, path] of candidates) {
    if (!path) continue;
    const read = await readOptional(path);
    if (read.warning) warnings.push(read.warning);
    if (read.text !== undefined) return { text: substitute(read.text, vars), source, warnings };
  }
  const fallback = await readOptional(join(layers.defaults, `${name}.md`));
  if (fallback.text === undefined) throw new Error(`기본 지침이 없습니다: ${name}.md`);
  return { text: substitute(fallback.text, vars), source: "default", warnings };
}

function substitute(text: string, vars: { topic?: string }): string {
  return vars.topic === undefined ? text : text.replaceAll("{{topic}}", vars.topic);
}

export async function listPromptSources(layers: PromptLayers) {
  const rows = [];
  for (const name of PROMPT_NAMES) {
    const loaded = await loadPrompt(name, layers);
    const base = await readFile(join(layers.defaults, `${name}.md`), "utf8");
    rows.push({ name, source: loaded.source, differs: loaded.text !== base });
  }
  return rows;
}
```

**Step 5:** `git commit -m "feat(study-next): load phase prompts from project, root or default"`

### Task 7: `/study-prompts` 명령 동작 (eject·diff·reset)

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/prompts/prompt-commands.ts`
- Test: `next/tests/prompts/prompt-commands.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffPrompt, ejectPrompt, resetPrompt } from "../../src/prompts/prompt-commands.ts";

async function layout() {
  const base = await mkdtemp(join(tmpdir(), "pc-"));
  const defaults = join(base, "d");
  await mkdir(join(defaults, "templates"), { recursive: true });
  await writeFile(join(defaults, "lab.md"), "a\nb\n");
  await writeFile(join(defaults, "templates", "concept-page.md"), "t\n");
  return { defaults, root: join(base, "r"), project: join(base, "r", "p") };
}

test("eject copies the default to root (or project) and refuses to overwrite", async () => {
  const l = await layout();
  const path = await ejectPrompt("lab", l, "root");
  assert.equal(path, join(l.root, ".study", "prompts", "lab.md"));
  assert.equal(await readFile(path, "utf8"), "a\nb\n");
  await assert.rejects(ejectPrompt("lab", l, "root"), /이미/);
  const nested = await ejectPrompt("templates/concept-page", l, "project");
  assert.equal(await readFile(nested, "utf8"), "t\n");
});

test("diff shows changed lines against the current default", async () => {
  const l = await layout();
  const path = await ejectPrompt("lab", l, "root");
  await writeFile(path, "a\nc\n");
  assert.equal(await diffPrompt("lab", l), "- b\n+ c");
  assert.equal(await diffPrompt("test" as any, { ...l, defaults: l.defaults }).catch((e) => e.message), "기본 지침이 없습니다: test.md");
});

test("reset deletes only the chosen layer's override", async () => {
  const l = await layout();
  const path = await ejectPrompt("lab", l, "root");
  await resetPrompt("lab", l, "root");
  await assert.rejects(access(path));
  await assert.rejects(resetPrompt("lab", l, "root"), /덮어쓴 파일이 없습니다/);
});
```

**Step 3: 구현 요점**

- `ejectPrompt(name, layers, layer)`: 대상 디렉터리 `mkdir -p`, `writeFile(..., { flag: "wx" })`로 덮어쓰기 거부(EEXIST → "이미 덮어쓴 파일이 있습니다").
- `diffPrompt(name, layers)`: `loadPrompt`의 결과와 기본값을 줄 단위로 비교해 `- 기본` / `+ 현재` 줄만 반환(LCS 없이 같은 위치 비교. 줄 수가 다르면 남는 줄을 모두 표시). 같으면 `"(기본값과 같음)"`.
- `resetPrompt(name, layers, layer)`: 해당 층 파일만 `rm`. 없으면 오류.

**Step 5:** `git commit -m "feat(study-next): eject, diff and reset prompt overrides"`

---

## Phase 2. 상태·흐름·복습

### Task 8: 상태 모델 (diagnosis 제거)

**TDD scenario:** New feature — full TDD cycle (기존 `study-state.ts`에서 필요한 부분만 옮김)

**Files:**
- Create: `next/src/state/study-state.ts`
- Create: `next/src/state/project-manifest.ts` (기존 `src/project/project-manifest.ts`를 복사 후 `PlacementSummary`에 `chapters` 추가, `channel?: string` 추가)
- Copy: `src/project/project-root.ts` → `next/src/state/project-root.ts`, `src/project/project-path.ts` → `next/src/state/project-path.ts` (내용 그대로)
- Test: `next/tests/state/study-state.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PHASES, loadStudyState, nextPhase, setPhase } from "../../src/state/study-state.ts";

async function project(state?: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "state-"));
  await mkdir(join(dir, ".study"), { recursive: true });
  await mkdir(join(dir, "ch-01-a"));
  await mkdir(join(dir, "ch-02-b"));
  if (state) await writeFile(join(dir, ".study", "state.json"), JSON.stringify(state));
  return dir;
}

test("phases are concept, lab, test, review", () => {
  assert.deepEqual(PHASES, ["concept", "lab", "test", "review"]);
});

test("a legacy diagnosis key is dropped and in-progress diagnosis becomes not-started concept", async () => {
  const dir = await project({ version: 1, chapters: { "ch-01-a": {
    diagnosis: { status: "in_progress", updatedAt: "x" },
    concept: { status: "not_started", updatedAt: "x" },
    lab: { status: "not_started", updatedAt: "x" },
    test: { status: "not_started", updatedAt: "x" },
    review: { status: "not_started", updatedAt: "x" } } } });
  const state = await loadStudyState(dir);
  assert.equal("diagnosis" in state.chapters["ch-01-a"], false);
  assert.equal(state.chapters["ch-01-a"].concept.status, "not_started");
});

test("missing chapters are created from ch-* directories", async () => {
  const state = await loadStudyState(await project());
  assert.deepEqual(Object.keys(state.chapters), ["ch-01-a", "ch-02-b"]);
});

test("awaiting statuses are rejected on write", async () => {
  const dir = await project();
  await assert.rejects(setPhase(dir, "ch-01-a", "test", "awaiting_review" as any), /status/);
});

test("nextPhase returns the first unfinished phase", async () => {
  const dir = await project();
  await setPhase(dir, "ch-01-a", "concept", "completed");
  const state = await loadStudyState(dir);
  assert.equal(nextPhase(state.chapters["ch-01-a"]), "lab");
});

test("setPhase writes atomically and records activeChapter", async () => {
  const dir = await project();
  await setPhase(dir, "ch-02-b", "lab", "in_progress");
  const saved = JSON.parse(await readFile(join(dir, ".study", "state.json"), "utf8"));
  assert.equal(saved.activeChapter, "ch-02-b");
  assert.equal(saved.chapters["ch-02-b"].lab.status, "in_progress");
});
```

**Step 3: 구현 요점**

- `PHASES = ["concept","lab","test","review"] as const`, `STATUSES = ["not_started","in_progress","completed","relearn_required","skipped_understood","blocked"]`.
- `loadStudyState`: 파일이 없으면 `ch-*` 디렉터리로 빈 상태 생성. 있으면 알 수 없는 phase 키(`diagnosis`) 제거, `awaiting_*` 상태는 `in_progress`로 바꿈. 손상된 JSON은 오류(초기화하지 않음).
- `setPhase(projectRoot, chapter, phase, status, patch?)`: 검증 → temp 파일 → rename.
- `nextPhase(chapter)`: `completed`·`skipped_understood`가 아닌 첫 phase, 모두 끝났으면 `"review"`.
- `PlacementSummary.chapters?: Record<string, { startAt: string; skip: string[]; focus: string[]; unverified: string[] }>`.

**Step 5:** `git commit -m "feat(study-next): state model without the diagnosis phase"`

### Task 9: study 루트와 통합 복습 일정

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/review/workspace.ts` (루트 탐색: 위로 올라가며 `.study/workspace.json` 찾기, 읽기, 프로젝트 등록)
- Create: `next/src/review/review-date.ts` (기존 `src/review/review-date.ts` 복사, `isValidTimezone`는 `Intl.supportedValuesOf("timeZone")`로 파일 안에 구현)
- Create: `next/src/review/schedule.ts`
- Test: `next/tests/review/schedule.test.ts`, `next/tests/review/workspace.test.ts`

**Step 1: 실패하는 테스트 (schedule)**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { due, enroll, loadSchedule, recordRound } from "../../src/review/schedule.ts";

const intervals = [1, 3, 7, 14];
const key = { projectSlug: "p", chapterSlug: "ch-01-a" };

test("enroll sets round 1 due the next day and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "sch-"));
  await enroll(root, key, "2026-11-23", intervals);
  await enroll(root, key, "2026-11-25", intervals);
  const [entry] = (await loadSchedule(root)).entries;
  assert.deepEqual({ round: entry.round, due: entry.due, baseDate: entry.baseDate },
    { round: 1, due: "2026-11-24", baseDate: "2026-11-23" });
});

test("advance uses the actual review date; reset goes back to the first interval", async () => {
  const root = await mkdtemp(join(tmpdir(), "sch-"));
  await enroll(root, key, "2026-11-23", intervals);
  await recordRound(root, key, { date: "2026-11-26", result: "advanced", cardId: "c-1" }, intervals);
  let [e] = (await loadSchedule(root)).entries;
  assert.deepEqual({ round: e.round, due: e.due }, { round: 2, due: "2026-11-29" });
  await recordRound(root, key, { date: "2026-11-29", result: "reset", cardId: "c-2" }, intervals);
  [e] = (await loadSchedule(root)).entries;
  assert.deepEqual({ round: e.round, due: e.due }, { round: 1, due: "2026-11-30" });
});

test("after the last interval the entry is finished", async () => {
  const root = await mkdtemp(join(tmpdir(), "sch-"));
  await enroll(root, key, "2026-11-01", [1]);
  await recordRound(root, key, { date: "2026-11-02", result: "advanced", cardId: "c" }, [1]);
  const [e] = (await loadSchedule(root)).entries;
  assert.equal(e.due, null);
  assert.equal(e.finishedOn, "2026-11-02");
});

test("future rounds cannot be recorded early", async () => {
  const root = await mkdtemp(join(tmpdir(), "sch-"));
  await enroll(root, key, "2026-11-23", intervals);
  await assert.rejects(recordRound(root, key, { date: "2026-11-23", result: "advanced", cardId: "c" }, intervals), /예정일/);
});

test("due lists overdue first, then today, and skips finished entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "sch-"));
  await enroll(root, { projectSlug: "p", chapterSlug: "ch-02-b" }, "2026-11-22", intervals);
  await enroll(root, key, "2026-11-20", intervals);
  const list = await due(root, "2026-11-23");
  assert.deepEqual(list.map((e) => e.chapterSlug), ["ch-01-a", "ch-02-b"]);
});

test("a concurrent change is refused instead of overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "sch-"));
  await enroll(root, key, "2026-11-23", intervals);
  await Promise.all([
    recordRound(root, key, { date: "2026-11-24", result: "advanced", cardId: "a" }, intervals),
    recordRound(root, key, { date: "2026-11-24", result: "advanced", cardId: "b" }, intervals),
  ].map((p) => p.catch((e) => e)));
  const [e] = (await loadSchedule(root)).entries;
  assert.equal(e.history.length, 1);
});
```

**Step 3: 구현 요점**

- 파일: `<root>/review/schedule.json`, `{ version: 1, entries: [...] }`.
- 모든 쓰기는 모듈 안의 `Map<path, Promise>` 큐로 직렬화하고, 큐 안에서 다시 읽어 `due` 비교 후 적용(같은 예정일 회차가 이미 기록됐으면 거부). Pi의 `withFileMutationQueue`는 도구 쪽에서 추가로 감싼다.
- `recordRound`: `date < entry.due`면 "예정일 전" 오류. `advanced` → `round+1`, `due = date + intervals[round]`, 마지막이면 `due=null, finishedOn=date`. `reset` → `round=1`, `due = date + intervals[0]`.
- `workspace.ts`: `findWorkspaceRoot(start)`, `readWorkspace(root)` → `{ timezone, review: { intervals }, projects, channel? }`, `registerProject(root, { slug, path })`(이미 있으면 그대로). 기존 `workspace.json` 형식과 호환(`schemaVersion`, `workspaceId` 유지).

**Step 5:** `git commit -m "feat(study-next): chapter review schedule kept in one study-root file"`

### Task 10: 요청 헤더와 단계 프롬프트 조립

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/flow/phase-request.ts`
- Test: `next/tests/flow/phase-request.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPhaseRequest } from "../../src/flow/phase-request.ts";

test("the header always precedes the prompt body and carries the chapter placement start", () => {
  const text = buildPhaseRequest({
    projectRoot: "/p", chapterSlug: "ch-01-a", chapterTitle: "NULL", phase: "concept",
    status: "not_started", channel: "plannotator",
    placement: { startAt: "3값 논리", skip: ["IS NULL 문법"], focus: ["NOT IN 함정"], unverified: ["COUNT(col)"] },
    body: "BODY", warnings: [],
  });
  assert.ok(text.startsWith("# STUDY_PHASE_REQUEST\n"));
  assert.match(text, /- channel: plannotator/);
  assert.match(text, /## 이 챕터의 출발점 \(배치 진단\)/);
  assert.match(text, /- 미확인: COUNT\(col\)/);
  assert.ok(text.trimEnd().endsWith("BODY"));
});

test("override warnings are shown above the body", () => {
  const text = buildPhaseRequest({ projectRoot: "/p", chapterSlug: "ch-01-a", chapterTitle: "t",
    phase: "lab", status: "in_progress", channel: "chat", body: "B", warnings: ["읽지 못함"] });
  assert.match(text, /⚠️ 읽지 못함\n[\s\S]*B$/);
});

test("without placement data the section says so instead of inventing one", () => {
  const text = buildPhaseRequest({ projectRoot: "/p", chapterSlug: "ch-01-a", chapterTitle: "t",
    phase: "concept", status: "not_started", channel: "chat", body: "B", warnings: [] });
  assert.match(text, /배치 진단 기록 없음/);
});
```

**Step 3: 구현** — 위 순서대로 줄을 이어 붙이는 순수 함수(헤더 → 출발점 → 경고 → 본문). concept 단계에만 출발점 섹션을 넣는다.

**Step 5:** `git commit -m "feat(study-next): assemble the phase request header and prompt"`

### Task 11: 단계 완료 조건과 시험 판정

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/flow/phase-complete.ts`
- Create: `next/src/flow/test-result.ts`
- Test: `next/tests/flow/phase-complete.test.ts`, `next/tests/flow/test-result.test.ts`

**Step 1: 실패하는 테스트 (요점)**

phase-complete:
- concept: `ch-xx/concepts/*.md`가 1개 이상이고, `README.md`의 `## 개념 파일` 섹션 링크 집합이 실제 파일 집합과 같아야 완료. 다르면 빠진/남는 파일 이름을 담은 오류.
- lab: `lab/manifest.json`의 모든 step이 `passed|skipped_understood`(기존 `loadLabManifest` 재사용).
- test·review는 이 함수로 완료할 수 없다(전용 도구 사용) → 오류 메시지 `study_test_finish`/`study_review_finish` 안내.

test-result:
```ts
test("pass is computed from recorded scores, not declared", async () => { /* 카드 2문항 maxScore 2+3, 점수 2+2 → 4/5, passScore 4 → passed */ });
test("missing answers block the result and list item ids", async () => { /* q2 미기록 → /q2/ */ });
test("only the latest correction per item counts toward the score?", async () => { /* 아니다: 시험 점수는 최초 응답만 센다. 교정은 학습 기록일 뿐 → 2+0 */ });
test("weak items are those below full marks", async () => { /* weak = ["q2"] */ });
```

**Step 3: 구현 요점**

- `computeTestResult(scope, cardId, passScore)` → `{ total, max, passed, weak: string[] }`. 최초 응답(교정 아님)의 `score`만 합산, 하나라도 없으면 오류.
- `completeTest(projectRoot, root, chapter, result, today, intervals)`: 통과 → `setPhase(test, completed, {score,maxScore,attempt})` + `enroll(...)` + `setPhase(review, in_progress)`. 미통과 → `setPhase(test, relearn_required, {attempt})`.

**Step 5:** `git commit -m "feat(study-next): phase completion checks and score-based test result"`

---

## Phase 3. Pi 연결 (도구·명령·기본 지침)

### Task 12: 기본 지침 파일 작성

**TDD scenario:** Trivial change — 내용 작성 + 문구 검사 테스트

**Files:**
- Create: `next/prompts/init.md` — 기존 `prompts/study-init.md`에서 옮김. 바뀌는 점: 배치 진단은 `study_ask(purpose=placement)` + `study_placement_finish`(챕터별 출발점 포함), 커리큘럼 승인은 `study_send(notice)` 후 답장, 챕터 README 양식은 `templates/chapter-readme` 참조, 챕터 진단·HTML·book 문구 삭제. 주제는 `{{topic}}`.
- Create: `next/prompts/concept.md` — 기존 `instructions/concept.md`에서 옮김. book 관련 문단(plan·write_page·place·knowledge·textbook_refresh)을 개념 파일 쓰기로 대체, 페이지 구성 10단계·깊이 점검·정확성·그림 규칙 유지(그림 위치 `concepts/media/`). 개념 파일마다 `study_send(lesson)`, 확인은 `study_ask(concept-check)`, 완료는 `study_phase complete`.
- Create: `next/prompts/lab.md` — 기존 그대로 + step 안내는 `study_send(notice)`.
- Create: `next/prompts/test.md` — `study_ask(purpose=test)` 문항 묶음(최대 8문항/카드), 답장 → 문항별 `study_answer_record`(score 포함) → `study_test_finish`. 결과는 `study_send(notice)`.
- Create: `next/prompts/review.md` — 기존 `prompts/study-review.md`의 통합 복습 부분을 챕터 단위로 재작성. 고정 회차형(미등록) 절차 삭제.
- Create: `next/prompts/checkpoint.md` — 기존 `checkpoint-command.ts`의 지시 문구를 파일로 옮김.
- Create: `next/prompts/templates/concept-page.md`, `next/prompts/templates/chapter-readme.md`.
- Test: `next/tests/prompts/default-prompts.test.ts`

**Step 1: 실패하는 테스트**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PROMPT_NAMES } from "../../src/prompts/prompt-loader.ts";

const read = (name: string) => readFile(new URL(`../../prompts/${name}.md`, import.meta.url), "utf8");

test("every prompt name has a default file", async () => {
  for (const name of PROMPT_NAMES) assert.ok((await read(name)).trim().length > 0, name);
});

test("no default prompt mentions removed features", async () => {
  for (const name of PROMPT_NAMES) {
    const text = await read(name);
    assert.doesNotMatch(text, /study_book|study_knowledge|study_textbook_refresh|study_test_open|study_diagnosis_open|study_curriculum_open|book\/|diagnosis\.md|사전진단/, name);
  }
});

test("phase prompts use the channel tools", async () => {
  assert.match(await read("concept"), /study_send/);
  assert.match(await read("test"), /study_ask[\s\S]*study_test_finish/);
  assert.match(await read("review"), /study_review_next[\s\S]*study_review_finish/);
  assert.match(await read("init"), /study_placement_finish/);
  assert.match(await read("init"), /\{\{topic\}\}/);
});

test("confidence is asked and never guessed", async () => {
  for (const name of ["init", "concept", "review"]) assert.match(await read(name), /확신도\(0~10\)/, name);
});
```

**Step 5:** `git commit -m "feat(study-next): default phase prompts and templates"`

### Task 13: 채널 도구 (`study_ask`, `study_send`, `study_answer_record`)

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/channel/channel-context.ts` (cwd → 프로젝트·루트·설정 → Channel 인스턴스, 의존성 주입 가능)
- Create: `next/src/cards/card-tools.ts`
- Test: `next/tests/cards/card-tools.test.ts`

**Step 1: 실패하는 테스트**

가짜 `pi`(registerTool 수집)와 기록용 가짜 Channel을 주입한다.

```ts
test("study_ask stores criteria before the channel is called", async () => {
  const order: string[] = [];
  const channel = { id: "fake", available: async () => true,
    deliver: async (card) => { order.push(`deliver:${card.id}`); return { ref: "fake:1", publicText: "Q" }; } };
  const store = spyStore(order); // createCard 호출 시 order.push("criteria")
  const tool = registerAndGet("study_ask", { channel, store });
  const result = await tool.execute("t", { cardJson: JSON.stringify(questionCard), criteriaJson: JSON.stringify(criteria) }, undefined, undefined, ctx);
  assert.deepEqual(order, ["criteria", "deliver:c-1"]);
  assert.match(result.content[0].text, /Q/);
});

test("study_ask leaves the card undelivered and hides criteria when delivery throws", async () => { /* … status undelivered, 결과 텍스트에 rubric 없음 */ });
test("study_ask reports a fallback in the tool result", async () => { /* delivery.fallback → 결과에 'fallback:' */ });
test("study_ask with chat channel tells the agent to show publicText verbatim", async () => { /* 결과에 '그대로 보여 주세요' */ });
test("study_ask with plannotator tells the agent not to repeat the question in chat", async () => { /* '채팅에 다시 쓰지 마세요' */ });
test("study_answer_record appends one answer per item", async () => { /* items 배열 2개 → answers 2 */ });
test("criteria are never part of study_send or study_ask output", async () => { /* rubric 문자열이 어디에도 없음 */ });
```

**Step 3: 구현 요점**

- `study_ask` 파라미터: `cardJson`(LearningCard question, `id` 생략 시 `c-<random>`), `criteriaJson`(item별 `{answer, acceptable?, rubric}`). 순서: 검증 → `createCard` → `deliverWithFallback` → `markDelivered` → 결과 텍스트.
- 결과 텍스트: chat이면 "아래 질문을 그대로 학습자에게 보여 주세요" + publicText, plannotator면 "Inbox로 보냈습니다. 채팅에 질문을 다시 쓰지 말고 턴을 끝내세요. 답장은 `[cardId/itemId]` 표시로 기록하세요" + ref.
- `study_send`: lesson·notice. lesson의 attachments는 프로젝트 안 경로인지 `projectPath`로 검사 후 절대 경로로 변환.
- `study_answer_record`: `scope`, `answersJson`(배열). 각 항목 `appendAnswer`.
- `promptGuidelines`(코드 고정):
  - "study_ask는 채점 기준을 먼저 저장한 뒤 질문을 보냅니다. 기준을 답변 전에 말하지 마세요."
  - "학습 질문·교재·결과는 study_ask/study_send로만 보내세요. plannotator_inbox 도구로 학습 카드를 직접 보내지 마세요."
  - "study_answer_record에는 학습자가 실제로 쓴 답만 넣고, confidence는 학습자가 말한 0~10을 10으로 나눈 값만 넣으세요. 말하지 않았으면 비워 두세요."
  - "답장에 [cardId/itemId] 표시가 없으면 추측하지 말고 어느 문항인지 학습자에게 확인하세요."

**Step 5:** `git commit -m "feat(study-next): study_ask, study_send and study_answer_record tools"`

### Task 14: 흐름 도구 (`study_placement_finish`, `study_phase`, `study_test_finish`, `study_review_next`, `study_review_finish`)

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/flow/flow-tools.ts`
- Create: `next/src/review/review-tools.ts`
- Test: `next/tests/flow/flow-tools.test.ts`, `next/tests/review/review-tools.test.ts`

**테스트 요점**
- `study_placement_finish`: `reason`(route_decided|limit_reached|user_request), 프로젝트 요약, `chapters` 출발점을 `project.json`의 `placement`에 저장. placement scope의 질문 카드가 8개를 넘으면 limit_reached 외 사유 거부.
- `study_phase action=get`: 챕터 상태·다음 단계. `action=complete phase=concept|lab`: Task 11 검사 → 완료 저장.
- `study_test_finish {chapterSlug, cardId, passScore}`: Task 11 계산 → 통과 시 일정 등록, 미통과 시 weak 목록 + "attempt+1 변형 문항" 안내.
- `study_review_next`: 루트의 오늘 기한 항목(기한 경과 우선), 각 항목의 챕터 개념 파일 목록·마지막 시험 weak. 정답·기준 없음.
- `study_review_finish {projectSlug, chapterSlug, cardId}`: 그 카드 문항이 모두 기록됐는지 확인, 전부 independent+demonstrated → advanced, 아니면 reset. 날짜는 루트 timezone의 오늘.

**Step 5:** `git commit -m "feat(study-next): placement, phase, test and review flow tools"`

### Task 15: 명령 (`/study-init`, `/study-chapter`, `/study-review`, `/study-prompts`)

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `next/src/flow/commands.ts`
- Create: `next/src/prompts/prompts-command.ts`
- Test: `next/tests/flow/commands.test.ts`, `next/tests/prompts/prompts-command.test.ts`

**요점**
- `/study-init <주제>`: 주제가 비면 사용법 알림만. 있으면 `loadPrompt("init", layers, { topic })`(cwd 기준 루트가 있으면 root 층 적용) → `sendUserMessage`.
- `/study-chapter [챕터] [단계]`: 기존 `parseStudyChapterArgs`·`resolveChapterSlug`·메뉴 로직을 옮기되 단계는 `개념|실습|시험|복습`. 대상 결정 → `setPhase(in_progress)`(not_started일 때) → `buildPhaseRequest` + `loadPrompt(phase)` → `sendUserMessage`. 단계가 `review`면 `/study-review <챕터>`와 같은 요청.
- `/study-review [챕터]`: `loadPrompt("review")` + 오늘 할 목록 요약 헤더 → `sendUserMessage`.
- `/study-prompts [list|eject|diff|reset] [name] [--project]`: `ctx.ui.notify`로 결과 표시, reset은 `ctx.ui.confirm` 후.
- 자동완성: 챕터(기존 `chapterArgumentCompletions` 이식), prompts 이름.

**Step 5:** `git commit -m "feat(study-next): study-init, study-chapter, study-review and study-prompts commands"`

### Task 16: 살릴 모듈 이식과 entry point

**TDD scenario:** Modifying tested code — 기존 테스트를 먼저 옮겨 실행

**Files:**
- Copy: `src/lab/*` → `next/src/lab/`, `tests/lab/*` → `next/tests/lab/` (import 경로를 `../state/…`로 수정, `UpdateProjectPhase`는 `setPhase` 래퍼로 교체)
- Copy: `src/checkpoint/*` → `next/src/checkpoint/`, `tests/checkpoint/*` → `next/tests/checkpoint/` (지시 문구는 `loadPrompt("checkpoint")`로)
- Copy: `src/session/roadmap*.ts`, `chapter-catalog.ts`, `study-widget.ts` → `next/src/ui/` (+ 테스트). widget의 knowledge·옛 review import는 `schedule.due`로 교체, `PHASE_ORDER`에서 diagnosis 제거.
- Create: `next/index.ts`
- Create: `next/tests/integration/extension-registration.test.ts`, `next/tests/integration/directory-layout.test.ts`

**Step 1: 등록 테스트 (기존 harness 재사용)**

```ts
test("registers exactly the simplified tools and commands", options, async () => {
  const { tools, commands } = await harness();
  assert.deepEqual([...tools.keys()].sort(), [
    "study_answer_record", "study_ask", "study_checkpoint_publish", "study_lab_step_update",
    "study_lab_verify", "study_phase", "study_placement_finish", "study_preflight",
    "study_review_finish", "study_review_next", "study_send", "study_test_finish",
  ].sort());
  assert.deepEqual([...commands.keys()].sort(),
    ["study-chapter", "study-checkpoint", "study-init", "study-map", "study-prompts", "study-review"]);
});

test("no HTTP server is started and no browser is opened", options, async () => { /* index.ts에 createServer·openBrowser import가 없음을 소스 검사 */ });
```


**Step 2~4:** 이식한 lab·checkpoint 테스트가 모두 PASS인지 확인 후 등록 테스트 PASS.

**Step 5:** `git commit -m "feat(study-next): port lab, checkpoint and roadmap and wire the entry point"`

**Checkpoint:** `NODE_PATH="$(npm root -g)" node --test 'next/tests/**/*.test.ts'` 전체 PASS. 여기서 멈추고 사용자에게 결과 보고.

---

## Phase 4. 교체와 정리

### Task 17: 한 커밋으로 교체

**TDD scenario:** Modifying tested code

**Step 1:** 기존 디렉터리 삭제: `src/`, `tests/`, `instructions/`, `prompts/`, `assets/`, `index.ts`, `docs/architecture-and-prompts.html`(옛 구조 문서, Inbox 결정과 무관하게 내용이 틀려짐 — 사용자 답이 "커밋"이었으면 새 구조로 다시 그리는 Task를 별도로 추가).
**Step 2:** `git mv next/src src`, `git mv next/tests tests`, `git mv next/prompts prompts`, `git mv next/index.ts index.ts`, `rmdir next`.
**Step 3:** 전체 테스트 PASS, `bash scripts/check-resources`, `git diff --check`.
**Step 4:** `README.md`를 새 구조로 다시 쓴다(명령 6개, 도구 12개, 채널 설정, 지침 덮어쓰기, 저장 구조, 테스트 명령). `me-docs-readability` 스킬 기준.
**Step 5:** `git commit -m "refactor(study)!: replace the extension with the channel-based simplified core"`

### Task 18: study 루트 정리 스크립트 (사용자 확인 후 실행)

**TDD scenario:** New feature — 가짜 루트로 테스트

**Files:**
- Create: `runtime/pi/extensions/study/scripts/migrate-study-root.ts` (드라이런 기본, `--apply`에서만 삭제)
- Test: `tests/integration/migrate-study-root.test.ts`

**동작**
- 드라이런: 삭제할 경로(`book/`, `knowledge/`, `review/items/`, `.study/local/`, 프로젝트별 `.study/dialogue|assessments|bindings|placement.json의 옛 필드`, `diagnosis.md`, `diagnosis*.html`, `test*.html`)와 변경할 `state.json` 목록, 옛 흐름 문구가 남은 `AGENTS.md`·README 목록 출력.
- 대상 루트의 `git status --porcelain`이 비어 있지 않으면 중단하고 목록을 보여 준다.
- `--apply`: 삭제 + `state.json` 정리 + `review/schedule.json` 빈 파일 생성.

**실행 순서(사용자와 함께)**
1. `node scripts/migrate-study-root.ts ~/IdeaProjects/study` 결과를 Inbox로 보낸다.
2. study 저장소의 미커밋 변경(`study-ansi-sql/.study/*`, `AGENTS.md`)을 사용자가 먼저 처리.
3. 승인 후 `--apply`, study 저장소에 커밋은 사용자 확인 후.

**Step 5:** `git commit -m "feat(study): add a dry-run-first migration for existing study roots"`

---

## 검증 기록

- 2026-11-23 Task 0: `plannotator inbox call --session "$PI_SESSION_ID" send_message -`로 보낸 질문의 답장이 같은 Pi 세션에 `Plannotator Inbox: study · probe (…)` 메시지로 도착함. 답장의 질문 제목에 `[probe/q1]` 표시가 그대로 남음. → 어댑터는 계획대로 CLI 직접 전송. extension에서는 `ctx.sessionManager.getSessionId()`를 `--session`에 넘긴다(값은 `PI_SESSION_ID`와 같은 세션 ID).
