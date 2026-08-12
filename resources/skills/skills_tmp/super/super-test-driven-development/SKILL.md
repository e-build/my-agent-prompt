---
name: super-test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

> **Before claiming done:** re-run the full test suite and confirm it passes.

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## Prerequisites
- Active branch (not main) or user-confirmed intent to work on main
- Approved plan or clear task scope

## When to Use — Three Scenarios

Not every change requires the same TDD approach. Determine which scenario applies:

### Scenario 1: New Feature / New File

Full TDD cycle. No shortcuts.

1. Write a failing test
2. Watch it fail
3. Write minimal code to pass
4. Watch it pass
5. Refactor
6. Repeat

**This is the default.** If in doubt, use this scenario.

### Scenario 2: Modifying Code with Existing Tests

When changing code that already has test coverage:

1. Run existing tests — confirm green
2. Make your change
3. Run tests again — confirm still green
4. If your change isn't covered by existing tests, add a test for it
5. If existing tests already cover the changed behavior, you're done

**Key:** You must verify existing tests pass *before* and *after* your change. If you can't confirm test coverage, fall back to Scenario 1.

### Scenario 3: Trivial Change

For typo fixes, config tweaks, string changes, renames:

- Use judgment
- If relevant tests exist, run them after your change
- Don't write a new test for a string literal change

**Be honest:** If the change touches logic, it's not trivial. Use Scenario 1 or 2.

## Interpreting Runtime Warnings

The workflow monitor tracks your TDD phase and may inject warnings like:

```
⚠️ TDD: Writing source code (src/foo.ts) without a failing test.
```

**When you see this, pause and assess:**
- Which scenario applies to this change?
- If Scenario 2: run existing tests to confirm coverage, then proceed
- If Scenario 1: write a failing test first
- If Scenario 3: proceed, run tests after

The warning is a signal to think, not a hard stop.

## The Iron Law (Scenario 1)

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Delete means delete. Implement fresh from tests.

## Red-Green-Refactor

### RED — Write Failing Test

Write one minimal test showing what should happen.

**Requirements:**
- One behavior per test
- Clear name describing behavior (if the name contains "and", split it)
- Real code (no mocks unless unavoidable)
- Shows desired API — demonstrates how code should be called

#### Time-Dependent Behavior Testing

동작이 현재 날짜/시간에 의존하는 경우(past / today / future 분기), 테스트 fixture를 명시적으로 분리한다:

- **현재 상태 동작** (예: "출근 중" 카운트, "진행 중" 플래그)은 `today` fixture로만 테스트한다. 과거 날짜 fixture에 현재 상태 기대값을 두지 않는다.
- **과거 날짜 정책** (예: 완료/이력만 의미, 진행 중=0)은 별도 `past` fixture로 기대값을 검증한다.
- **미래 날짜 정책** (예: 예정/계획만 의미, 진행 상태=0)은 별도 `future` fixture로 검증한다.
- `today` 는 `LocalDate.now(zoneId)` 기반이어야 하며, 하드코딩된 과거 날짜를 `today` 로 가정하지 않는다 (코드가 작성된 날짜와 실행 날짜가 달라지면 테스트가 깨짐).

위반 사례: 과거 날짜 fixture에 `workingCount=1` 을 기대 → 정책상 과거는 working=0이므로 실패. 이 경우 fixture가 아니라 기대값이 잘못된 것이다.

**Good:**
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };
  const result = await retryOperation(operation);
  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

**Bad:**
```typescript
test('retry works', async () => {
  const mock = jest.fn().mockRejectedValueOnce(new Error()).mockResolvedValueOnce('ok');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(2);
});
```

### Verify RED — Watch It Fail

**MANDATORY. Never skip.**

Run the test. Confirm:
- Test **fails** (not errors from syntax/import issues)
- Failure message matches expectation
- Fails because the feature is missing (not because of typos)

**Test passes immediately?** You're testing existing behavior. Fix the test.
**Test errors instead of failing?** Fix the error, re-run until it fails correctly.

### GREEN — Minimal Code

Write the simplest code to pass the test. Nothing more.

Don't add features, refactor other code, or "improve" beyond what the test requires. If you're writing code that no test exercises, stop.

**Good:** Just enough to pass the test.
**Bad:** Adding options, config, generalization that no test asks for (YAGNI).

### Verify GREEN — Watch It Pass

**MANDATORY.**

Run the test. Confirm:
- New test passes
- All other tests still pass
- Output is pristine (no errors, no warnings)

**Test fails?** Fix code, not test.
**Other tests fail?** Fix now — don't move on with broken tests.

### REFACTOR — Clean Up

Only after green:
- Remove duplication
- Improve names
- Extract helpers

Keep tests green throughout. Don't add new behavior during refactor.

### Repeat

Next failing test for next behavior.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Keeping unverified code is technical debt. |
| "Keep as reference, write tests first" | You'll adapt it. That's testing after. Delete means delete. |
| "Need to explore first" | Fine. Throw away exploration, start with TDD. |
| "Test hard = design unclear" | Listen to test. Hard to test = hard to use. |
| "TDD will slow me down" | TDD faster than debugging. Pragmatic = test-first. |
| "Existing code has no tests" | You're improving it. Add tests for the code you're changing. |
| "This is different because..." | It's not. Follow the process. |

## Red Flags — STOP and Start Over

If you catch yourself doing any of these, stop immediately:

- Writing production code before the test
- Writing tests after implementation
- Test passes immediately (didn't catch the bug)
- Can't explain why test failed
- Rationalizing "just this once"
- "I already manually tested it"
- "Keep as reference" or "adapt existing code"
- "Already spent X hours, deleting is wasteful"
- "TDD is dogmatic, I'm being pragmatic"

**All of these mean: Delete code. Start over with TDD.**

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

Can't check all boxes? You skipped TDD. Start over.

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write wished-for API. Write assertion first. Ask your human partner. |
| Test too complicated | Design too complicated. Simplify interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup huge | Extract helpers. Still complex? Simplify design. |

## Debugging Integration

Bug found? Write failing test reproducing it. Follow TDD cycle. Test proves fix and prevents regression. Never fix bugs without a test.

## Testing Anti-Patterns

When adding mocks or test utilities, read `testing-anti-patterns.md` in this skill directory to avoid common pitfalls:
- Testing mock behavior instead of real behavior
- Adding test-only methods to production classes
- Mocking without understanding dependencies

## Reference

Read these in this skill directory on demand:
- `testing-anti-patterns.md` — mock/test pitfalls (testing mock behavior, test-only methods, incomplete mocks)
- `reference/rationalizations.md` — extended TDD rationalization discussion
- `reference/examples.md` — more good/bad code examples, bug fix walkthrough
- `reference/when-stuck.md` — extended solutions for common blockers

## Final Rule

```
Production code → test exists and failed first (Scenario 1)
Modifying tested code → existing tests verified before and after (Scenario 2)
Trivial change → relevant tests run after (Scenario 3)
```

No exceptions without your human partner's permission.

When the TDD cycle is complete (all tests green, code committed), you're done.
