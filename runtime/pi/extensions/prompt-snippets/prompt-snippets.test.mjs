import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const expectedBody = "Please be direct and specific. Show every intermediate step. Explain it in a way that a 12-year-old could understand. If necessary, please use Mermaid diagrams at appropriate points to supplement the explanation.";
const packageDir = process.env.PI_PACKAGE_DIR || join(
  execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
  "@earendil-works/pi-coding-agent",
);
const { loadExtensions } = await import(pathToFileURL(join(packageDir, "dist/core/extensions/loader.js")).href);
const { ExtensionRunner } = await import(pathToFileURL(join(packageDir, "dist/core/extensions/runner.js")).href);
const { KeybindingsManager } = await import(pathToFileURL(join(packageDir, "dist/core/keybindings.js")).href);
const keys = { space: " ", enter: "\r", escape: "\u001b", tab: "\t", down: "\u001b[B", up: "\u001b[A" };

async function setup(t, fixtures = { "rule.md": "---\nname: Rule\n---\nRule body" }) {
  assert.ok(existsSync(join(here, "index.ts")), "prompt-snippets extension must exist");
  const dir = mkdtempSync(join(tmpdir(), "prompt-snippets-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(join(here, "index.ts"), join(dir, "index.ts"));
  mkdirSync(join(dir, "snippets"));
  for (const [name, content] of Object.entries(fixtures)) writeFileSync(join(dir, "snippets", name), content);
  const loaded = await loadExtensions([join(dir, "index.ts")], dir);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  const widgets = new Map();
  const notices = [];
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  let script = [];
  const ctx = {
    cwd: dir, mode: "tui", hasUI: true,
    ui: {
      theme,
      setWidget: (id, content) => widgets.set(id, content),
      notify: (message, level) => notices.push({ message, level }),
      custom: async (factory) => {
        let finished = false;
        let result;
        const component = factory({ terminal: { rows: 24 }, requestRender() {} }, theme, {}, (value) => {
          finished = true;
          result = value;
        });
        for (const action of script) {
          if (typeof action === "function") action(component);
          else component.handleInput(keys[action]);
        }
        assert.ok(finished, "menu script must confirm or cancel");
        return result;
      },
    },
  };
  const emit = async (name, event = { type: name }) => {
    let result;
    for (const handler of extension.handlers.get(name) || []) result = await handler(event, ctx);
    return result;
  };
  await emit("session_start");
  return {
    extension, runtime: loaded.runtime, ctx, widgets, notices, emit, dir,
    menu: async (...actions) => {
      script = actions;
      await extension.commands.get("snippets").handler("", ctx);
    },
    send: (text) => emit("input", { type: "input", text, source: "interactive" }),
  };
}

test("registers /snippets and Ctrl+Alt+S through the installed Pi loader", async (t) => {
  const { extension } = await setup(t);
  assert.ok(extension.commands.has("snippets"));
  assert.ok(extension.shortcuts.has("ctrl+alt+s"));
  assert.equal(extension.shortcuts.has("ctrl+s"), false);
  assert.equal(extension.shortcuts.has("alt+s"), false);
});

test("shortcut resolution has no conflicts with Pi default keybindings", async (t) => {
  const { extension, runtime, ctx, dir } = await setup(t);
  // These services are not used by getShortcuts; UI is supplied only to collect diagnostics.
  const runner = new ExtensionRunner([extension], runtime, dir, {}, {});
  runner.setUIContext(ctx.ui);
  const keybindings = new KeybindingsManager();
  const shortcuts = runner.getShortcuts(keybindings.getEffectiveConfig());
  assert.deepEqual(runner.getShortcutDiagnostics(), []);
  assert.ok(shortcuts.has("ctrl+alt+s"));
});

test("applies the bundled user instruction once, then clears the widget", async (t) => {
  const raw = readFileSync(join(here, "snippets/explain-clearly.md"), "utf8");
  assert.equal(raw.split(/\r?\n---\r?\n/)[1].trim(), expectedBody);
  const h = await setup(t, { "explain-clearly.md": raw });
  assert.equal(await h.send("Before selection"), undefined);
  await h.menu("space", "enter");
  assert.match(h.widgets.get("prompt-snippets").join("\n"), /append/);
  assert.deepEqual(await h.send("Explain caching"), { action: "transform", text: `Explain caching\n\n${expectedBody}` });
  assert.equal(h.widgets.get("prompt-snippets"), undefined);
  assert.equal(await h.send("Next message"), undefined);
});

test("cancel discards changes; preview shows the body and returns to the list", async (t) => {
  const h = await setup(t);
  await h.menu("space", "tab", (component) => {
    assert.match(component.render(80).join("\n"), /Rule body/);
    assert.ok(component.render(20).every((line) => stripVTControlCharacters(line).length <= 20));
  }, "escape", "escape");
  assert.equal(await h.send("Unchanged"), undefined);
  await h.menu("space", "enter");
  await h.menu("space", "escape");
  assert.equal((await h.send("Still selected")).text, "Still selected\n\nRule body");
});

test("sorts prepend and append groups by order then name; skips invalid files", async (t) => {
  const snippet = (name, placement, order, body) => `---\nname: ${name}\nplacement: ${placement}\norder: ${order}\n---\n${body}`;
  const h = await setup(t, {
    "last.md": snippet("Z", "append", 20, "After last"),
    "b.md": snippet("B", "append", 10, "After B"),
    "a.md": snippet("A", "append", 10, "After A"),
    "before.md": snippet("Before", "prepend", 90, "Before"),
    "invalid.md": "no frontmatter",
    "empty.md": "---\nname: Empty\n---\n",
    "ignored.txt": snippet("Ignore", "append", 1, "Ignored"),
  });
  await h.menu("space", "down", "space", "down", "space", "down", "space", "enter");
  assert.equal((await h.send("Message")).text, "Before\n\nMessage\n\nAfter A\n\nAfter B\n\nAfter last");
});

test("session start clears active selections", async (t) => {
  const h = await setup(t);
  await h.menu("space", "enter");
  await h.emit("session_start");
  assert.equal(await h.send("New session"), undefined);
  assert.equal(h.widgets.get("prompt-snippets"), undefined);
});

test("reloads edited snippets at send time and tolerates deleted selections", async (t) => {
  const h = await setup(t);
  await h.menu("space", "enter");
  writeFileSync(join(h.dir, "snippets/rule.md"), "---\nname: Updated\n---\nEdited body");
  assert.equal((await h.send("Message")).text, "Message\n\nEdited body");
  await h.menu("space", "enter");
  rmSync(join(h.dir, "snippets/rule.md"));
  assert.equal(await h.send("No rule"), undefined);
});

test("empty menus warn without opening custom UI", async (t) => {
  const h = await setup(t, {});
  await h.menu();
  assert.match(h.notices[0].message, /No snippets found/);
});

test("RPC and print modes do not open the terminal-only menu", async (t) => {
  const h = await setup(t);
  for (const mode of ["rpc", "print"]) {
    h.ctx.mode = mode;
    await h.menu();
    assert.match(h.notices.at(-1).message, /requires interactive mode/);
  }
});
