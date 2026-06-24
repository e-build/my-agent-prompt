---
name: create-command
description: >-
  Guides through creating a new pi prompt template (slash command) with
  interactive interview, $1/$ARGUMENTS configuration, and validation. Use
  when user says "create pi command", "new slash command", "make a prompt
  template", "build command for pi", or wants to create a pi prompt template
  markdown file that runs as /name.
allowed-tools: ask_user_question, read, write, edit, bash
---

# Create pi Prompt Template (Slash Command)

You are initiating the pi command (prompt template) creation workflow. This
process guides the user through an interactive interview to gather requirements,
generates a properly formatted prompt template markdown file, and validates the
result.

In pi, a **slash command** is a **prompt template**: a Markdown file in a
`prompts/` directory whose filename (minus `.md`) becomes the `/name` command.
The file content is the prompt; it is expanded in place when the user types
`/name [args...]`.

## Critical Rules

### ask_user_question is MANDATORY

**IMPORTANT**: You MUST use the `ask_user_question` tool for ALL questions to the
user. Never ask questions through regular text output.

### Generate and validate inline

OpenCode-based variants of this skill spawn separate generator and validator
subagents. **Do not do that here.** Writing one Markdown file does not justify
two subagents. Do the interview, write the file directly with `write`, validate
it yourself, and present it. Keep it to a single pass.

---

## Phase 1: Confirm the pi Mechanism

A pi "command" is a **prompt template**, not a TypeScript extension command.
Read the reference once so you cite the current spec:

1. Read `${PI_DOCS}/prompt-templates.md` (resolved against the pi docs directory
   shown in your environment, e.g.
   `.../@earendil-works/pi-coding-agent/docs/prompt-templates.md`).
2. Key facts to internalize (do not recite unless asked):
   - Filename without `.md` = command name. `review.md` → `/review`.
   - Frontmatter supports `description` and `argument-hint`. **That's it.** There
     is no per-template `model` or `agent` override in pi prompt templates.
     `model` is session-level (`/model`); agent delegation is done by instructing
     the template body to call the `subagent` tool.
   - Arguments are positional: `$1`, `$2`, ... ; `$@` / `$ARGUMENTS` for all
     joined; `${1:-default}` and `${@:N}` / `${@:N:L}` slicing. There are no
     named `$VARIABLE` prompts like OpenCode's — emulate naming through
     `argument-hint` and comments in the body.
   - Locations: project `.pi/prompts/*.md`, global `~/.pi/agent/prompts/*.md`,
     packages, settings `prompts` array, or `--prompt-template`.

If `${PI_DOCS}` is not resolvable in the environment, proceed from the facts
above; they are the authoritative pi prompt-template spec.

---

## Phase 2: Interview

Gather requirements through a structured interview. Ask all four questions below
in a single `ask_user_question` call where possible (pi allows up to 4 questions
per invocation).

### Question 1 — Command Name
- Header: `Command Name`
- Question: `What should this command be named? It will be invoked as /name. The markdown filename = the command name, kebab-case recommended.`
- Options:
  - `I'll type the name` — Let me provide a custom kebab-case name

### Question 2 — Purpose
- Header: `Purpose`
- Question: `What does this command do?`
- Options:
  - `Workflow shortcut` — Automates a frequently used multi-step process
  - `Template task` — Structured prompt with variable inputs
  - `Custom` — I'll describe it

### Question 3 — Arguments
- Header: `Arguments`
- Question: `Does the command need user-provided arguments?`
- Options:
  - `No arguments` — The command works with no input
  - `Single free-text ($ARGUMENTS)` — One blob of text via $ARGUMENTS or $@
  - `Positional args ($1, $2, ...)` — Multiple ordered arguments, some with defaults

If `Positional args`:

Ask a follow-up (single question):
- Header: `Arg Spec`
- Question: `List the arguments in order, with defaults for optional ones. Example: "<FILE> [FORMAT=markdown] [LIMIT=10]" becomes $1, ${2:-markdown}, ${3:-10}.`
- Options:
  - `I'll type the spec` — Let me write the argument spec

