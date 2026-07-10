# Task for reviewer

Review the latest committed diff in the repo at /Users/jimmylee/IdeaProjects/e-build/my-agent-prompt.

Focus: the commit `a75fbfd` (HEAD) which modifies `pi/extensions/cliproxyapi-sync.ts`. Review ONLY this diff — run `git show a75fbfd` (or `git show HEAD`) to see it.

Context for your review:
- This is a pi (coding agent) TypeScript extension that syncs models from a cliproxyapi proxy into pi's provider registry.
- The change adds automatic reasoning-level mapping: it reads each model's `supported_reasoning_levels` from the proxy's codex endpoint (`/v1/models?client_version=1`) and emits per-model `reasoning: true` + `thinkingLevelMap`, plus provider-level `compat.supportsReasoningEffort: true`.
- Mapping rule: pi thinking levels off/minimal/low/medium/high/xhigh map to provider effort values; pi `xhigh` collapses to the provider's top tier (max > xhigh > null). The proxy advertises tiers low<medium<high<xhigh<max.
- pi has no thinking level above `xhigh`, so provider "max" (gpt-5.6 family) surfaces as pi `xhigh`.

What to evaluate:
1. Correctness of the mapping logic (buildThinkingLevelMap, resolveReasoningLevels, extractReasoningLevels) and the lookup/normalization (stripping reasoning suffix, owner prefix) — any missed edge case, wrong key, or data-loss risk?
2. Type safety (the new CodexModelInfo / ThinkingLevelMap types, optional fields, the `...(thinkingLevelMap ? { thinkingLevelMap } : {})` spread).
3. Regression risk: the rename codexContextBySlug → codexInfoBySlug and the change of fetchCodexContextWindows return type from Map<string, number> to Map<string, CodexModelInfo> — does resolveContextWindow still behave identically for context-window resolution?
4. Robustness: what happens when codex endpoint is down, returns no supported_reasoning_levels, or returns unexpected shapes? Does it degrade gracefully (reasoning: false) like before?
5. Any dead code, the unused max_context_window field, or things that should be simplified.
6. Whether reasoning: true for image generation models (gpt-image-*) is appropriate or a latent bug.

Return a concise review: severity-tagged findings (blocker/major/minor/nit), each with file:line and a concrete fix. If something is correct, say so briefly. Do not rewrite the whole file.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```