## Review

Inspected `git show a75fbfd` (1 file, `pi/extensions/cliproxyapi-sync.ts`, +93/−13), the full current file, the sibling test file, and ran the test suite. Findings below. **No edits applied** (review-only).

---

### Correct (briefly)
- **Graceful degradation is intact.** `fetchCodexContextWindows` (cliproxyapi-sync.ts:258) catches all failures and returns `new Map()`; `resolveReasoningLevels` (:484) returns `[]`; `buildThinkingLevelMap([])` (:501) returns `undefined`; `reasoning` then falls back to the existing `isReasoningModel` heuristic (:202). Endpoint-down / no-levels / bad-shape all degrade to pre-change behavior. ✓
- **`extractReasoningLevels` (:514)** is defensively typed (`unknown`), tolerates non-array, mixed string/`{effort}` items. ✓
- **Type safety of the spread** `...(thinkingLevelMap ? { thinkingLevelMap } : {})` (:207) is correct — keeps the property *absent* (not `undefined`) when there are no levels. `ThinkingLevelMap`/`CodexModelInfo` optional fields are sound. ✓
- **Production context-window path is equivalent.** `resolveContextWindow` (:466) now reads `.contextWindow` off `CodexModelInfo`, matching how `fetchCodexContextWindows` stores it. The `if (!slug) continue` + "store if either field present" broadening is intended (need levels even without a window) and doesn't change window resolution for positive values. ✓
- **Reasoning variants inherit the base map correctly** — `resolveReasoningLevels` strips the `-level` suffix (:484) and looks up the base slug, mirroring `resolveContextWindow`. ✓
- **`xhigh → max > xhigh > null` (:510)** matches the stated spec exactly (the spec defines "top tier" as max-then-xhigh, not "highest available"), so models lacking both get `xhigh: null` by design. ✓

---

### Blocker
- **`cliproxyapi-sync.test.ts` — existing tests now fail (5 of 9).** The commit renamed the param and changed `buildProviderConfigs`'s 4th arg from `Map<string, number>` to `Map<string, CodexModelInfo>` (:143), but the test file was not touched and still constructs `new Map([["openai/gpt-5.4", 272000]])` (bare numbers). At runtime `resolveContextWindow` reads `(272000).contextWindow` → `undefined` → falls back to 128000.
  - **Evidence (command run):** `node --test --experimental-strip-types cliproxyapi-sync.test.ts` → `# pass 4 / # fail 5`, e.g. `128000 !== 272000`.
  - **Type evidence too:** `Map<string, number>` is not assignable to `Map<string, CodexModelInfo>` (strip-types masks it, but a real `tsc` would error).
  - **Fix (test-only, mechanical):** wrap values as `{ contextWindow }`. Affected lines: cliproxyapi-sync.test.ts:20, 29, 57, 67, 86, 98 — e.g. `new Map([["openai/gpt-5.4", { contextWindow: 272000 }]])`. Note line 86 (`0`) currently passes *for the wrong reason*; wrapping it to `{ contextWindow: 0 }` restores the intended "non-positive ignored" assertion.

### Major
- **New reasoning logic has zero test coverage.** The commit added `buildThinkingLevelMap` (:501), `extractReasoningLevels` (:514), `resolveReasoningLevels` (:484), and the `reasoningLevels.length > 0 || …` flag (:202), but added no tests (diff touched only the `.ts` source). These functions encode explicit, non-trivial rules (tier collapse, max>xhigh>null, object/string parsing) that are easy to regress. Pin at minimum: a model advertising `["low","medium","high"]`, one advertising `["max"]`, one with `{effort:"high"}` objects, and an image model that returns no levels (`reasoning:false`). This is also where the ponytail "leave one check behind" rule applies.

### Minor / Nit
- **`max_context_window?: unknown` (cliproxyapi-sync.ts:83) is dead.** Never read; the test at cliproxyapi-sync.test.ts:51 even guards against reading it. The doc justifies keeping it as documentation of the response shape — acceptable, but if kept, a one-line `// ponytail: documented, intentionally unused` would signal intent. Nit.
- **`minimal: null` and `off: null` (cliproxyapi-sync.ts:505–506).** Provider has no `minimal` tier, so pi `minimal` collapses to the same value as `off`. Whether that's "minimal reasoning" or "reasoning off" depends on pi's consumer semantics for a `null` effort (omit param → provider default, vs. explicit off). By spec this is defensible; flagging only because `off` and `minimal` are now indistinguishable to the provider. Minor (depends on pi consumer, not verifiable here).
- **No case normalization in `extractReasoningLevels`.** `supported.has("low")` (:503–510) is case-sensitive; if the proxy ever returns `"Low"`/`"HIGH"`, the model would be flagged `reasoning:true` but every level maps to `null`. Low risk (CLIProxyAPI is controlled and lowercase), but a `.toLowerCase()` on accepted values would harden it. Nit.
- **Image models (criterion 6): not a bug.** `gpt-image-*` only gets `reasoning:true` if the proxy returns reasoning levels for it (it won't), or if its id matched the `-(minimal|low|medium|high|xhigh)$` suffix (it doesn't). Proxy is authoritative; no explicit guard is needed. ✓

---

### Acceptance