### Question 4 — Location & Scope
- Header: `Location`
- Question: `Where should the template be created?`
- Options:
  - `Project (.pi/prompts/)` — Available only in this project (Recommended)
  - `Global (~/.pi/agent/prompts/)` — Available in all projects
  - `Custom path` — I'll specify the directory

### Interview Summary

Present a summary:

```
## Command Summary

- Name: {name} (invoked as /{name})
- Description: {description}
- Arguments: {spec, e.g. "$1 <FILE>, ${2:-markdown}" or "none"}
- argument-hint: {derived from spec, or omitted}
- Location: {path}/{name}.md
- Model override: none (session-level via /model — not a template field)
- Agent delegation: {none | instructed in body via subagent tool}
```

Use `ask_user_question` to confirm:
- Header: `Confirm`
- Question: `Does this look correct? Ready to generate the template?`
- Options:
  - `Yes, generate it`
  - `Make changes`

---

## Phase 3: Generate

Write the file directly with `write`. Structure:

````markdown
---
description: {one-line description, shown in autocomplete}
argument-hint: {only if args exist, e.g. "<FILE> [FORMAT]"}
---
{prompt body}

<!-- Args: $1 = {meaning}, ${2:-default} = {meaning} -->
````

Rules while writing:
1. **Filename = command name.** `{name}.md`. No other indirection.
2. **Frontmatter stays to `description` + optional `argument-hint`.** Do NOT
   invent `model`, `agent`, or `subtask` fields — they are silently ignored by pi
   and will mislead the user.
3. **Use positional args** (`$1`, `${2:-default}`, `$@`). Document each arg's
   meaning in an HTML comment at the top of the body so the user (and future
   you) knows what `$3` means without re-reading the interview.
4. **If the user wanted agent delegation or a fixed model**, encode it as
   instructions in the body (e.g. "Run this via the `subagent` tool, agent: X")
   or tell the user to set the model per-session with `/model`. State this
   tradeoff in the presentation step.
5. **Shortest working prompt wins.** No ceremony, no sections the user didn't
   ask for.

---

## Phase 4: Validate

Validate yourself (no subagent). Check against the pi prompt-template spec:

- [ ] Filename is kebab-case, ends in `.md`, and matches the requested command name.
- [ ] `description` present and <= 1024 chars.
- [ ] `argument-hint` present only if args exist; uses `<required>` / `[optional]`.
- [ ] Every `$N` / `${N:-default}` referenced in the body is covered by the spec.
- [ ] No non-existent frontmatter fields (`model`, `agent`, `subtask`, etc.).
- [ ] File is in a real prompts location (project `.pi/prompts/`, global
      `~/.pi/agent/prompts/`, or a settings/package dir).

Confirm the file exists and frontmatter parses:

```bash
ls -l {path}/{name}.md && head -5 {path}/{name}.md
```

If anything fails, fix with `edit` and re-check. Do not declare success until the
checks pass (verification-before-completion: evidence before assertion).

---

## Phase 5: Present

Present the generated command:

1. Show the file contents (`read`).
2. Explain key decisions in at most three lines:
   - How positional args map to the user's intent.
   - If model/agent was requested: why it became body-level instructions or a
     `/model` note rather than frontmatter.
   - Why a prompt template (vs an extension `registerCommand` or a full skill)
     was the right choice for this use case.
3. Show the validation checklist result.
4. Explain how to invoke: type `/{name}` in the pi editor; autocomplete shows the
   description and `argument-hint`. Append args: `/{name} arg1 arg2`.
5. If args exist, show a concrete worked example with sample values.

**CRITICAL**: Complete ALL 5 phases before finishing.

---

## Scope Note: When a prompt template is NOT enough

A prompt template only expands text — it cannot register new tools, intercept
events, or run code. If the user needs any of:

- a custom tool callable by the LLM,
- lifecycle/event hooks,
- programmatic argument autocompletion,
- imperative logic at invocation time,

then what they want is a **pi extension** with `pi.registerCommand()`, not a
prompt template. Tell them so in one line and point at `${PI_DOCS}/extensions.md`
rather than forcing a template to fit.
